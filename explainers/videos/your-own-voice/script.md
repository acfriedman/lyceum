---
title: "Narrate it yourself"
status: draft 1
updated: 2026-10-10
captions: burned
# Andrew narrates this video himself: the whole talk in recordings/_talk.m4a, and any scene recorded
# again on its own in recordings/<scene-id>.m4a.
voice: { provider: recorded }
# The files this video explains, one per line: `- path (what the video takes from it)`.
# `lyceum stale` watches them; `lyceum stale --mark your-own-voice` records the commit they were checked at.
sources:
  - tools/narrate.mjs (the recorded voice: the whole talk in recordings/_talk, split into scenes halfway through the pauses between them, trimmed to the words, brought to one loudness; a scene's own take wins over its part of the talk; takes cached by their contents; the "doesn't say all of the script" error and the "isn't in the script" warning, word for word)
  - tools/align.py (every word of the take matched to the script; runs of unheard script words; runs of heard words the script doesn't have)
  - skills/lyceum/SKILL.md (the own-voice workflow: one take, then fix a scene by recording it alone)
  - tools/new-video.mjs (the script template's commented recorded-voice line)
---

<!--
Format: one `## NN · id — Title` per scene. `> Visual:` lines describe the animation; every other
paragraph is narration, spoken in order. This video's narration is Andrew's own recording, so it is
written the way he talks: change any wording to what he'd actually say, before he records. The intent
above the first scene is never narrated.
-->

# Intent

- **Point:** you can narrate a Lyceum video in your own voice, without giving up what makes Lyceum
  work: every element still arrives on its words. Record the whole talk in one take, then fix any scene
  by recording just that scene again.
- **For:** the project's audience, with an eye to people who present: an update for their team, a talk,
  a demo. They know what a script is; they don't care how audio is aligned.
- **Angle:** the video demonstrates itself. It's narrated by Andrew, recorded with this feature, so the
  first scene says so, and the last calls back to it. In between: why a person is harder to time to than
  a synthetic voice, how one take becomes scenes, how a fix works, and the three steps.
- **Length:** about two minutes.
- **Notes:**
  - First person throughout: "I" is Andrew.
  - The running visual is the talk's waveform: drawn live in scene 1, cut into scenes in scene 3,
    patched in scene 4, whole again in scene 5. Once the talk is recorded, it's the real waveform of
    `recordings/_talk.m4a` (peaks generated into a JSON file beside the scenes); until then,
    illustrative.
  - Terminal text is Lyceum's real output, quoted from tools/narrate.mjs, for this video's slug.
  - The scene id `fix-a-scene` in scene 4's on-screen error is this video's real fourth scene, used as
    the example; the skipped words shown are illustrative.

## 01 · my-voice — This voice is mine

> Visual: The centre of the frame is a recording strip: a waveform drawing on from left to right in
> time with the narration, a small red "recording" dot pulsing at its left end. On "not a synthetic
> one", a dim label "text-to-speech" appears above the strip and is struck through. On "timed every
> animation to my words", the words of that sentence appear above the waveform one by one, each with a
> thin tick down to the spot in the waveform where it's spoken. On "a talk, a demo, an update for your
> team", three cards rise beneath the strip, one per phrase.

You're hearing my voice, not a synthetic one. I read this script out loud, once, and Lyceum timed every
animation to my words.

That matters when the video is yours to present: a talk, a demo, an update for your team. People
listen differently to someone they know.

## 02 · not-a-script — A person isn't a script

> Visual: Two lanes, one above the other, sharing a time axis. Top lane, labelled "synthetic voice":
> three tidy blocks, one per scene, edge to edge, each under its scene's label. On "a person doesn't",
> the bottom lane, labelled "you", starts drawing the same three scenes, but: on "pause to think" a gap
> opens inside the first block; on "isn't in the script" an extra block, labelled "unscripted", pushes
> in; on "trip over a line" a stretch turns the warning colour, labelled "fluffed". On "stitched
> together", the bottom lane splits into three separate clips with visible seams, their heights
> mismatched.

Lyceum puts each element on screen at the moment its words are spoken. A synthetic voice reads the
script exactly, scene by scene.

A person doesn't. I pause to think. I say something that isn't in the script. Sometimes I trip over a
line. And recording every scene separately makes the whole thing sound stitched together.

## 03 · one-take — One take, cut into scenes

> Visual: The whole talk's waveform spans the frame, labelled `recordings/_talk.m4a`. Above it, the
> five scene titles of this video. On "matches every word", ticks fall from the titles' words onto the
> waveform, left to right. On "cuts the take into scenes", a vertical cut line drops into each pause
> between scenes, halfway through it. On "next slide", a small block in one gap, labelled "next
> slide", fades out with the gap. On "trimmed", each scene's clip shrinks to its words, leaving a sliver
> of silence either side. On "same volume", the clips' heights even out.

So I record the whole talk in one go. Lyceum listens to it and matches every word to the script. Then
it cuts the take into scenes, in the pauses between them.

Anything I say between scenes, like next slide, falls in a gap and is dropped. Each scene is trimmed,
and brought to the same volume.

## 04 · fix-a-scene — Fix one scene

> Visual: A terminal panel types Lyceum's real error for this video:
> `videos/your-own-voice/recordings/_talk.m4a doesn't say all of the script:` then
> `  fix-a-scene: skips "…"`. On "record just that scene", a file tree `recordings/` shows `_talk.m4a`
> and gains `fix-a-scene.m4a`. On "replaces that part", the scene-3 strip returns below: the fourth clip
> lifts out and a new clip slots into its place, in the accent colour; on "stays as it was", the other
> clips each get a small "unchanged" mark. On "warns me", the terminal prints the real warning:
> `fix-a-scene: heard "…", which isn't in the script (the captions won't show it)`.

If I stumble, Lyceum tells me which scene, and which words it didn't hear. I record just that scene
again, and it replaces that part of the take. Everything else stays as it was.

If I say something the script doesn't have, it keeps the audio, but warns me, because the captions
won't show it.

## 05 · three-steps — Three steps

> Visual: Three numbered steps, left to right. On "add one line", step 1: a script's frontmatter with
> the line `voice: { provider: recorded }` highlighted. On "recordings folder", step 2: the tree
> `videos/your-own-voice/recordings/_talk.m4a`. On "run narrate", step 3: a terminal,
> `npx lyceum narrate your-own-voice`, then its real first line, `aligning
> videos/your-own-voice/recordings/_talk.m4a against the script…`. On "started as one take", the steps
> fade and the waveform from scene 1 returns, whole, with this video's five scene cuts marked; on
> "timed to it", the five scene titles settle above their clips.

To narrate a video yourself, add one line to the script, saying the voice is recorded. Record the whole
talk into the recordings folder. Then run narrate, just as you would with a synthetic voice.

This video started as one take. Everything you just watched is timed to it.
