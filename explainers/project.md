# Explainer project: Lyceum

Videos about Lyceum itself, made with Lyceum. Read before writing any script. Where this guide and the
Lyceum skill disagree, this guide wins.

## Audience

Knowledge workers at technical companies: mostly engineers, but also designers, product managers and
anyone who wants to explain something precisely. They know what a coding agent is. They don't care how
Lyceum renders frames. Lead with why and what it's like to use, not how it's built.

## Ground truth

All paths are relative to the Lyceum repository (this project's parent directory):
- `README.md` and `skills/lyceum/SKILL.md`: what Lyceum does and the workflow it drives.
- `tools/`: the commands, when a claim needs checking.
- `../haruspec-org/haruspec-proj-mgmt/explainers/` (on Andrew's machine only): the first real project, seven videos explaining a
  software engine's internals. Its scripts are real examples to show on screen.

## House rules

- **Plain language.** No implementation jargon in narration: no "React", "headless Chrome", "Whisper",
  "ffmpeg". Code and file names may appear on screen when they show what using Lyceum is like.
- **No acronyms or shortenings** in narration, beyond everyday ones.
- **"Lyceum":** leave it to the voice (LIE-see-um).
- **Show, don't claim.** Wherever possible, show the real artifact: a real script, a real scene, a real
  contact sheet.

## Review and delivery

- **Gates:** show Andrew the arc before narrating.
- **Delivery:** send the finished MP4 to him directly. The README video is his to upload.
- **Commits:** sources go to Lyceum's main, with no branch or pull request, and only when he asks.
- **Staleness routine:** a scheduled agent runs `npx lyceum stale` here. For each video whose claims
  went out of date it opens one pull request, on the branch `explainers/stale-<slug>`; when a check finds
  nothing to change, it pushes only the `verified:` update to main. It never narrates or renders: Andrew
  does that after checking out the branch. These are the only pull requests and the only pushes made
  without his asking.
- **Verified:** when Andrew approves a video, set its `verified:` with `npx lyceum stale --mark <slug>`.
- **Revisions:** Andrew reviews rendered MP4s. Re-render only the scene he points at
  (`npm run render -- <video> --scene <id>`, `--draft` for 720p), and the whole video once he approves.
