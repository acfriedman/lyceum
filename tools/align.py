"""Word timings for a narration clip whose voice doesn't report them.

    python engine/tools/align.py <audio> <text-file> [<sentinel>]
      →  JSON {"words": [{"w", "s", "e"}], "missing": [skipped script words], "skipped": [[from, to]],
               "extra": [{"text", "s", "e"}], "tail": seconds | null}

Whisper transcribes the clip with word timestamps, and its transcript is matched back to the script
character by character (letters and digits only), so every timing carries the script's spelling,
which is what `cue()` searches. Matching characters rather than words survives Whisper splitting or
merging words ("non-deterministic", "hand written"). Numbers are spelled out on both sides first, so
"eight hundred" in the script matches "800" in the transcript, and "95th" matches "ninety-fifth". A
script word takes the span of the heard words its characters matched; a word that mostly didn't match
("nineteen forty" heard as "1,940") takes its time from its neighbours, spread evenly across the gap.

`missing` lists script words the voice evidently skipped: a run of five or more unmatched words, or
two at the very end, where TTS truncation happens. Some TTS models silently drop a clip's last
sentence, so the caller checks it. `skipped` gives the same runs as script word index ranges (`to`
exclusive), for a caller that splits the script, as one take of a whole talk is split into scenes.

`extra` lists what was heard but isn't in the script, with when: runs of three or more heard words
that matched nothing, as a person reading their own script ad-libs. (A voice reading the script never
does.)

A `sentinel` is text the caller appended to the voice's input after the script, to absorb a dropped
last sentence. It is aligned with the script, so it bounds the script's last words, then left out of
`words`; `tail` is when it starts, or null when it wasn't heard.
"""

import difflib
import json
import re
import sys

import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"
# A script word counts as heard when at least this share of its characters matched.
MATCHED_SHARE = 0.6


ONES = (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
    "sixteen seventeen eighteen nineteen"
).split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
SCALES = [(10**9, "billion"), (10**6, "million"), (1000, "thousand"), (100, "hundred")]
ORDINALS = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}
# A number as written: digits with thousands commas, a decimal part, an ordinal suffix, a percent sign.
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?(?:st|nd|rd|th)?%?")


def spell(n: int) -> str:
    """A whole number in words: 1940 → "one thousand nine hundred forty"."""
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    size, name = next((size, name) for size, name in SCALES if n >= size)
    rest = n % size
    return f"{spell(n // size)} {name}" + ("" if rest == 0 else " " + spell(rest))


def spoken_number(written: str) -> str:
    """A number as it's said: "95th" → "ninety fifth", "1.5" → "one point five", "54%" → "fifty four percent"."""
    percent = written.endswith("%")
    digits = written.rstrip("%")
    suffix = re.search(r"(st|nd|rd|th)$", digits)
    digits = digits[: suffix.start()] if suffix else digits
    whole, _, fraction = digits.replace(",", "").partition(".")
    words = spell(int(whole))
    if suffix:
        *head, last = words.split()
        last = ORDINALS.get(last) or (last[:-1] + "ieth" if last.endswith("y") else last + "th")
        words = " ".join([*head, last])
    if fraction:
        words += " point " + " ".join(ONES[int(d)] for d in fraction)
    return words + (" percent" if percent else "")


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", NUMBER.sub(lambda m: spoken_number(m.group()), word.lower()))


def chars_with_owner(words: list[str]) -> tuple[str, list[int]]:
    text, owner = [], []
    for index, word in enumerate(words):
        for ch in norm(word):
            text.append(ch)
            owner.append(index)
    return "".join(text), owner


def main() -> None:
    audio, text_path = sys.argv[1], sys.argv[2]
    spoken = open(text_path, encoding="utf-8").read().split()
    sentinel = sys.argv[3].split() if len(sys.argv) > 3 else []
    script = spoken + sentinel
    result = mlx_whisper.transcribe(audio, path_or_hf_repo=MODEL, word_timestamps=True, language="en", condition_on_previous_text=False)
    heard = [w for seg in result["segments"] for w in seg.get("words", [])]
    if not heard:
        raise SystemExit(f"{audio}: whisper heard no words")

    script_text, script_owner = chars_with_owner(script)
    heard_text, heard_owner = chars_with_owner([w["word"] for w in heard])
    matched_chars: list[list[int]] = [[] for _ in script]  # heard-word index per matched char
    heard_matched = [False] * len(heard)
    matcher = difflib.SequenceMatcher(a=script_text, b=heard_text, autojunk=False)
    for block in matcher.get_matching_blocks():
        for k in range(block.size):
            matched_chars[script_owner[block.a + k]].append(heard_owner[block.b + k])
            heard_matched[heard_owner[block.b + k]] = True

    # Unscripted speech: runs of heard words that matched nothing in the script.
    extra: list[str] = []
    i = 0
    while i < len(heard):
        j = i
        while j < len(heard) and not heard_matched[j]:
            j += 1
        if j - i >= 3:
            text = " ".join(w["word"].strip() for w in heard[i:j])
            extra.append({"text": text, "s": round(heard[i]["start"], 3), "e": round(heard[j - 1]["end"], 3)})
        i = max(j, i + 1)

    times: list[tuple[float, float] | None] = [None] * len(script)
    for index, word in enumerate(script):
        hits = matched_chars[index]
        if hits and len(hits) >= MATCHED_SHARE * max(1, len(norm(word))):
            times[index] = (heard[min(hits)]["start"], heard[max(hits)]["end"])

    # Skipped speech: long unmatched runs, or a short one at the end of the spoken text.
    missing: list[str] = []
    skipped: list[list[int]] = []
    i = 0
    while i < len(spoken):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(spoken) and times[j] is None:
            j += 1
        if j - i >= 5 or (j == len(spoken) and j - i >= 2):
            missing += spoken[i:j]
            skipped.append([i, j])
        i = j

    sentinel_hits = [k for k in range(len(spoken), len(script)) if times[k] is not None]
    tail = times[sentinel_hits[0]][0] if sentinel_hits else None

    # Unmatched words: spread evenly between the matched words on either side.
    duration = heard[-1]["end"]
    i = 0
    while i < len(script):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(script) and times[j] is None:
            j += 1
        start = times[i - 1][1] if i > 0 else 0.0
        end = times[j][0] if j < len(script) else duration
        step = max(end - start, 0.0) / (j - i)
        for k in range(i, j):
            times[k] = (start + step * (k - i), start + step * (k - i + 1))
        i = j

    words = [{"w": w, "s": round(s, 3), "e": round(e, 3)} for w, (s, e) in zip(script, times)][: len(spoken)]
    print(json.dumps({"words": words, "missing": missing, "skipped": skipped, "extra": extra, "tail": tail}))


if __name__ == "__main__":
    main()
