#!/usr/bin/env node
// Writes scenes/waveform.json: the talk's waveform as peaks, and where each scene was cut from it (from
// narration.json), so the scenes draw the real recording. Re-run after re-recording or re-narrating:
//
//   node videos/your-own-voice/waveform.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const narration = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const talk = join(here, "recordings", "_talk.m4a");

// Peaks per second of talk: enough for a frame-wide waveform with bars a few pixels apart.
const RATE = 8000;
const PER_SECOND = 40;
const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", talk, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], {
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
const loudest = Math.max(...peaks);

writeFileSync(
  join(here, "scenes", "waveform.json"),
  JSON.stringify({
    duration: samples.length / RATE,
    perSecond: PER_SECOND,
    peaks: peaks.map((p) => Number((p / loudest).toFixed(3))),
    scenes: narration.scenes.map((s) => ({ id: s.id, title: s.title, from: s.take.from, to: s.take.to })),
  }) + "\n",
);
console.log(`scenes/waveform.json: ${peaks.length} peaks over ${(samples.length / RATE).toFixed(1)} s, ${narration.scenes.length} scenes`);
