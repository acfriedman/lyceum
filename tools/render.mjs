#!/usr/bin/env node
// Renders a video incrementally: every scene to its own MP4, then the scenes joined into the video.
//
//   lyceum render <video>                     render stale scenes, then assemble the video
//   lyceum render <video> --scene <id>        render one scene (if stale), e.g. as soon as it passes review
//   lyceum render <video> --scene <id> --draft    a quick 720p preview of one scene
//
// Output: videos/<video>/dist/<video>.mp4 (captions as a soft subtitle track) and its .srt;
// scenes in videos/<video>/dist/scenes/<id>.mp4, each with a .json fingerprint beside it.
//
// A scene is stale when its fingerprint changes: its own file, the non-scene files in its scenes/
// directory (shared.tsx and helpers), the kit, its narration (audio, words, timeline), its number
// and title, and the render settings. Rendering scenes as they pass review means the final call
// only joins them. Each scene file carries its own audio, so it doubles as a preview; the video's
// audio track is rebuilt from the narration clips, which is exact and keeps the join a stream copy.

import { renderMedia, selectComposition } from "@remotion/renderer";
import { holdSlot } from "./slots.mjs";
import { bundleProject } from "./bundle.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative } from "node:path";
import { ENGINE, PUBLIC, ROOT, distDir, videoDir, videoSlug, workDir } from "./paths.mjs";

// Bump when the render settings or the way scenes are assembled change, to invalidate every scene.
const SETTINGS = { pipeline: 1, codec: "h264", crf: 16, imageFormat: "jpeg", jpegQuality: 92, audioBitrate: "192k" };
const DRAFT_SCALE = 2 / 3; // 1920×1080 → 1280×720

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? undefined : argv[i + 1];
};
if (!argv[0] || argv[0].startsWith("--") || (flag("draft") && !opt("scene"))) {
  console.error("usage: lyceum render <video> [--scene <scene-id> [--draft]]");
  process.exit(2);
}

const video = videoSlug(argv[0]);
const source = videoDir(video);
const narration = JSON.parse(readFileSync(join(source, "narration.json"), "utf8"));
const scenesOut = join(distDir(video), "scenes");
mkdirSync(scenesOut, { recursive: true });

const only = opt("scene");
if (only && !narration.scenes.some((s) => s.id === only)) {
  console.error(`${video}: no scene "${only}"`);
  process.exit(2);
}

await holdSlot("remotion");
const serveUrl = await bundleProject();

if (only && flag("draft")) {
  const out = join(scenesOut, `${only}.draft.mp4`);
  await renderScene(only, out, DRAFT_SCALE);
  console.log(`→ ${relative(ROOT, out)}`);
} else {
  const targets = only ? [only] : narration.scenes.map((s) => s.id);
  for (const id of targets) {
    const out = join(scenesOut, `${id}.mp4`);
    const stamp = join(scenesOut, `${id}.json`);
    const print = fingerprint(id);
    if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === print) {
      console.log(`  current   ${id}`);
      continue;
    }
    await renderScene(id, out, 1);
    writeFileSync(stamp, print + "\n");
  }
  if (only) console.log(`→ ${relative(ROOT, join(scenesOut, `${only}.mp4`))}`);
  else assemble();
}

/** Renders one scene's composition to `out`, with all cores. */
async function renderScene(id, out, scale) {
  const composition = await selectComposition({ serveUrl, id: `${video}--${id}` });
  const started = Date.now();
  process.stdout.write(`  rendering ${id}… `);
  const { pipeline, ...settings } = SETTINGS;
  await renderMedia({ ...settings, composition, serveUrl, scale, concurrency: cpus().length, outputLocation: out });
  console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`);
}

/** Everything that decides how a scene's frames and audio come out, hashed. */
function fingerprint(id) {
  const index = narration.scenes.findIndex((s) => s.id === id);
  const scenesDir = join(source, "scenes");
  const files = readdirSync(scenesDir).sort();
  const own = files.find((f) => new RegExp(`^s\\d+-${id}\\.tsx$`).test(f));
  if (!own) throw new Error(`${video}: no scene file for "${id}" in scenes/`);
  const support = files.filter((f) => !/^s\d+-.+\.tsx$/.test(f) && f !== "index.ts");
  const kit = readdirSync(join(ENGINE, "kit")).sort().map((f) => join(ENGINE, "kit", f));
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ SETTINGS, index, fps: narration.fps, width: narration.width, height: narration.height, scene: narration.scenes[index] }));
  for (const path of [join(scenesDir, own), ...support.map((f) => join(scenesDir, f)), ...kit]) {
    // Kit files are named relative to the package, so where Lyceum is installed doesn't matter.
    hash.update(path.startsWith(ENGINE) ? relative(ENGINE, path) : relative(ROOT, path)).update(readFileSync(path));
  }
  return hash.digest("hex").slice(0, 16);
}

/** Joins the scene videos, lays the narration clips on the timeline, and muxes in the captions. */
function assemble() {
  const work = workDir(video);
  const list = join(work, "scenes.txt");
  writeFileSync(list, narration.scenes.map((s) => `file '${join(scenesOut, `${s.id}.mp4`)}'`).join("\n") + "\n");
  const picture = join(work, "picture.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-map", "0:v", "-c", "copy", picture]);

  // Each clip starts after its scene's lead-in and is padded or trimmed to the scene's length.
  const inputs = narration.scenes.flatMap((s) => ["-i", join(PUBLIC, s.audio)]);
  const lanes = narration.scenes.map((s, i) => {
    const delay = Math.round((s.leadInFrames / narration.fps) * 1000);
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}:all=1,apad,atrim=0:${(s.frames / narration.fps).toFixed(6)}[a${i}]`;
  });
  const sound = join(work, "sound.m4a");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex", `${lanes.join(";")};${narration.scenes.map((_, i) => `[a${i}]`).join("")}concat=n=${narration.scenes.length}:v=0:a=1[out]`,
    "-map", "[out]", "-c:a", "aac", "-b:a", SETTINGS.audioBitrate, sound,
  ]);

  const final = join(distDir(video), `${video}.mp4`);
  const srt = join(source, "captions.srt");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", picture, "-i", sound, "-i", srt,
    "-map", "0:v", "-map", "1:a", "-map", "2", "-c", "copy", "-c:s", "mov_text",
    "-metadata:s:s:0", "language=eng", final,
  ]);
  copyFileSync(srt, join(distDir(video), `${video}.srt`));
  rmSync(picture);
  rmSync(sound);
  console.log(`→ ${relative(ROOT, final)}`);
}
