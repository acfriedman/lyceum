#!/usr/bin/env node
// Shows a video in the file it explains: writes its block (a thumbnail linking to the published player
// page) into the file named by the script's `explains:`, after the file's summary, or in place of the
// block it has. The URLs are the store's fixed keys, so this is needed once per file, not per refresh.
//
//   lyceum embed <video>
//
// The block is plain Markdown between two HTML comments (see coverage.mjs), so it renders on GitHub
// and anywhere else, and `lyceum stale` ignores changes inside it.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withEmbed } from "./coverage.mjs";
import { ROOT, videoDir, videoSlug } from "./paths.mjs";
import { frontmatter } from "./script.mjs";
import { STORE, publicUrl } from "./store.mjs";

const [arg] = process.argv.slice(2);
if (!arg || arg.startsWith("--")) {
  console.error("usage: lyceum embed <video>");
  process.exit(2);
}
const fail = (message) => {
  console.error(message);
  process.exit(2);
};

const slug = videoSlug(arg);
const script = join(videoDir(arg), "script.md");
if (!existsSync(script)) fail(`${slug}: no script.md`);
const { meta } = frontmatter(readFileSync(script, "utf8"), { strings: true });
if (!meta.explains) fail(`${slug}: its script names no file under explains:`);
if (!STORE?.public) fail("the project's store has no public URL: set store.public in lyceum.config.json");

const repo = execFileSync("git", ["-C", ROOT, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const file = join(repo, String(meta.explains).replace(/^\.\//, ""));
if (!existsSync(file)) fail(`${slug}: ${meta.explains} doesn't exist`);

const title = String(meta.title ?? slug).replace(/[[\]]/g, "");
const block = `[![${title}: a narrated explainer](${publicUrl(`videos/${slug}/poster.jpg`)})](${publicUrl(`videos/${slug}/index.html`)})`;
const before = readFileSync(file, "utf8");
const after = withEmbed(before, block);
if (after === before) {
  console.log(`${meta.explains}: already shows ${slug}`);
} else {
  writeFileSync(file, after);
  console.log(`${meta.explains}: now shows ${slug}`);
}
