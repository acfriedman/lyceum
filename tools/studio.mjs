#!/usr/bin/env node
// Opens Remotion Studio on every registered video of the project, for scrubbing scenes with their audio.
//
//   lyceum studio [<remotion studio flags, e.g. --port 3123 --no-open>]

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { studioConfig } from "./bundle.mjs";
import { ENGINE, ENTRY, ROOT, preparePublic } from "./paths.mjs";

const cliPackage = createRequire(join(ENGINE, "package.json")).resolve("@remotion/cli/package.json");
const { bin } = JSON.parse(readFileSync(cliPackage, "utf8"));
const cli = join(dirname(cliPackage), typeof bin === "string" ? bin : bin.remotion);

const studio = spawn(
  process.execPath,
  [cli, "studio", ENTRY, "--public-dir", preparePublic(), "--config", studioConfig(), ...process.argv.slice(2)],
  { cwd: ROOT, stdio: "inherit" },
);
studio.on("exit", (code) => process.exit(code ?? 0));
