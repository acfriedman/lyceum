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
// and title, and the render settings (the Chrome build among them). Rendering scenes as they pass
// review means the final call only joins them. Each scene file carries its own audio, so it doubles as
// a preview; the video's audio track is rebuilt from the narration clips, which is exact and keeps the
// join a stream copy.

import { CHROME_BUILD, openScene } from "./chrome.mjs";
import { holdSlot } from "./slots.mjs";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative } from "node:path";
import { ENGINE, PUBLIC, ROOT, distDir, videoDir, videoSlug, workDir } from "./paths.mjs";

// Bump `pipeline` when the way scenes are drawn, encoded or assembled changes, to invalidate every scene.
const SETTINGS = { pipeline: 2, crf: 16, jpegQuality: 92, audioBitrate: "192k", chrome: CHROME_BUILD };
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

await holdSlot("browser");

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

/** Renders one scene to `out`: every frame drawn in Chrome, a tab per core, piped into ffmpeg with the
 *  scene's narration clip starting after its lead-in. The file is written beside `out` and moved into
 *  place once it's whole, so a failed render leaves the last good one. */
async function renderScene(id, out, scale) {
  const started = Date.now();
  process.stdout.write(`  rendering ${id}… `);
  const scene = narration.scenes.find((s) => s.id === id);
  const partial = out.replace(/\.mp4$/, ".partial.mp4");
  const delay = Math.round((scene.leadInFrames / narration.fps) * 1000);
  const page = await openScene(video, id, { scale, tabs: cpus().length, quality: SETTINGS.jpegQuality });
  const ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(narration.fps), "-c:v", "mjpeg", "-i", "pipe:0",
    "-i", join(PUBLIC, scene.audio),
    "-filter_complex",
    // Chrome's JPEGs are full-range BT.601; the video is limited-range BT.709, and tagged so players
    // don't have to guess (on the frames: ffmpeg takes the stream's tags from them).
    "[0:v]format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p," +
      "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[v];" +
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}:all=1,apad,atrim=0:${(scene.frames / narration.fps).toFixed(6)}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", String(SETTINGS.crf),
    "-c:a", "aac", "-b:a", SETTINGS.audioBitrate,
    partial,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const exited = new Promise((resolve, reject) => ffmpeg.on("error", reject).on("close", resolve));
  ffmpeg.stdin.on("error", () => {}); // a failed ffmpeg is reported by its exit code
  try {
    for await (const jpeg of page.stream(Array.from({ length: scene.frames }, (_, i) => i), "jpeg")) {
      if (!ffmpeg.stdin.write(jpeg)) await Promise.race([once(ffmpeg.stdin, "drain"), exited]);
    }
    ffmpeg.stdin.end();
    const code = await exited;
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code} encoding ${id}`);
    renameSync(partial, out);
  } catch (error) {
    // SIGTERM alone can leave ffmpeg waiting on its open input forever.
    ffmpeg.stdin.destroy();
    ffmpeg.kill("SIGKILL");
    await exited.catch(() => {});
    rmSync(partial, { force: true });
    throw error;
  } finally {
    await page.close();
  }
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
