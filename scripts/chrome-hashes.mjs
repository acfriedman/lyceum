#!/usr/bin/env node
// Writes the SHA-256 of each platform's headless Chrome archive for the pinned CHROME_BUILD into
// CHROME_SHA256 in tools/chrome.mjs. Run it in the same change that bumps CHROME_BUILD: until the
// hashes match the build, the renderer refuses to download Chrome.
//
//   node scripts/chrome-hashes.mjs           download each archive, hash it, rewrite CHROME_SHA256
//   node scripts/chrome-hashes.mjs --check   only compare with what tools/chrome.mjs says (exit 1 if not)
//
// Google publishes no checksums for Chrome for Testing, so the hashes are whatever its bucket serves
// over HTTPS when this runs: check the build is the one you meant before committing them.

import { Browser, getDownloadUrl } from "@puppeteer/browsers";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "tools", "chrome.mjs");
// The platforms Chrome for Testing builds the headless shell for, by @puppeteer/browsers' names.
const PLATFORMS = ["linux", "mac", "mac_arm", "win32", "win64"];
const BLOCK = /^const CHROME_SHA256 = \{[\s\S]*?^\};$/m;

const source = readFileSync(FILE, "utf8");
const build = source.match(/^export const CHROME_BUILD = "([^"]+)";$/m)?.[1];
if (!build || !BLOCK.test(source)) throw new Error(`couldn't find CHROME_BUILD and CHROME_SHA256 in ${FILE}`);

/** The SHA-256 of a download, streamed (archives are 100–200 MB). */
async function sha256(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const hash = createHash("sha256");
  for await (const chunk of response.body) hash.update(chunk);
  return hash.digest("hex");
}

const hashes = Object.fromEntries(
  await Promise.all(
    PLATFORMS.map(async (platform) => {
      const url = getDownloadUrl(Browser.CHROMEHEADLESSSHELL, platform, build);
      const hash = await sha256(url);
      console.log(`  ${platform.padEnd(8)} ${hash}  ${url}`);
      return [platform, hash];
    }),
  ),
);

const block = [
  "const CHROME_SHA256 = {",
  `  "${build}": {`,
  ...PLATFORMS.map((platform) => `    ${platform}: "${hashes[platform]}",`),
  "  },",
  "};",
].join("\n");

if (process.argv.includes("--check")) {
  const same = source.match(BLOCK)[0] === block;
  console.log(same ? `CHROME_SHA256 matches Chrome ${build}` : `CHROME_SHA256 doesn't match Chrome ${build}: run node scripts/chrome-hashes.mjs`);
  process.exit(same ? 0 : 1);
}
writeFileSync(FILE, source.replace(BLOCK, block));
console.log(`CHROME_SHA256 in tools/chrome.mjs → Chrome ${build}`);
