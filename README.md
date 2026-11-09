# Lyceum

Explainer videos made of animated, narrated diagrams, written like a screenplay and built by your coding agent.

## Watch
🎵 Turn sound on

https://github.com/user-attachments/assets/e58e9af7-205d-4981-9681-8e6d1ee16ba1

What Lyceum is and what using it is like, in under three minutes. The video was made with Lyceum: its
script and scenes are in [`explainers/`](explainers/videos/what-is-lyceum/script.md).

## How it works

A video starts as one `script.md`, a screenplay in Markdown: for each scene, what's on screen and what's
said. Lyceum voices each scene with text-to-speech and records when every word is spoken. Each scene is a
React component that times its animation to those words with `cue("spoken words")`, and Lyceum draws it
frame by frame in headless Chrome. An incremental renderer joins the scenes into an MP4 with subtitles. A
bundled agent skill drives the whole loop:
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
  - macOS `say`, the default: free, and nothing leaves your machine; or
  - an OpenAI API key (about $0.15 per 10-minute video); or
  - a Gemini API key (Google's Gemini text-to-speech).
- **[uv](https://docs.astral.sh/uv/)** for word timings: Lyceum aligns the narration with local Whisper,
  mlx-whisper on Apple Silicon and faster-whisper (on the CPU) anywhere else, such as Linux CI.
- **A coding agent** that reads [Agent Skills](https://agentskills.io): Claude Code, Codex CLI, Gemini
  CLI, Cursor, GitHub Copilot and others.

## Getting started

In the repository whose story you want to tell, or anywhere:

```bash
npx github:acfriedman/lyceum init lyceum   # creates lyceum/ as a Lyceum project
cd lyceum && npm install
npx lyceum skill link                       # gives your coding agent the Lyceum skill
```

`init` asks which voice narrates the project's videos: macOS's `say` (the default: free, and nothing
leaves your machine), OpenAI or Gemini. `--provider <name>` answers it up front.

Then ask your agent for a video: "make a 5-minute explainer on how our cache invalidation works." It's
happy to walk you through the rest, from `project.md` to your voice key.

A project depends on a Lyceum release (a `vX.Y.Z` tag). `lyceum` commands tell you when a newer one is
out (every six hours at most), and so does Claude Code when a chat starts, through a hook `lyceum init`
adds to `.claude/settings.json`; `npx lyceum version` checks now. Set `LYCEUM_NO_UPDATE_CHECK=1` to turn
that off. See
[the releases](https://github.com/acfriedman/lyceum/releases) for what changed.

Where should the project live, and what changes when a team shares it? See
[Setting up a project](docs/setting-up-a-project.md).

## A project

```
lyceum/
  lyceum.config.json       videos dir, cache dir, project guide, default voice, pronunciations
  project.md               what holds for every video: audience, ground truth, house rules
  package.json             depends on lyceum; maps "#kit" to lyceum/kit
  videos/index.ts          the registry (maintained by `lyceum scenes`)
  videos/<slug>/
    script.md              the source of truth: the video's intent, then scenes, visuals, narration
    scenes/                one component per scene, plus shared.tsx (the video's visual vocabulary)
    narration.json         generated: per-scene audio, word timings, timeline
    captions.srt           generated
    dist/                  renders: <slug>.mp4, <slug>.srt, scenes/<clip>.mp4 (gitignored)
  .cache/                  regenerable, gitignored: voice clips, review scratch
```

`lyceum.config.json`:

| Key | Default | Meaning |
| --- | --- | --- |
| `videos` | `"videos"` | where the videos live |
| `cache` | `".cache"` | where regenerable files go |
| `project` | `"project.md"` | the project guide the agent reads first (older projects: `brief`) |
| `voice` | `say` (`lyceum init` writes the voice you choose) | default voice, e.g. `{ "provider": "gemini" }` or `{ "provider": "openai", "id": "marin" }`; a voice without a `provider` is `say`'s |
| `voices` | `{}` | per provider, overrides of its voice wherever it's used, e.g. a pinned model: `{ "openai": { "model": "gpt-4o-mini-tts-2025-12-15" } }` |
| `providers` | none (`lyceum init` writes the voice you choose, `["say"]` unless you pick another) | the only voice providers narration may be sent to, e.g. `["openai", "say"]`. Until it's set, `narrate` sends nothing to a hosted voice (the local `say` still runs). Clips already cached are reused whatever their provider |
| `whisper` | mlx-whisper 0.4.3 on Apple Silicon, faster-whisper 1.2.1 elsewhere; both run `whisper-large-v3-turbo` at a fixed revision | the Whisper that times the words: `{ "backend": "mlx" \| "faster-whisper", "mlx": { "version", "model", "revision" }, "faster-whisper": { … } }`; `LYCEUM_ALIGNER` picks the backend for one run |
| `store` | none | an S3-compatible bucket (e.g. Cloudflare R2) that shares voiced clips and rendered scenes between machines, CI included, and holds what `lyceum publish` puts out: `{ "endpoint", "bucket", "public", "region", "prefix" }`. Credentials come from `LYCEUM_STORE_ACCESS_KEY_ID` and `LYCEUM_STORE_SECRET_ACCESS_KEY` |
| `coverage` | none | which tracked files must each have a video, from the repository's root: `{ "explains": "**/README.md", "exclude": ["Tests/**"] }`. A script names its file under `explains:`. `lyceum stale` lists files with no video and videos whose file is gone, and `lyceum embed` shows a video in its file as a thumbnail |
| `pronounce` | `{}` | written → spoken, for every script (a script's own map wins) |
| `allowSpoken` | `[]` | acronyms the narration check should allow |
| `captions` | `"track"` | `"track"`: subtitles viewers turn on; `"burned"`: drawn into the picture (a script's `captions:` wins) |
| `theme` | `"dark"` | `"dark"`: the dark canvas, for code explainers; `"paper"`: a light, formal look for presentations (a script's `theme:` wins) |

## Videos that keep themselves current

A video that explains a file, such as a README, can keep itself current, with no one reviewing it:
1. Give the project a `store`, an S3-compatible bucket such as Cloudflare R2. Narration and rendered
   scenes are shared through it, so CI never re-voices or redraws what hasn't changed, and published
   videos live there at fixed URLs.
2. Set `coverage`, e.g. every `README.md`.
3. Run `npx lyceum ci init`. It writes a GitHub workflow for every push to main, weekly, and by hand.
   It asks `lyceum stale` what needs work, and has Claude Code revise or make each video, unattended.
   `lyceum ship` checks the result and publishes it, and the changes land as a pull request that
   merges itself.

Each file shows its video as a thumbnail (`lyceum embed`). A video that fails a check keeps the copy
published before, and the run opens an issue. The workflow needs the store's keys, the voice's key and
`CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, on your Claude subscription) as Actions secrets.

## Licensing

Lyceum is [MIT](LICENSE). Its dependencies are under permissive licenses (MIT, Apache 2.0, ISC and BSD),
and the bundled CMU Serif and JetBrains Mono fonts under the SIL Open Font License.
