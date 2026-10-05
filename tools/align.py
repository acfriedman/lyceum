"""Word timings for a narration clip whose voice doesn't report them.

    python engine/tools/align.py <audio> <text-file> [<sentinel>]
      →  JSON {"words": [{"w", "s", "e"}], "missing": [skipped script words], "tail": seconds | null}

Whisper transcribes the clip with word timestamps, and its transcript is matched back to the script
character by character (letters and digits only), so every timing carries the script's spelling,
which is what `cue()` searches. Matching characters rather than words survives Whisper splitting or
merging words ("non-deterministic", "hand written"). A script word takes the span of the heard words
its characters matched; a word that mostly didn't match ("a hundred and sixty" heard as "160") takes
its time from its neighbours, spread evenly across the gap.

`missing` lists script words the voice evidently skipped: a run of five or more unmatched words, or
two at the very end, where TTS truncation happens. Some TTS models silently drop a clip's last
sentence, so the caller checks it.

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


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


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
    matcher = difflib.SequenceMatcher(a=script_text, b=heard_text, autojunk=False)
    for block in matcher.get_matching_blocks():
        for k in range(block.size):
            matched_chars[script_owner[block.a + k]].append(heard_owner[block.b + k])

    times: list[tuple[float, float] | None] = [None] * len(script)
    for index, word in enumerate(script):
        hits = matched_chars[index]
        if hits and len(hits) >= MATCHED_SHARE * max(1, len(norm(word))):
            times[index] = (heard[min(hits)]["start"], heard[max(hits)]["end"])

    # Skipped speech: long unmatched runs, or a short one at the end of the spoken text.
    missing: list[str] = []
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
    print(json.dumps({"words": words, "missing": missing, "tail": tail}))


if __name__ == "__main__":
    main()
