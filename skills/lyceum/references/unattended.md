# Unattended runs

Read this when nobody is waiting to review your work: CI, a scheduled job, `LYCEUM_UNATTENDED` set in
the environment, or a user who says they won't review the videos. It changes the workflow in
`SKILL.md` in a few places and leaves the rest as written. The project guide still wins where it
speaks.

The trade the user made: the videos go out unreviewed, so you are the only reviewer. Mechanical gates
(`lyceum ship`) stop a broken video, but only you can stop a wrong one.

## What changes

- **No stops.** Skip step 3's review gate and never ask a question: nobody will answer. Decide from the
  project guide, the file the video explains, and the code.
- **Ground truth is the file and the code it names.** A video with `explains:` tells the story of that
  file: what it says, made concrete with the code it points to (types, functions, tests, history).
  Name those code paths under `sources:` along with the file, so `stale` watches them. Name real
  files or directories, not the whole repository.
- **Accuracy over completeness.** Check every claim against the code at the current commit. If you
  can't confirm something, leave it out. A shorter true video beats a longer one with a guess in it.
- **Length:** let the file set it, unless the project guide does. A short page (a module's README) is
  about 1–2 minutes in 3–4 scenes; a repository's main README about 3–5 minutes. Don't pad.
- **Review yourself.** Step 7 is not optional: look at every scene's contact sheet, fix what's wrong,
  and look again. Check the title card too (`stills <slug> _title`).
- **Never change the project's settings:** not the config, voice pins, providers, Whisper or the kit.
  Use the project's voice: don't pass `--provider`. If narration fails ("still missing words" after retries), stop: don't switch
  providers.
- **Stay inside the project.** Edit only the project's files. The one exception is the block
  `lyceum embed` writes into the explained file. Don't commit or push: whatever ran you does that.

## The tasks

`npx lyceum stale --json` says what each video needs.

- **`missing`:** a file with no video. Make one under the suggested slug:
  `npx lyceum new <slug> "<Title>" --explains <path>`. Then follow the workflow from step 2 (research)
  to step 7 (review).
- **`stale`:** follow "Keep it current" in `SKILL.md`. Most diffs change nothing the video says; then
  marking it is the whole job.
- **`unpublished`** (from `lyceum ci`): the video exists, but its current version never went out, because
  an earlier run stopped partway. Treat its script and scenes as a draft: check the claims, review every
  contact sheet (the earlier run may never have seen one), fix what's wrong, then finish.
- **`orphaned`:** the file is gone. Delete the video's directory, and remove its two imports and its
  entry from `videos/index.ts`. Nothing else: its published copy stays where it is.

## Finish each video

```bash
npx lyceum stale --mark <slug>   # you checked it against the current commit
npx lyceum ship <slug>           # narrate, typecheck, render, check, publish, embed
```

`ship` stops at the first gate that fails and says which, and the published video stays as it was. Fix
the cause and run `ship` again. If the same gate fails twice, stop working on that video: leave it as
it is and report why.

End with one line per video: its slug, then `published <url>`, `marked current`, `removed`, or
`failed at <gate>: <reason>`.
