---
title: "Where your videos live"
status: approved by Andrew 2026-10-08, voice cedar
updated: 2026-10-08
# Written form → spoken form, applied only to the text sent to the voice.
pronounce: {}
sources:
  - docs/setting-up-a-project.md (the guide this video follows)
  - tools/stale.mjs (spotting stale videos: sources, verified:, and the commits since)
  - package.json (Lyceum's dependencies: react 19, puppeteer-core, esbuild, typescript 7)
  - tools/chrome.mjs (the renderer loads the project's own React when it can resolve one)
  - tools/init.mjs (what init creates: lyceum.config.json, project.md, videos/index.ts, package.json, tsconfig.json, .gitignore; its printed output)
  - tools/skill.mjs (skill link: per user by default, --project for one repository; "linked" and "skipped … already exists" output)
  - tools/narrate.mjs (keys from the environment or the nearest .env; clips cached in .cache/)
  - tools/stills.mjs and tools/render.mjs (stills need only narration.json; render needs the clips in .cache/public)
  - explainers/ (a real in-repository project: .gitignore, what-is-lyceum's committed files total 132 KB)
verified: "051a9d4a9b42"
---

<!--
Format: one `## NN · id — Title` per scene. `> Visual:` lines describe the animation; every other
paragraph is narration, spoken in order. The narration is the only text sent to TTS, so it is
written for the ear: no identifiers that read badly aloud, short sentences. The intent above the
first scene is never narrated.
-->

# Intent

- **Point:** Lyceum lives in its own small project, never in your app's dependencies. Put that project
  beside the code it explains, unless the videos span several repositories. And before a team shares
  it, know that the narration audio stays on the machine that voiced it.
- **For:** someone who has decided to try Lyceum and is about to set it up: mostly engineers, on a team
  or alone. Commands and file names belong on screen. Narration stays plain: no "React", "Chrome",
  "npm", "node_modules".
- **Angle:** starts from the first practical question, "where do the videos go?", and the tempting
  wrong answer. Then the right shape, the two places it can live, per-machine setup, and what changes
  with a team. Ends on the opening repository tree, now set up properly.
- **Length:** just under four minutes.
- **Notes:**
  - The running visual is a repository tree, `your-app/`, drawn the same way in scenes 1, 2, 3 and 7.
  - The other repositories in scene 4 (`api/`, `web/`, `mobile/`) are illustrative.
  - Everything shown as command output is Lyceum's real output (see tools/init.mjs, tools/skill.mjs).
  - This video follows docs/setting-up-a-project.md. Where they disagree, fix one of them.

## 01 · where — Where do the videos go?

> Visual: Left: a repository tree, `your-app/`, with `src/`, `tests/` and `package.json`. A small
> `script.md` page drifts in at the right with a question mark. On "your app's dependencies",
> `package.json` opens beside the tree, its `"dependencies"` block gaining the line `"lyceum": …`. On
> "a whole toolchain", four package chips cascade out beneath it: `react 19`, `puppeteer-core`,
> `esbuild`, `typescript 7`. On "can collide", the app's own line `"react": "^18.3.1"` highlights in the
> warning colour against the `react 19` chip, with a small label "the kit runs on your app's version".
> On "Go or Swift", the tree swaps to `your-service/` with `go.mod` and `main.go`: no `package.json`,
> and the `"lyceum"` line fades with nowhere to go.

You want explainer videos about your code. The first question is where they live.

The tempting answer is to add Lyceum to your app's dependencies, like any other tool. But Lyceum
brings a whole toolchain with it: a browser driver, a bundler, a type checker, and an interface
library. Where your app uses the same tools, the versions can collide. And if your app is written in
Go or Swift, there's no dependencies file to add it to at all.

## 02 · own-project — A small project of its own

> Visual: The `your-app/` tree returns. At the top, a terminal line types on:
> `npx lyceum init explainers`. On "creates a folder", `explainers/` grows beside `src/`, and its
> children appear one by one, matching init's real output: `lyceum.config.json`, `project.md`,
> `videos/index.ts`, `package.json`, `tsconfig.json`, `.gitignore`. On "its own dependencies",
> `explainers/package.json` highlights with `"lyceum": "github:acfriedman/lyceum"`. On "a guide for the
> agent", `project.md` highlights; on "a folder for videos", `videos/`. On "never sees", a dashed
> boundary draws around `explainers/`. On "monorepo", three labels approach the boundary from outside,
> "workspaces", "root type check", "lint and continuous integration", and each stops short of it with a
> small "excluded" mark.

Instead, give the videos a small project of their own. Lyceum's setup command creates a folder,
usually called explainers, with its own dependencies, a guide for the agent, and a folder for the
videos. Your app never sees any of it.

In a JavaScript monorepo, keep that folder out of the workspace, and out of the root type check,
linting and continuous integration. It installs and checks itself.

## 03 · beside-the-code — In the repository it explains

> Visual: The tree: `your-app/` with `src/` and `explainers/` side by side. On "ground truth",
> `project.md` opens to its "Ground truth" heading with the line "the code in `..`" and an arrow from
> `explainers/` to `src/`. On "same commit", a commit chip, `a1b2c3d`, spans both folders. On "a diff",
> a script's frontmatter shows `sources: src/cache/`; on "since the video", its `verified: a1b2c3d`
> line highlights and the video's card gains a "may be stale" tag. Below it the command
> `npx lyceum stale cache` reports the video stale and lists two commits (simplified from its real
> output). On "it's light", a bar: "what-is-lyceum, committed: 132 KB" (script, scenes, timings), beside
> greyed-out `.cache/` and `dist/` labelled "gitignored". On "noise", a pull request card, "Fix cache
> eviction", lists its changed files; one of them is a scene file under `explainers/`, dimmed.

If the videos explain one codebase to the people who work on it, put that folder in the same
repository, and treat it like documentation.

The agent's ground truth is right next door, at the same commit the video describes, in any checkout.
Spotting a stale video is just a diff: each script lists the code it explains, and the history shows
what has changed since the video was checked. And it's light. What gets committed is the scripts, the
scenes and the narration timings: a little over a hundred kilobytes for a three-minute video. The cost is a little noise in
your pull requests.

## 04 · own-repository — Or a repository of its own

> Visual: Three repository boxes in a row: `api/`, `web/`, `mobile/`. On "a repository of their own",
> a fourth box, `product-explainers/`, appears above them; on "span several repositories", arrows draw
> down from it into all three. On "someone other than", three audience chips line up beside it: "new
> hires", "customers", "you, learning". On "by path", its `project.md` opens to "Ground truth" listing
> `../api/`, `../web/`, `../mobile/`. On "side by side", the four boxes slide into one folder,
> `~/code/`, as siblings. On "write that down", a highlighted line appears in `project.md`: "Check
> these out side by side in ~/code/."

Give the videos a repository of their own when they span several repositories, or a whole product.
The same goes when they're for someone other than the code's contributors, or they're your own
learning material.

Then the project guide points at the other repositories by path. So every author needs them checked
out side by side, in the same layout. Write that down in the guide.

## 05 · each-machine — Set up each machine

> Visual: A laptop outline, with two numbered steps on its screen. Step 1, "the skill", types the
> command `npx lyceum skill link`, and its real output appears: `linked ~/.claude/skills/lyceum →
> …/explainers/node_modules/lyceum/skills/lyceum`, drawn as an arrow from the user's skill folder into
> one project. On "two projects", a second project, `other-app/explainers` (a newer Lyceum), appears;
> its link attempt prints `skipped … already exists`, and its arrow can't reach the skill folder. On
> "for one repository", the command changes to `npx lyceum skill link --project ..` and the arrow now
> starts at `your-app/.claude/skills/lyceum`, which gains a `.gitignore` tag on "out of version
> control". Step 2, "a voice key", shows `explainers/.env` with `OPENAI_KEY=…` masked, tagged
> "ignored" on "ignores it".

Each author sets up their own machine. First, give the coding agent the skill. By default, it's linked
for your whole user account, pointing at one project's copy of Lyceum. With two projects on different
versions, the agent only sees the first. So link it for one repository instead, and keep the link out
of version control, since it points at your own install.

Second, a voice key. Keep it in a key file inside the project, and make sure version control ignores
it.

## 06 · sharing — What travels with the project

> Visual: Two columns. Left, "in the repository": `script.md`, `scenes/`, `narration.json` (word
> timings), `captions.srt`. Right, "only on your machine": `.cache/` (voice clips) and `dist/` (videos).
> On "a teammate", a second laptop appears and receives only the left column. On "contact sheets", it
> produces a small grid of stills with a check mark. On "rendering the video", a "render" button on it
> greys out with the note "needs the voice clips". On "a different take", two waveforms of the same
> sentence stack up, visibly different lengths; beneath them, a scene's timeline shows an animation
> marker sliding away from its "reviewed" position. On "one person own", the first laptop gains a badge,
> "narration and final render", and on "pull requests", an arrow labelled "pull request" runs from the
> teammate's laptop to it.

Now the part to know before you share with a team. The scripts, the scenes and the word timings travel
with the repository. The narration audio doesn't. It stays on the machine that voiced it.

A teammate who clones the project can still build scenes and check them on contact sheets, because
those only need the timings. But rendering the video needs the audio. Voicing it again costs money and
gives a different take. The timing shifts, and animations drift away from what was reviewed.

So for now, let one person own the narration and the final render. Everyone else sends changes as pull
requests.

## 07 · recap — Where viewers find them

> Visual: `dist/` with its "gitignored" tag; three arrows fan out from it to "release assets", "a
> documentation site" and "the pull request it explains". On "the pull request", that one enlarges: a
> pull request description with a video player embedded. On "write the answer", `project.md` opens to
> its "Delivery" heading. On "So:", everything clears and the opening `your-app/` tree returns, now with
> `explainers/` beside `src/`, and four items tick on beside it in turn: "its own project" on "own small
> project", "beside the code" on "beside the code", "skill linked per repository" on "per repository",
> "one owner for the voice" on "owns the voice".

Last, decide where viewers find the videos, because the finished renders aren't committed either.
Release assets, a documentation site, or attached to the pull request that changes what the video
explains. Write the answer in the project guide.

So: the videos get their own small project, beside the code they explain. The skill is linked per
repository. And one person owns the voice.
