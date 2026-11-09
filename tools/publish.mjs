#!/usr/bin/env node
// Publishes a rendered video to the project's store, at keys that never change, so a link to it (a
// README's thumbnail, say) always shows the latest render:
//
//   lyceum publish <video>
//
//   videos/<video>/index.html      a player page: the video, its captions, when it was made and from what
//   videos/<video>/video.mp4       the render
//   videos/<video>/poster.jpg      a thumbnail: the title card with a play mark, for linking from Markdown
//   videos/<video>/captions.vtt    the captions as WebVTT, for the page's player (when they're a track)
//   videos/<video>/manifest.json   what was published: title, duration, commit, time; written last
//
// It needs the store's credentials (see store.mjs), and a render as new as the video's narration.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, distDir, workDir } from "./paths.mjs";
import { frontmatter } from "./script.mjs";
import { STORE, canWrite, publicUrl, putFixed } from "./store.mjs";
import { loadVideo } from "./video.mjs";

const [arg] = process.argv.slice(2);
if (!arg || arg.startsWith("--")) {
  console.error("usage: lyceum publish <video>");
  process.exit(2);
}
if (!STORE) fail("this project has no store: add `store` to lyceum.config.json");
if (!canWrite) fail("no store credentials: set LYCEUM_STORE_ACCESS_KEY_ID and LYCEUM_STORE_SECRET_ACCESS_KEY");

function fail(message) {
  console.error(message);
  process.exit(2);
}

const v = loadVideo(arg);
const final = join(distDir(v.slug), `${v.slug}.mp4`);
const srt = join(distDir(v.slug), `${v.slug}.srt`);
if (!existsSync(final)) fail(`${relative(ROOT, final)} doesn't exist: run \`lyceum render ${v.slug}\` first`);
if (statSync(final).mtimeMs < statSync(join(v.dir, "narration.json")).mtimeMs) {
  fail(`${relative(ROOT, final)} is older than the narration: run \`lyceum render ${v.slug}\` first`);
}

const work = workDir(v.slug);
const poster = join(work, "poster.jpg");
const vtt = join(work, "captions.vtt");
const page = join(work, "index.html");
const manifestFile = join(work, "manifest.json");
const track = v.captions === "track" && existsSync(srt);

// The thumbnail: the title card, fully drawn, with a play mark below the title: light on the dark
// canvas, dark on paper. The mark is drawn at 5× and scaled down, which smooths its edges; no image
// asset or font is needed.
const at = Math.max(0, v.lead / v.narration.fps - 0.4);
const ink = v.theme === "paper" ? 34 : 255;
const tri = "gte(X,250)*lte(abs(Y-320),(470-X)*0.5909)";
const disc = "lte(hypot(X-320,Y-320),318)";
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-ss", at.toFixed(3), "-i", final,
  "-filter_complex",
  `color=c=black@0:s=640x640:d=1,format=rgba,geq=r=${ink}:g=${ink}:b=${ink}:a='if(${tri},235,if(${disc},40,0))',scale=128:128:flags=area[mark];` +
    "[0:v]scale=1280:720,setsar=1[card];[card][mark]overlay=(W-w)/2:H*0.64-h/2:format=auto",
  "-frames:v", "1", "-q:v", "3", poster,
]);

if (track) {
  const cues = readFileSync(srt, "utf8").replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2");
  writeFileSync(vtt, `WEBVTT\n\n${cues}`);
}

const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final], { encoding: "utf8" }).trim());
const git = (...args) => {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const { meta } = frontmatter(readFileSync(join(v.dir, "script.md"), "utf8"), { strings: true });
const version = createHash("sha256").update(readFileSync(final)).digest("hex").slice(0, 12);
const manifest = {
  video: v.slug,
  title: v.title,
  duration: Math.round(duration * 10) / 10,
  published: new Date().toISOString(),
  commit: git("rev-parse", "HEAD"),
  verified: meta.verified ?? null,
  version, // the render's hash: the page asks for video.mp4?v=<version>, so a refresh is never served stale
};

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const minutes = `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`;
writeFileSync(
  page,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(v.title)}</title>
<meta property="og:title" content="${escape(v.title)}">
<meta property="og:image" content="poster.jpg?v=${version}">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0e0f12; color: #c9ccd3;
         font: 15px/1.5 system-ui, -apple-system, sans-serif; }
  main { width: min(1280px, 100vw - 32px); }
  video { width: 100%; aspect-ratio: 16 / 9; display: block; background: #000; border-radius: 6px; }
  h1 { font-size: 18px; font-weight: 600; color: #eceef2; margin: 16px 0 2px; }
  p { margin: 0; color: #8b8f99; font-size: 13px; }
</style>
</head>
<body>
<main>
  <video controls preload="metadata" poster="poster.jpg?v=${version}" src="video.mp4?v=${version}">${
    track ? `\n    <track kind="captions" srclang="en" label="English" src="captions.vtt?v=${version}">\n  ` : ""
  }</video>
  <h1>${escape(v.title)}</h1>
  <p>${minutes} · updated ${manifest.published.slice(0, 10)}${manifest.commit ? ` at ${manifest.commit.slice(0, 7)}` : ""} · made with Lyceum</p>
</main>
</body>
</html>
`,
);
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");

// The manifest goes last: a reader that sees it can trust the rest is already in place.
const base = `videos/${v.slug}`;
const uploads = [
  [`${base}/video.mp4`, final],
  ...(track ? [[`${base}/captions.vtt`, vtt]] : []),
  [`${base}/poster.jpg`, poster],
  [`${base}/index.html`, page],
];
for (const [key, file] of uploads) {
  if (!(await putFixed(key, file))) fail(`couldn't upload ${key} (see above)`);
  console.log(`  uploaded  ${key}`);
}
if (!(await putFixed(`${base}/manifest.json`, manifestFile))) fail(`couldn't upload ${base}/manifest.json (see above)`);
console.log(`  uploaded  ${base}/manifest.json`);

const url = publicUrl(`${base}/index.html`);
if (url) {
  console.log(`→ ${url}`);
  console.log(`  Markdown: [![${v.title.replace(/[[\]]/g, "")}](${publicUrl(`${base}/poster.jpg`)})](${url})`);
}
