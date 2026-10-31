#!/usr/bin/env node
// Copies package.json's version into the Claude Code plugin manifest. `npm version` runs it (the
// `version` script), so a release bumps both in the one commit it tags.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const path = join(ROOT, ".claude-plugin", "plugin.json");
const plugin = JSON.parse(readFileSync(path, "utf8"));
plugin.version = version;
writeFileSync(path, JSON.stringify(plugin, null, 2) + "\n");
console.log(`plugin.json → ${version}`);
