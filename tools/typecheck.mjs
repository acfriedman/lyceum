// `lyceum typecheck`: the TypeScript compiler over the project's tsconfig, under a machine-wide slot
// (see slots.mjs). Each run holds the whole project in memory, and a dozen scene agents checking at
// once would add up.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ENGINE, ROOT } from "./paths.mjs";
import { withSlot } from "./slots.mjs";

// TypeScript's package exports don't include its binary, so find it through the package's `bin`.
const manifest = createRequire(join(ENGINE, "package.json")).resolve("typescript/package.json");
const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
const tsc = join(dirname(manifest), typeof bin === "string" ? bin : bin.tsc);
try {
  await withSlot("typecheck", async () => execFileSync(tsc, ["-p", ROOT], { stdio: "inherit" }));
} catch (error) {
  process.exit(error.status ?? 1);
}
