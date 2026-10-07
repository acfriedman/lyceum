# Working on Lyceum

Guidance for coding agents (and people) changing Lyceum itself. To *make videos* with Lyceum, use the
skill in `skills/lyceum/SKILL.md` instead.

## What this is

Lyceum turns a `script.md` into a narrated explainer video: text-to-speech per scene with word timings,
Remotion scenes timed to the words, and an incremental renderer. It's a package that **projects**
depend on. A project is any directory with `lyceum.config.json`; it holds the videos, and Lyceum holds
the engine.

```
bin/lyceum.mjs      the `lyceum` command: dispatches to tools/
tools/              one file per command, plus paths.mjs (the layout, described once), slots.mjs
                    (machine-wide memory caps), script.mjs (script.md parsing), align.py (Whisper word
                    alignment), chrome.mjs (Lyceum's renderer: frames drawn in headless Chrome) and
                    bundle.mjs (Remotion bundling and aliases)
kit/                what scenes import as "#kit": timing (cue.tsx), the frame clock, primitives, theme
                    and the stage, plus the page Lyceum's renderer draws in and Remotion's compositions
fonts/              CMU Serif and JetBrains Mono (SIL Open Font License)
skills/lyceum/      the agent skill (Agent Skills format: SKILL.md + references/)
.claude-plugin/     packages the skill as a Claude Code plugin and marketplace
```

## How a project and the package meet

- **Scenes** import `"#kit"`, which the project's `package.json` `imports` field maps to `lyceum/kit`, the
  package's `kit/scene.ts`.
- **The registry:** the kit imports the project's `videos/index.ts` as `"@lyceum/videos"`, an alias set in
  `tools/chrome.mjs` (and in `tools/bundle.mjs` for Remotion). The project's `tsconfig.json` sets the
  same alias in `paths`.
- **Single copies:** `react` and `react-dom` (and `remotion`, under Remotion) resolve to one copy, so the
  kit and the scenes never load two.
- **Paths:** `tools/paths.mjs` finds the project (the nearest `lyceum.config.json`, or `LYCEUM_PROJECT`).
  Per-project caches live in the project's `.cache/`. Machine-wide state (the Whisper venv, slot locks)
  lives in the Lyceum home directory (`LYCEUM_HOME`, else `~/Library/Caches/lyceum` or
  `~/.cache/lyceum`).

## Rules for changes

- **Keep the narration cache stable.** Clips are cached by a hash of the voice object and the spoken text.
  Changing a default voice's fields, or their key order, re-bills every project's narration.
- **Render fingerprints:** they include every kit file, and with `--engine lyceum` the pinned Chrome build
  (`CHROME_BUILD` in `tools/chrome.mjs`). Changing either re-renders every scene of every project once.
  That's correct, but say so in the commit.
- **Keep the two renderers drawing the same frames.** Scenes depend on what Remotion's page does: every
  element is border-box, and Chrome runs at the render's scale. `tools/chrome.mjs` reproduces both. After
  changing the kit, the renderer's page or its Chrome switches, make a contact sheet with each engine:
  they should match byte for byte.
- **Respect the memory caps.** Anything that loads a Whisper model, drives a browser or runs `tsc` takes
  a slot from `tools/slots.mjs`. Never add a heavy step outside one.
- **Check your changes:**
  - `npm run typecheck` type-checks the kit on its own, against `kit/videos.stub.ts`.
  - Exercise tool changes in a real project: `npm install --install-links <path to this repo>` there,
    then `npx lyceum stills …` and `npx lyceum render …`, with and without `--engine lyceum`.
- **Keep the skill agent-neutral.** Don't name one agent's tools in `skills/`. Write "if your agent can
  run subagents…", not a specific tool name.
- **Licenses:** Lyceum is MIT. Remotion has its own license (free for individuals and small companies);
  don't vendor Remotion code.
