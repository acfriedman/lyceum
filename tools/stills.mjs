#!/usr/bin/env node
// Renders frames of one scene into a single contact sheet, so layout and timing can be checked
// without rendering video (and by a reviewer that can read an image but can't watch one).
//
//   lyceum stills <video> <scene-id> [--every <seconds> | --at <s1,s2,…>]
//
// Output: .cache/work/<video>/stills/<scene-id>.png. The individual frames are temporary.

import { renderStill, selectComposition } from "@remotion/renderer";
import { holdSlot } from "./slots.mjs";
import { bundleProject } from "./bundle.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { ROOT, videoSlug, workDir } from "./paths.mjs";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? undefined : argv[i + 1];
};
const [videoArg, scene] = argv;
if (!videoArg || !scene || scene.startsWith("--")) {
  console.error("usage: lyceum stills <video> <scene-id> [--every <s> | --at <s1,s2>]");
  process.exit(2);
}
const video = videoSlug(videoArg);

await holdSlot("remotion");
const serveUrl = await bundleProject();
const composition = await selectComposition({ serveUrl, id: `${video}--${scene}` });
const fps = composition.fps;
const last = composition.durationInFrames - 1;
const every = Number(opt("every") ?? 4);
const frames = opt("at")
  ? opt("at").split(",").map((s) => Math.min(last, Math.round(Number(s) * fps)))
  : Array.from({ length: Math.floor(last / (every * fps)) + 1 }, (_, i) => Math.round(i * every * fps));

const tmp = mkdtempSync(join(tmpdir(), "explainer-stills-"));
try {
  for (const [i, frame] of frames.entries()) {
    await renderStill({ composition, serveUrl, frame, output: join(tmp, `${String(i).padStart(3, "0")}.png`), scale: 0.5 });
  }
  const dir = join(workDir(video), "stills");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${scene}.png`);
  const columns = Math.min(3, frames.length);
  const rows = Math.ceil(frames.length / columns);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", "1", "-i", join(tmp, "%03d.png"),
    "-vf", `tile=${columns}x${rows}:padding=8:color=0x444444`,
    "-frames:v", "1", out,
  ]);
  console.log(`${frames.length} stills (${frames.map((f) => (f / fps).toFixed(1) + "s").join(", ")}) → ${relative(ROOT, out)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
