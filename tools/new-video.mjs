#!/usr/bin/env node
// Starts a new video: a directory with a script.md template to fill in.
//
//   lyceum new <slug> "<Title>"
//
// Then write the script, narrate it, and run `lyceum scenes` to scaffold the scene components.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VIDEOS } from "./paths.mjs";
const [slug, title = slug] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: lyceum new <kebab-slug> "<Title>"');
  process.exit(2);
}
const dir = join(VIDEOS, slug);
if (existsSync(dir)) {
  console.error(`videos/${slug}/ already exists`);
  process.exit(1);
}
mkdirSync(dir);
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(dir, "script.md"),
  `---
title: ${JSON.stringify(title)}
status: draft 1
updated: ${today}
# Written form → spoken form, applied only to the text sent to the voice.
pronounce: {}
# Subtitles: a track viewers turn on, or \`captions: burned\` to draw them into the picture.
# captions: burned
# The look: the dark canvas, or \`theme: paper\`, a light, formal look for presentations.
# theme: paper
# Your own voice instead of text-to-speech: the whole talk in recordings/_talk.m4a, and any scene
# recorded again on its own in recordings/<scene-id>.m4a.
# voice: { provider: recorded }
# The files this video explains, one per line: \`- path (what the video takes from it)\`.
# \`lyceum stale\` watches them; \`lyceum stale --mark ${slug}\` records the commit they were checked at.
sources: []
---

<!--
Format: one \`## NN · id — Title\` per scene. \`> Visual:\` lines describe the animation; every other
paragraph is narration, spoken in order. The narration is the only text sent to TTS, so it is
written for the ear: no identifiers that read badly aloud, short sentences. The intent above the
first scene is never narrated.
-->

# Intent

- **Point:** the one thing a viewer should leave knowing.
- **For:** only if this video's audience differs from the project's.
- **Angle:** where it starts and what it builds up to.
- **Length:** about … minutes.
- **Notes:** sources, constraints or ideas only this video has.

## 01 · cold-open — Title

> Visual: …

Narration…
`,
);
console.log(`videos/${slug}/script.md created`);
