# Working on Lyceum

Guidance for coding agents (and people) changing Lyceum itself. To *make videos* with Lyceum, use the
skill in `skills/lyceum/SKILL.md` instead.

## What this is

Lyceum turns a `script.md` into a narrated explainer video: text-to-speech per scene with word timings,
React scenes timed to the words, and an incremental renderer that draws them in headless Chrome. It's a
package that **projects**
depend on. A project is any directory with `lyceum.config.json`; it holds the videos, and Lyceum holds
the engine.

```
bin/lyceum.mjs      the `lyceum` command: dispatches to tools/
tools/              one file per command, plus paths.mjs (the layout, described once), slots.mjs
                    (machine-wide memory caps), script.mjs (script.md parsing), align.py (Whisper word
                    alignment) and chrome.mjs (the renderer: the kit's page, bundled with esbuild and
                    drawn frame by frame in headless Chrome)
kit/                what scenes import as "#kit": timing (cue.tsx), the frame clock, primitives, theme
                    and the stage, plus the page the renderer draws them in (page.tsx)
fonts/              CMU Serif and JetBrains Mono (SIL Open Font License)
skills/lyceum/      the agent skill (Agent Skills format: SKILL.md + references/)
.claude-plugin/     packages the skill as a Claude Code plugin and marketplace
```

## How a project and the package meet

- **Scenes** import `"#kit"`, which the project's `package.json` `imports` field maps to `lyceum/kit`, the
  package's `kit/scene.ts`.
- **The registry:** the kit imports the project's `videos/index.ts` as `"@lyceum/videos"`, an alias set in
  `tools/chrome.mjs`. The project's `tsconfig.json` sets the same alias in `paths`.
- **Single copies:** `react` and `react-dom` resolve to one copy, so the kit and the scenes never load two.
- **Paths:** `tools/paths.mjs` finds the project (the nearest `lyceum.config.json`, or `LYCEUM_PROJECT`).
  Per-project caches live in the project's `.cache/`. Machine-wide state (the Whisper venv, slot locks)
  lives in the Lyceum home directory (`LYCEUM_HOME`, else `~/Library/Caches/lyceum` or
  `~/.cache/lyceum`).

## Rules for changes

- **Keep the narration cache stable.** Clips are cached by a hash of the voice object and the spoken text.
  Changing a default voice's fields, or their key order, re-bills every project's narration.
- **Render fingerprints:** they include every kit file and the pinned Chrome build (`CHROME_BUILD` in
  `tools/chrome.mjs`). Changing either re-renders every scene of every project once. That's correct, but
  say so in the commit.
- **The page is part of every scene's look.** Scenes were laid out with every element border-box and
  Chrome drawing at the render's scale, and `tools/chrome.mjs` sets both. A change to the page, its CSS or
  Chrome's switches can move every scene by a pixel: compare a scene's contact sheet before and after
  (`cmp` on the PNGs), and expect them to match unless the change meant to alter the look.
- **Respect the memory caps.** Anything that loads a Whisper model, drives a browser or runs `tsc` takes
  a slot from `tools/slots.mjs`. Never add a heavy step outside one.
- **Check your changes:**
  - `npm run typecheck` type-checks the kit on its own, against `kit/videos.stub.ts`.
  - Exercise tool changes in a real project: `npm install --install-links <path to this repo>` there,
    then `npx lyceum stills …` and `npx lyceum render …`.
- **Keep the skill agent-neutral.** Don't name one agent's tools in `skills/`. Write "if your agent can
  run subagents…", not a specific tool name.
- **Licenses:** Lyceum is MIT, and its dependencies should stay permissive (MIT, Apache 2.0, ISC, BSD).
  Don't copy code from Remotion, which Lyceum used to render with: its license isn't MIT.
