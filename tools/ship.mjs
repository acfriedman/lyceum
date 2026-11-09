#!/usr/bin/env node
// Builds a verified video and publishes it, but only if every gate passes. It's the last step of an
// unattended run (see skills/lyceum/references/unattended.md), and safe to use by hand.
//
//   lyceum ship <video>
//
// The gates, in order. The first failure stops the run, and the published video stays as it was:
//   verified    `lyceum stale` finds the video current: its script records the commit it was checked
//               against, and no source changed since. A video nobody checked isn't shipped
//   narrate     every scene's narration is voiced (or fetched from the store) with no words missing
//   typecheck   the project's scenes type-check
//   render      every scene draws (a cue whose phrase isn't in the narration throws) and joins
//   output      the MP4 has video and audio streams, and its length matches the narration's timeline
//   publish     the render, thumbnail and player page are uploaded to the store
//   embed       the file the video explains (its `explains:`) shows it
//
// Writes .cache/work/<video>/ship.json, `{ video, ok, step, error, url, seconds }`, for CI to report from.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distDir, videoDir, videoSlug, workDir } from "./paths.mjs";
import { frontmatter } from "./script.mjs";
import { STORE, publicUrl } from "./store.mjs";
import { loadVideo } from "./video.mjs";

const [arg] = process.argv.slice(2);
if (!arg || arg.startsWith("--")) {
  console.error("usage: lyceum ship <video>");
  process.exit(2);
}
const slug = videoSlug(arg);
const LYCEUM = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "lyceum.mjs");
const started = Date.now();
const result = { video: slug, ok: false, step: null, error: null, url: null, seconds: 0 };

function finish(code) {
  result.seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(join(workDir(slug), "ship.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(result.ok ? `ship: ${slug} published → ${result.url}` : `ship: ${slug} stopped at ${result.step}: ${result.error}`);
  process.exit(code);
}

/** Runs a gate; on failure, records why and stops. */
async function gate(step, run) {
  result.step = step;
  console.log(`— ${step}`);
  try {
    const error = await run();
    if (error) throw new Error(error);
  } catch (error) {
    result.error = String(error.message ?? error).trim();
    finish(1);
  }
}

/** Runs a lyceum command with its output shown as it goes. Resolves to null, or on failure to the
 *  last lines it printed, which say why. */
function lyceum(...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [LYCEUM, ...args], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LYCEUM_NO_UPDATE_CHECK: "1" } });
    let tail = "";
    const keep = (stream, into) =>
      stream.on("data", (chunk) => {
        into.write(chunk);
        tail = (tail + chunk).slice(-2000);
      });
    keep(child.stdout, process.stdout);
    keep(child.stderr, process.stderr);
    child.on("close", (code) => {
      if (code === 0) return resolve(null);
      // The reason: a thrown error's message if there is one (not its stack), else the last lines.
      const lines = tail.split("\n").map((line) => line.trim()).filter((line) => line && !/^(at |Node\.js v|\^|(cached|fetched|current|done)\b)/.test(line));
      const thrown = lines.filter((line) => /^\w*Error: /.test(line)).at(-1);
      const why = thrown ? thrown.replace(/^\w*Error: /, "") : lines.slice(-2).join(" / ");
      resolve(`lyceum ${args[0]} exited with ${code}${why ? `: ${why}` : ""}`);
    });
  });
}

if (!existsSync(join(videoDir(arg), "script.md"))) {
  result.step = "script";
  result.error = "no script.md";
  finish(2);
}
const { meta } = frontmatter(readFileSync(join(videoDir(arg), "script.md"), "utf8"), { strings: true });

await gate("verified", () => {
  if (!meta.verified) return "its script records no verified: commit (run `lyceum stale --mark` once it's checked)";
  const run = spawnSync(process.execPath, [LYCEUM, "stale", slug, "--json"], { encoding: "utf8", env: { ...process.env, LYCEUM_NO_UPDATE_CHECK: "1" } });
  const [report] = JSON.parse(run.stdout || "[]");
  if (!report) return run.stderr?.trim() || "stale reported nothing";
  if (report.status !== "current") return `stale says ${report.status}: ${[...report.repos.flatMap((r) => r.files.map((f) => f.path)), ...report.notes].slice(0, 5).join(", ")}`;
});
await gate("narrate", () => lyceum("narrate", slug));
await gate("typecheck", () => lyceum("typecheck"));
await gate("render", () => lyceum("render", slug));
await gate("output", () => {
  const final = join(distDir(slug), `${slug}.mp4`);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", final], { encoding: "utf8" }));
  const kinds = new Set(probe.streams.map((s) => s.codec_type));
  if (!kinds.has("video") || !kinds.has("audio")) return `${final} lacks ${kinds.has("video") ? "audio" : "video"}`;
  const v = loadVideo(slug);
  const expected = (v.lead + v.narration.frames) / v.narration.fps; // the title card, then the scenes
  const actual = Number(probe.format.duration);
  if (Math.abs(actual - expected) > 1) return `the MP4 runs ${actual.toFixed(1)} s, but the narration's timeline is ${expected.toFixed(1)} s`;
});
await gate("publish", () => {
  if (!STORE) return "the project has no store (`store` in lyceum.config.json)";
  return lyceum("publish", slug);
});
result.url = publicUrl(`videos/${slug}/index.html`);
if (meta.explains) await gate("embed", () => lyceum("embed", slug));

result.ok = true;
result.step = null;
finish(0);
