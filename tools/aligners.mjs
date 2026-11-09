// The Whisper that aligns narration, pinned like the renderer's Chrome: per backend, the package's
// release and the model's revision. mlx-whisper needs Apple Silicon's GPU; faster-whisper runs on any
// CPU, so CI on Linux (or on a Mac runner without Metal) can narrate. Both run the same model,
// whisper-large-v3-turbo, and align.py matches either transcript to the script the same way.
//
// Each backend's Python dependencies are locked too: tools/aligners/<backend>.txt pins its whole tree,
// with hashes, for every platform, and its venv is installed from that file alone, so every machine gets
// the same packages and a download that doesn't match its hash fails the install. Bumping a pin here
// means regenerating its lockfile in the same change (`node scripts/lock-aligners.mjs`): until the
// lockfile pins what ALIGNERS does, narrate refuses to install it.
//
// On its own, apart from narrate.mjs, so the lock script can read it outside a project.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ALIGNERS = {
  mlx: {
    package: "mlx-whisper",
    version: "0.4.3",
    model: "mlx-community/whisper-large-v3-turbo",
    revision: "a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb",
  },
  "faster-whisper": {
    package: "faster-whisper",
    version: "1.2.1",
    requires: ["ctranslate2==4.8.5"], // the inference engine: its numerics shape the timings
    model: "dropbox-dash/faster-whisper-large-v3-turbo",
    revision: "0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
  },
};

/** The Python every aligner's venv runs, and every lockfile is resolved for. */
export const PYTHON = "3.12";

/** What an aligner installs: its package at its release, and anything else it pins. */
export const specs = (aligner) => [`${aligner.package}==${aligner.version}`, ...(aligner.requires ?? [])];

/** A backend's lockfile: every package its venv gets, pinned with hashes. */
export const lockfile = (backend) => join(dirname(fileURLToPath(import.meta.url)), "aligners", `${backend}.txt`);

/**
 * A backend's lockfile, checked against ALIGNERS: `{ path, sha256 }`. Throws if the lockfile doesn't pin
 * every one of the backend's specs (a pin bumped without regenerating it).
 */
export function lock(backend) {
  const path = lockfile(backend);
  const text = readFileSync(path, "utf8");
  const pinned = new Set(text.split("\n").map((line) => line.match(/^([A-Za-z0-9._-]+==[^\s\\;]+)/)?.[1]).filter(Boolean));
  const stale = specs(ALIGNERS[backend]).filter((spec) => !pinned.has(spec));
  if (stale.length) {
    throw new Error(
      `${path} doesn't pin ${stale.join(", ")}, which ALIGNERS in tools/aligners.mjs does: ` +
        `regenerate it with node scripts/lock-aligners.mjs`,
    );
  }
  return { path, sha256: createHash("sha256").update(text).digest("hex") };
}
