#!/usr/bin/env node
// Writes scenes/waveform.json, so the scenes draw the real recording: the talk's waveform as peaks, where
// each scene was cut from it (from narration.json), and each scene's own clip as it plays (cut from its
// take, cleaned and levelled), for scenes that draw their own audio. A scene recorded again on its own
// keeps its place in the talk from the last run, marked with its retake. Re-run after re-recording or
// re-narrating:
//
//   node videos/your-own-voice/waveform.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const narration = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const talk = join(here, "recordings", "_talk.m4a");
const out = join(here, "scenes", "waveform.json");
// Where each scene sat in the talk last time: a retaken scene's narration no longer says.
const before = existsSync(out) ? Object.fromEntries(JSON.parse(readFileSync(out, "utf8")).scenes.map((s) => [s.id, s])) : {};

// Peaks per second of audio: enough for a frame-wide waveform with bars a few pixels apart.
const RATE = 8000;
const PER_SECOND = 40;

/** An audio file's peaks, PER_SECOND a second, and its length in seconds. */
function peaksOf(path) {
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], {
    maxBuffer: 1 << 30,
  });
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const peaks = [];
  for (let n = 0; (n * RATE) / PER_SECOND < samples.length; n++) {
    const start = Math.round((n * RATE) / PER_SECOND);
    const end = Math.min(samples.length, Math.round(((n + 1) * RATE) / PER_SECOND));
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
    peaks.push(peak);
  }
  return { peaks, duration: samples.length / RATE };
}
const round = (peaks, loudest) => peaks.map((p) => Number((p / loudest).toFixed(3)));

const { peaks, duration } = peaksOf(talk);
const loudest = Math.max(...peaks);
// The clips as they play, from the project's narration audio; scaled together, so their heights compare.
const PUBLIC = join(here, "..", "..", ".cache", "public");
const clips = narration.scenes.map((s) => ({ id: s.id, ...peaksOf(join(PUBLIC, s.audio)) }));
const clipsLoudest = Math.max(...clips.flatMap((c) => c.peaks));

/** A scene's span in the talk, and the take it's narrated from instead, if it was recorded again. */
function place(s) {
  if (s.take.from !== undefined) return { from: s.take.from, to: s.take.to, retake: null };
  const last = before[s.id];
  if (!last) throw new Error(`${s.id} was recorded on its own before the talk was ever split: no place for it in the talk`);
  return { from: last.from, to: last.to, retake: s.take.file };
}

writeFileSync(
  out,
  JSON.stringify({
    duration,
    perSecond: PER_SECOND,
    peaks: round(peaks, loudest),
    scenes: narration.scenes.map((s) => ({ id: s.id, title: s.title, ...place(s) })),
    clips: Object.fromEntries(clips.map((c) => [c.id, { duration: c.duration, peaks: round(c.peaks, clipsLoudest) }])),
  }) + "\n",
);
console.log(`scenes/waveform.json: ${peaks.length} peaks over ${duration.toFixed(1)} s, ${narration.scenes.length} scenes, and their clips`);
