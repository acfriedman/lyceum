# Lyceum

Narrated, 3Blue1Brown-style explainer videos, written as a script and built by your coding agent.

A video starts as one `script.md`. Lyceum voices each scene with text-to-speech and records when every
word is spoken. Each scene is a React component ([Remotion](https://www.remotion.dev)) that times its
animation to those words with `cue("spoken words")`. An incremental renderer joins the scenes into an MP4
with subtitles. A bundled agent skill drives the whole loop:
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
- **A voice:**
  - an OpenAI API key (default voice, about $0.15 per 10-minute video); or
  - an ElevenLabs key; or
  - macOS `say`, free, for drafts.
- **Apple Silicon and [uv](https://docs.astral.sh/uv/)** for word timings with the OpenAI or `say`
  voices: Lyceum aligns them with local Whisper (mlx-whisper). ElevenLabs reports timings itself, so it
  works anywhere.
- **A coding agent** that reads [Agent Skills](https://agentskills.io): Claude Code, Codex CLI, Gemini
  CLI, Cursor, GitHub Copilot and others. Optional; every step can be run by hand.

## Licensing

- **Lyceum** is [MIT](LICENSE). The bundled CMU Serif fonts are under the SIL Open Font License.
- **Remotion,** which Lyceum renders with, has [its own license](https://www.remotion.dev/license):
  - free for individuals, non-profits and companies of up to three people;
  - larger companies need a Remotion Company License.

  That applies to you if you use Lyceum. Check it before using Lyceum at work.

## Getting started

In the repository whose story you want to tell, or anywhere:

```bash
npx github:acfriedman/lyceum init explainers   # creates explainers/ as a Lyceum project
cd explainers && npm install
npx lyceum skill link                           # gives your coding agent the Lyceum skill
```

Then edit `explainers/brief.md`: who the audience is, where the facts come from, and any house rules.
Put your voice key in the environment or in a `.env` at or above the project:
- `OPENAI_KEY` or `OPENAI_API_KEY`;
- `ELEVEN_LABS_KEY` or `ELEVENLABS_API_KEY`.

Now ask your agent for a video ("make a 5-minute explainer on how our cache invalidation works").

**Claude Code** can also install the skill as a plugin:

```
/plugin marketplace add acfriedman/lyceum
/plugin install lyceum@lyceum
```

`lyceum skill link` links the skill for every agent whose directory exists in your home folder
(`~/.claude`, `~/.codex`, `~/.agents`). Two options change that:
- `--agent claude,codex` picks the agents;
- `--project <repo>` links it into one repository instead.

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

## By hand

| Command | Does |
| --- | --- |
| `lyceum new <slug> "<Title>"` | starts `videos/<slug>/script.md` |
| `lyceum narrate <slug> [--provider openai\|elevenlabs\|say] [--only <scene>]` | voices the script; writes `narration.json` and `captions.srt`. Clips are cached by voice and text, so only changed text is billed. |
| `lyceum scenes <slug>` | scaffolds scene components and writes per-scene briefs, word timings and the kit API to `.cache/work/<slug>/` |
| `lyceum stills <slug> <scene> --at 1,4,8` | a contact sheet of frames, to check layout and timing without video |
| `lyceum render <slug> [--scene <id> [--draft]]` | renders stale scenes, then joins them with narration and subtitles |
| `lyceum studio` | Remotion Studio, to scrub every video with audio |
| `lyceum typecheck` | type-checks the scenes |

A script is one `## NN · id — Title` per scene, then `> Visual:` lines (the animation brief), then
narration paragraphs written for the ear. Frontmatter can set `pronounce:`, `allow_spoken:`, `voice:` and
`timing:`.

Video is 1920×1080 at 30 fps. Scenes express every duration in seconds × `fps`, so the frame rate stays a
setting.

## Memory

Speech alignment loads a Whisper model per job, and rendering drives a headless browser. Lyceum caps both
for the whole machine, across every project, so parallel scene agents and overlapping commands queue
instead of exhausting memory. The caps scale with RAM: on 16 GB, two alignments, one render or stills
job, and two type-checks.
