// A video's recordings and the local Whisper that listens to them, shared by narrate.mjs (which aligns
// takes against the script) and transcribe.mjs (which writes down what a take says).
//
// A video's takes live in its recordings/ directory: the whole talk in one take, `_talk.<ext>`, and any
// scene recorded on its own, `<scene-id>.<ext>`, which wins over its part of the talk.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { withSlot } from "./slots.mjs";
import { HOME } from "./paths.mjs";

// What a take can be: anything ffmpeg reads with an audio track, a phone's video included.
export const RECORDING_TYPES = new Set([".wav", ".m4a", ".mp3", ".aif", ".aiff", ".caf", ".flac", ".ogg", ".opus", ".webm", ".mp4", ".mov"]);
// The whole talk in one take: recordings/_talk.m4a. (Scene ids can't start with "_".)
export const TALK = "_talk";

/** The video's recordings/ directory: the talk, and takes named for the scenes they narrate. */
export const recordingsDir = (videoDir) => join(videoDir, "recordings");

export const fileHash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Every take in recordings/, by scene id (or TALK). Two takes of one scene is an error: which one? */
export function recordings(videoDir) {
  const dir = recordingsDir(videoDir);
  const takes = new Map();
  if (!existsSync(dir)) return takes;
  for (const file of readdirSync(dir).sort()) {
    if (!RECORDING_TYPES.has(extname(file).toLowerCase())) continue;
    const id = basename(file, extname(file));
    if (takes.has(id)) throw new Error(`recordings/ has two takes of "${id}": ${basename(takes.get(id))} and ${file}`);
    takes.set(id, join(dir, file));
  }
  return takes;
}

/** A take's length in seconds. */
export function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(String(out).trim());
}

/** The Python that runs align.py and transcribe.py: a venv with mlx-whisper, created with uv on first use. */
export function whisperPython() {
  const venv = join(HOME, "py");
  const python = join(venv, "bin", "python");
  if (!existsSync(python)) {
    console.log(`  creating ${venv} (mlx-whisper) for word alignment…`);
    execFileSync("uv", ["venv", "-q", "--python", "3.12", venv], { stdio: "inherit" });
    execFileSync("uv", ["pip", "install", "-q", "mlx-whisper"], { stdio: "inherit", env: { ...process.env, VIRTUAL_ENV: venv } });
  }
  return python;
}

// Whisper loads its model per process, so everything that runs it takes a machine-wide slot (see
// slots.mjs): the cap holds however many narrations and transcriptions run at once.
export const whisperSlot = (task) => withSlot("whisper", task);
