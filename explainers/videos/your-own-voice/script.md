---
title: "Narrate it yourself"
status: draft 3, written to be read a line per breath
updated: 2026-10-10
captions: burned
# Andrew narrates this video himself: the whole talk in recordings/_talk.m4a, and any scene recorded
# again on its own in recordings/<scene-id>.m4a.
voice: { provider: recorded }
# The files this video explains, one per line: `- path (what the video takes from it)`.
# `lyceum stale` watches them; `lyceum stale --mark your-own-voice` records the commit they were checked at.
sources:
  - tools/narrate.mjs (the recorded voice: the whole talk in recordings/_talk, split into scenes halfway through the pauses between them, trimmed to the words, room noise taken out, brought to one loudness; a scene's own take wins over its part of the talk; the "doesn't say all of the script" error and the "isn't in the script" warning, word for word)
  - tools/align.py (every word of the script found in the take, with when it was said)
  - kit/cue.tsx (each element placed at the moment its words are spoken)
  - tools/script.mjs (narration written as a bulleted list, a line per breath, reads as one paragraph)
  - skills/lyceum/SKILL.md (the own-voice workflow: shape the script to be read, record one take, fix a scene by recording it alone)
---

<!--
Format: one `## NN · id — Title` per scene. `> Visual:` lines describe the animation. The narration is
a bulleted list, a line per breath: Andrew reads it top to bottom, pausing at each bullet. The bullets
are only its shape; the lines run on as one paragraph. The intent above the first scene is never
narrated.
-->

# Intent

- **Point:** you can narrate a Lyceum video in your own voice, reading from a script, and keep what
  makes Lyceum work: every element still arrives on its words. Write the script a line per breath, read
  it in one take, and fix any scene by recording just that scene again.
- **For:** the project's audience, with an eye to people who present: an update for their team, a talk,
  a demo.
- **Angle:** the video demonstrates itself. Andrew reads this very script in one take, and the first
  and last scenes say so. The arc follows what it takes to read your own narration: a script that's
  easy to read aloud, animations timed to your pace rather than a synthetic voice's, one take cut into
  scenes, a fix for the line you fumble, and how to try it.
- **Length:** about two and a half minutes.
- **Notes for Andrew, recording:** read each bullet as one breath, and pause at the end of it. Leave a
  slightly longer beat between scenes; anything said in that gap, like "next slide", is cut out. If a
  line goes wrong, say it again and keep going: we'll fix that scene afterwards.
- **Notes for the scenes:**
  - The running visual is the take's real waveform (`scenes/waveform.json`, from `waveform.mjs`).
  - Scene 3 shows the real times Andrew said its words, from narration.json.
  - Terminal text is Lyceum's real output, quoted from tools/narrate.mjs, for this video's slug.
  - The skipped and unscripted words shown in scene 5's terminal are illustrative.

## 01 · my-voice — This voice is mine

> Visual: The centre of the frame is a recording strip: a waveform drawing on from left to right in
> time with the narration, a small red "recording" dot pulsing beside it. On "a synthetic voice", a dim
> label "text-to-speech" appears above the strip; on "you're hearing me" it's struck through. On "a
> talk, a demo, an update for your team", three cards rise beneath the strip, one per phrase. On "timed
> every animation to my words", the words of that phrase appear above the waveform one by one, each
> with a thin tick down to the spot in the waveform where it's spoken.

- Hey, my name is Andrew, and in this video I want to talk about using your own voice with Lyceum.
- A synthetic voice is great when you need a video fast,
- or you'd rather not record yourself.
- But when the video is yours to present,
- a talk, a demo, an update for your team,
- people listen differently to someone they know.
- So this time, you're hearing me.
- I read this script out loud, once,
- and Lyceum timed every animation to my words.

## 02 · read-aloud — Written to be read aloud

> Visual: On "long sentences", this scene's narration appears as one dense paragraph of prose, with a
> small breath gauge under it draining as it's read; on "sound read", the paragraph greys. On "short
> lines", the same words reflow into a bulleted list, a line per breath, each line ending in a small
> pause mark; on "one breath", the pause marks light up in turn. On "more like talking", the real
> waveform of this scene draws beneath the list, its gaps lining up with the pause marks.

- Reading a script out loud is harder than it sounds.
- Long sentences run out of breath,
- and the words start to sound read.
- So I wrote this as short lines, like bullet points.
- Each line is one breath, and I pause at the end of it.
- I'm still reading every word,
- but it sounds less like reading, and a little bit more like talking.

## 03 · timed-to-you — Timed to my voice

> Visual: Two lanes sharing a time axis, the same line of words in each. Top lane, labelled "synthetic
> voice": the words of "I speed up, I slow down, I take a breath" evenly spaced, an element ready above
> each. On "my voice doesn't", the bottom lane, labelled "you", places the same words at the real times
> Andrew said them (from narration.json): bunched where he sped up, spread where he slowed, a gap at the
> breath. On "finds every word", a dashed line runs from each word of the script to where it was heard.
> On "that's where its animation lands", the elements drop from the top lane's evenly spaced spots to
> the bottom lane's real ones, each landing as its word is said.

- Lyceum puts each element on screen at the moment its words are spoken.
- A synthetic voice tells it exactly when that is.
- My voice doesn't.
- I speed up, I slow down, I take a breath.
- So Lyceum listens to my take, and finds every word of the script in it.
- Wherever I said a word, that's where its animation lands.

## 04 · one-take — One take, cut into scenes

> Visual: On "scene by scene", three short clips side by side with visible seams and mismatched heights,
> labelled "recorded scene by scene", which fade. Then the whole talk's waveform spans the frame,
> labelled `recordings/_talk.m4a`, with this video's six scenes marked above it. On "cuts the take into
> scenes", a vertical cut line drops into each pause between scenes, halfway through it. On "next
> slide", a small block in one gap, labelled "next slide", fades out with the gap. On "trimmed", each
> scene's clip shrinks to its words. On "room noise", the faint fuzz between words in each clip fades
> away. On "same volume", the clips' heights even out.

- I record the whole talk in one go.
- Recording scene by scene would sound stitched together.
- Lyceum cuts the take into scenes, in the pauses between them.
- Anything I say between scenes, like next slide, falls in a gap and is dropped.
- Each scene is trimmed,
- the room noise is cleaned out,
- and every scene is brought to the same volume.

## 05 · fix-a-scene — Fix one scene

> Visual: A terminal panel types Lyceum's real error for this video:
> `videos/your-own-voice/recordings/_talk.m4a doesn't say all of the script:` then
> `  fix-a-scene: skips "…"`. On "record just that scene", a file tree `recordings/` shows `_talk.m4a`
> and gains `fix-a-scene.m4a`. On "replaces that part", the strip of six clips below: the fifth clip
> lifts out and a new clip slots into its place, in the accent colour; on "stays as it was", the other
> clips each get a small "unchanged" mark. On "warns me", the terminal prints the real warning:
> `fix-a-scene: heard "…", which isn't in the script (the captions won't show it)`.

- Nobody reads two minutes without a slip.
- If I stumble, Lyceum tells me which scene, and which words it didn't hear.
- I record just that scene again, and it replaces that part of the take.
- Everything else stays as it was.
- And if I say something the script doesn't have, it keeps the audio,
- but warns me, because the captions won't show it.

## 06 · three-steps — Three steps

> Visual: Three numbered steps. On "short lines", step 1: a scene of this very script, its narration a
> bulleted list; on "add one line", the frontmatter line `voice: { provider: recorded }` is highlighted
> above it. On "recordings folder", step 2: the tree `videos/your-own-voice/recordings/_talk.m4a`. On
> "run narrate", step 3: a terminal, `npx lyceum narrate your-own-voice`, then its real first line,
> `aligning videos/your-own-voice/recordings/_talk.m4a against the script…`. On "started as one take",
> the steps fade and the whole take's waveform returns, with this video's six scene cuts marked; on
> "timed to it", the six scene numbers settle above their clips.

- To narrate a video yourself, write the script as short lines, one per breath,
- and add one line at the top, saying the voice is recorded.
- Record the whole talk into the recordings folder.
- Then run narrate, just as you would with a synthetic voice.
- This video started as one take.
- Everything you just watched is timed to it.
