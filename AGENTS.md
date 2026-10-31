# Working on Lyceum

Guidance for coding agents (and people) changing Lyceum itself. To *make videos* with Lyceum, use the
skill in `skills/lyceum/SKILL.md` instead.

## What this is

Lyceum turns a `script.md`, a screenplay in Markdown, into an explainer video of animated, narrated
diagrams: text-to-speech per scene with word timings, React scenes timed to the words, and an
incremental renderer that draws them in headless Chrome. It's a package that **projects** depend on.
A project is any directory with `lyceum.config.json`; it holds the videos, and Lyceum holds the engine.

```
bin/lyceum.mjs      the `lyceum` command: dispatches to tools/
tools/              one file per command, plus paths.mjs (the layout, described once), slots.mjs
                    (machine-wide memory caps), script.mjs (script.md parsing), captions.mjs (SubRip),
                    video.mjs (a video as the renderer sees it: the title card, the scenes, its caption
                    setting), align.py (Whisper word alignment) and chrome.mjs (the renderer: the kit's
                    page, bundled with esbuild and drawn frame by frame in headless Chrome)
kit/                what scenes import as "#kit": timing (cue.tsx), the frame clock, primitives, theme
                    and the stage, plus the page the renderer draws them in (page.tsx)
fonts/              CMU Serif and JetBrains Mono (SIL Open Font License)
skills/lyceum/      the agent skill (Agent Skills format: SKILL.md + references/)
.claude-plugin/     packages the skill as a Claude Code plugin and marketplace
scripts/            maintainer scripts, not shipped: sync-version.mjs (run by `npm version`)
.github/workflows/  release.yml: a pushed vX.Y.Z tag becomes a GitHub Release
explainers/         a Lyceum project of videos about Lyceum, made with this checkout (`file:..`): the
                    README's video. Not part of the published package
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
- **The Whisper pin:** `WHISPER` in `tools/narrate.mjs` pins the mlx-whisper release and the model's
  revision, and a project can override it under `whisper`. Each release gets its own venv in the Lyceum
  home directory. Changing the pin doesn't re-align clips already cached, only new ones.
- **Render fingerprints:** they include every kit file and the pinned Chrome build (`CHROME_BUILD` in
  `tools/chrome.mjs`). Changing either re-renders every scene of every project once. That's correct, but
  say so in the commit.
- **The page is part of every scene's look.** Scenes were laid out with every element border-box and
  Chrome drawing at the render's scale, and `tools/chrome.mjs` sets both. A change to the page, its CSS or
  Chrome's switches can move every scene by a pixel: compare a scene's contact sheet before and after
  (`cmp` on the PNGs), and expect them to match unless the change meant to alter the look.
- **Themes share their keys.** Every palette in `kit/theme.ts` has the same colours: a new one goes in
  every theme. Don't change a theme's existing values casually: every video drawn in it changes.
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

## Releases

Projects depend on a release, not on main: `lyceum init` writes `github:acfriedman/lyceum#semver:^X.Y.Z`
(`tools/version.mjs`), and npm resolves the range against the repository's tags. Every six hours at
most, a `lyceum` command checks the tags and prints a line if a newer release exists; the skill tells the
agent to pass it on. `lyceum version --hook` checks every time and prints only when one exists, with what
to do about it: `lyceum init` runs it from a Claude Code session-start hook in the repository's
`.claude/settings.json`, so a fresh chat hears about a release before any command runs. The check is
skipped in CI, with `LYCEUM_NO_UPDATE_CHECK` set, and in a git checkout.

- **What the number means.** Major: a change that breaks existing scenes or projects (the `#kit` API,
  `script.md`'s format, `lyceum.config.json`'s keys). Minor: new features. Patch: fixes. While Lyceum is
  0.x, a breaking change bumps the minor instead, which `^0.Y.Z` keeps projects from taking unasked.
- **Cutting one.** On an up-to-date main: `npm version patch|minor|major`, which bumps package.json and
  `.claude-plugin/plugin.json` in one commit and tags it, then `git push --follow-tags`. The release
  workflow checks the tag against both manifests and publishes a GitHub Release with generated notes.
- **Say what it costs.** Edit the release's notes to flag anything that re-renders every scene (kit or
  `CHROME_BUILD` changes) or re-bills narration (voice defaults).
