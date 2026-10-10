"""What a narrator said in a take, word by word, to compare with the script they read from.

    python transcribe.py <audio> [<prompt-file>]
      →  JSON {"words": [{"w", "s", "e"}]}

A `prompt` primes Whisper with the video's vocabulary (its title and scene titles), so names
come out spelled as the script spells them. Whisper only carries it through its first window of audio,
so a later name may still come out misheard.
"""

import json
import sys

import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"


def main() -> None:
    audio = sys.argv[1]
    prompt = open(sys.argv[2], encoding="utf-8").read().strip() if len(sys.argv) > 2 else None
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=MODEL,
        word_timestamps=True,
        language="en",
        condition_on_previous_text=False,
        initial_prompt=prompt or None,
    )
    words = [
        {"w": w["word"].strip(), "s": round(w["start"], 3), "e": round(w["end"], 3)}
        for seg in result["segments"]
        for w in seg.get("words", [])
        if w["word"].strip()
    ]
    print(json.dumps({"words": words}))


if __name__ == "__main__":
    main()
