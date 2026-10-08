# Setting up a project

This guide covers where your videos should live, how to install Lyceum next to your code, and what to know
before you share a project with a team.

## Keep Lyceum out of your app

A Lyceum project is its own small Node package: a directory with `lyceum.config.json` and a `package.json`
that depends on Lyceum. Create it with `lyceum init`. Don't add Lyceum to your application's own
`package.json`:
- **Dependencies:** Lyceum brings React 19, puppeteer-core, esbuild and TypeScript 7. None of them belong in
  your app's dependency graph.
- **React's version:** the renderer loads the project's own React when it can find one. Inside your app's
  tree, the kit would run on your app's React version, not the one it was built for.
- **Any language:** a Swift, Go or Python repository has no `package.json` to add Lyceum to. A nested project
  works the same everywhere.

In a JavaScript monorepo, keep the project out of the way:
- leave it out of the `workspaces` globs (or `pnpm-workspace.yaml`), so it installs on its own;
- exclude it from the root `tsconfig.json` and from lint, formatter and CI globs. Scenes import `#kit` and
  `@lyceum/videos`, which only resolve inside the project. `npx lyceum typecheck` checks them there.

## In the code repository, or a repository of its own

The deciding question is what the videos are tied to.

**Put them in the code repository** (`explainers/` beside `src/`) when they explain that codebase to the
people who work on it. Treat them like `docs/`:
- **Ground truth is `..`.** The agent reads the code at the same commit the video describes, in any checkout
  or worktree.
- **Spotting stale videos is a diff.** A script lists the paths it explains under `sources:`, and its
  `verified:` records the commit it was last checked at. `npx lyceum stale` lists, for each video, the
  commits that touched those paths since.
- **It's light.** What's committed is scripts, scene components and narration timings: a few hundred
  kilobytes per video. The caches and MP4s are gitignored.
- **The costs:** scene changes add noise to code pull requests, and every contributor clones a folder
  they may never open.

**Give them a repository of their own** when the videos:
- span several repositories, or a whole product;
- are for someone other than the code's contributors, such as customers or new hires;
- are your own learning material.

In that case, the Ground truth section of `project.md` names the other checkouts by relative path
(`../api/`, `../web/`). Every author then needs those repositories checked out side by side in the same
layout, so say so in `project.md`. In a script's `sources:`, a path into one of them starts with its
directory name (`api/src/cache.ts`), and `lyceum stale` checks it in that checkout.

**The default:** an `explainers/` directory in the repository, for videos about one codebase. Use a
dedicated repository for videos that cover several repositories or a whole product.

## Give your agent the skill

`npx lyceum skill link` links the skill into your user's skill directories, so the agent sees it in every
project on the machine. Each link points into one project's `node_modules/lyceum`, though. If you have two
projects on different Lyceum versions, the agent only sees the copy you linked first.

To link the skill for a single repository, run this from the project:

```bash
npx lyceum skill link --project ..
```

This creates `.claude/skills/lyceum` in the repository root, plus `.codex/` or `.agents/` where those
directories exist, so an agent working anywhere in the repository finds the skill. The link is an absolute
path into your `node_modules`, so gitignore it. Each contributor runs the command once.

## Voice keys

`narrate` reads keys from the environment, or else from the nearest `.env` at or above the project. Inside
a code repository, that can be the app's own `.env`. To keep the voice key separate, put a `.env` in the
project itself. `lyceum init` gitignores it.

## Sharing with a team

What's committed is the script, the scenes, `narration.json` (durations and word timings) and the
captions. What isn't committed is the narration audio, which lives in `.cache/`, and the renders.

**Narration stays on the machine that voiced it.** A teammate can clone the project, build and change
scenes, and check them with `lyceum stills`: contact sheets only need the committed timings. Rendering an
MP4 needs the audio, though. Running `narrate` on a fresh clone voices every scene again, which re-bills
the voice. OpenAI's voice also never says a line the same way twice, so durations and word timings shift,
and every `cue` that was reviewed can drift. Until Lyceum can share approved takes:
- let one person own narration and final renders;
- have everyone else send script and scene changes as pull requests, checked with contact sheets.

**Decide where viewers find the videos.** `videos/*/dist/` is gitignored, so write the answer under
Delivery in `project.md`. Common choices:
- release assets;
- a docs site;
- attached to the pull request that changes what the video explains.
