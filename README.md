# Lyceum

Narrated explainer videos, written as a script and built by your coding agent.

A video starts as one `script.md`. Lyceum voices each scene with text-to-speech and records when every
word is spoken. Each scene is a React component that times its animation to those words with
`cue("spoken words")`, and Lyceum draws it frame by frame in headless Chrome. An incremental renderer
joins the scenes into an MP4 with subtitles. A bundled agent skill drives the whole loop:
- research the topic;
- write the script, and stop for your review;
- narrate;
- set the visual style and build the first scene;
- build the remaining scenes in parallel;
- review every scene from its contact sheet;
- render.

Lyceum grew out of making explainers about a software engine's internals, so it's at its best explaining
code and systems. Nothing in it is specific to code, though.

## Requirements

- **Node 20+** and **ffmpeg** (with `ffprobe`) on your path.
- **Disk space for a headless Chrome,** which the first render downloads (about 95 MB, 190 MB unpacked):
  Google's Chrome for Testing, pinned, once per machine, into Lyceum's cache directory.
- **A voice:**
  - an OpenAI API key (default voice, about $0.15 per 10-minute video); or
  - an ElevenLabs key; or
  - macOS `say`, free, for drafts.
- **Apple Silicon and [uv](https://docs.astral.sh/uv/)** for word timings with the OpenAI or `say`
  voices: Lyceum aligns them with local Whisper (mlx-whisper). ElevenLabs reports timings itself, so it
  works anywhere.
- **A coding agent** that reads [Agent Skills](https://agentskills.io): Claude Code, Codex CLI, Gemini
  CLI, Cursor, GitHub Copilot and others.

## Getting started

In the repository whose story you want to tell, or anywhere:

```bash
npx github:acfriedman/lyceum init explainers   # creates explainers/ as a Lyceum project
cd explainers && npm install
npx lyceum skill link                           # gives your coding agent the Lyceum skill
```

Then ask your agent for a video: "make a 5-minute explainer on how our cache invalidation works." It's
happy to walk you through the rest, from the project's brief to your voice key.

## A project

```
explainers/
  lyceum.config.json       videos dir, cache dir, brief, default voice, pronunciations
  brief.md                 what the agent reads first: audience, ground truth, house rules
  package.json             depends on lyceum; maps "#kit" to lyceum/kit
  videos/index.ts          the registry (maintained by `lyceum scenes`)
  videos/<slug>/
    script.md              the source of truth: scenes, visual briefs, narration
    scenes/                one component per scene, plus shared.tsx (the video's visual vocabulary)
    narration.json         generated: per-scene audio, word timings, timeline
    captions.srt           generated
    dist/                  renders: <slug>.mp4, <slug>.srt, scenes/<scene>.mp4 (gitignored)
  .cache/                  regenerable, gitignored: voice clips, review scratch
```

`lyceum.config.json`:

| Key | Default | Meaning |
| --- | --- | --- |
| `videos` | `"videos"` | where the videos live |
| `cache` | `".cache"` | where regenerable files go |
| `brief` | `"brief.md"` | the project brief the agent reads first |
| `voice` | OpenAI `cedar` | default voice, e.g. `{ "provider": "elevenlabs" }` or `{ "id": "marin" }` |
| `pronounce` | `{}` | written → spoken, for every script (a script's own map wins) |
| `allowSpoken` | `[]` | acronyms the narration check should allow |

## Licensing

Lyceum is [MIT](LICENSE). Its dependencies are under permissive licenses (MIT, Apache 2.0, ISC and BSD),
and the bundled CMU Serif and JetBrains Mono fonts under the SIL Open Font License.
