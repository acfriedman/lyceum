#!/usr/bin/env node
// Regenerates each aligner's lockfile (tools/aligners/<backend>.txt) from ALIGNERS in tools/aligners.mjs:
// its package and every dependency, pinned with hashes, resolved with uv for every platform. Run it in
// the same change that bumps an aligner's release or adds to its `requires`.
//
//   node scripts/lock-aligners.mjs [<backend>…]   regenerate (every backend by default)
//   node scripts/lock-aligners.mjs --check         only check each lockfile pins what ALIGNERS does
//
// Regenerating keeps the dependencies already pinned wherever they still fit; delete a lockfile first to
// re-resolve it from scratch.

import { execFileSync } from "node:child_process";
import { ALIGNERS, PYTHON, lock, lockfile, specs } from "../tools/aligners.mjs";

const args = process.argv.slice(2);
if (args.includes("--check")) {
  let ok = true;
  for (const backend of Object.keys(ALIGNERS)) {
    try {
      lock(backend);
      console.log(`  ${backend}: ${specs(ALIGNERS[backend]).join(", ")}`);
    } catch (error) {
      console.error(`  ${backend}: ${error.message}`);
      ok = false;
    }
  }
  process.exit(ok ? 0 : 1);
}

const backends = args.length ? args : Object.keys(ALIGNERS);
for (const backend of backends) {
  if (!ALIGNERS[backend]) throw new Error(`unknown aligner "${backend}": use ${Object.keys(ALIGNERS).join(" or ")}`);
  execFileSync(
    "uv",
    [
      "pip", "compile", "-", "--quiet",
      "--universal", "--python-version", PYTHON, "--generate-hashes",
      "--custom-compile-command", "node scripts/lock-aligners.mjs",
      "--output-file", lockfile(backend),
    ],
    { input: specs(ALIGNERS[backend]).join("\n") + "\n", stdio: ["pipe", "inherit", "inherit"] },
  );
  lock(backend); // the result pins what ALIGNERS does
  console.log(`  ${backend} → ${lockfile(backend)}`);
}
