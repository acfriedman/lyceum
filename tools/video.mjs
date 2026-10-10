// A narrated video as the renderer sees it: the clips it's drawn as (the title card, then one per
// scene), how its captions are delivered, and what the page needs to draw each clip.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSrt } from "./captions.mjs";
import { frontmatter } from "./script.mjs";
import { CONFIG, videoDir, videoSlug } from "./paths.mjs";

/** The title card's clip id. Scene ids are `[a-z0-9-]+`, so it can't collide with one. */
export const TITLE = "_title";

/** How long the title card holds before the first scene. */
const TITLE_SECONDS = 2.5;

/** The longest pause a burned-in caption stays on screen across, waiting for the next. */
const HOLD_SECONDS = 0.5;

const CAPTIONS = ["track", "burned"];

/**
 * A video's narration and settings, read from its directory:
 *   narration  narration.json as narrate wrote it
 *   title      the script's `title:` (else the slug), shown on the title card
 *   captions   "track" or "burned": the script's `captions:`, else the project's
 *   theme      the kit theme it's drawn in (kit/theme.ts): the script's `theme:`, else the project's
 *   cues       captions.srt's cues, on the narration's timeline (seconds, before the title card)
 *   lead       the title card's length in frames: everything after it starts that much later
 *   clips      what the video is drawn as, in order: `{ id, frames, audio, leadInFrames }`, the
 *              title card (no audio) and then the scenes
 */
export function loadVideo(video) {
  const slug = videoSlug(video);
  const dir = videoDir(video);
  const narration = JSON.parse(readFileSync(join(dir, "narration.json"), "utf8"));
  const { meta } = frontmatter(readFileSync(join(dir, "script.md"), "utf8"));
  const captions = meta.captions ?? CONFIG.captions;
  if (!CAPTIONS.includes(captions)) {
    throw new Error(`${slug}: captions must be ${CAPTIONS.map((c) => `"${c}"`).join(" or ")}, not ${JSON.stringify(captions)}`);
  }
  const lead = Math.round(TITLE_SECONDS * narration.fps);
  return {
    slug,
    dir,
    narration,
    title: String(meta.title ?? slug),
    captions,
    theme: String(meta.theme ?? CONFIG.theme),
    cues: parseSrt(readFileSync(join(dir, "captions.srt"), "utf8")),
    lead,
    clips: [{ id: TITLE, frames: lead, audio: null, leadInFrames: 0 }, ...narration.scenes],
  };
}

/**
 * What the page needs to draw one clip, beyond the narration it already has: the title card's text and
 * length, or a scene's burned-in captions in scene-relative frames (none when they're a track).
 */
export function pageOptions(v, id) {
  if (id === TITLE) return { title: { text: v.title, frames: v.lead }, captions: [] };
  const scene = v.narration.scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`${v.slug}: no scene "${id}"`);
  if (v.captions !== "burned") return { captions: [] };
  const fps = v.narration.fps;
  const captions = v.cues
    .map((c) => ({ from: Math.round(c.s * fps) - scene.from, to: Math.round(c.e * fps) - scene.from, text: c.text }))
    .filter((c) => c.to > 0 && c.from < scene.frames);
  // A caption holds until the next one across a short pause, so it doesn't blink off between sentences.
  for (const [i, c] of captions.entries()) {
    const next = captions[i + 1];
    if (next && next.from - c.to < HOLD_SECONDS * fps) c.to = next.from;
  }
  return { captions };
}
