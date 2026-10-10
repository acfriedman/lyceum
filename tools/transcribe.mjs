#!/usr/bin/env node
// Writes down what a narrator's takes actually say, for when they strayed from the script: narrate.mjs
// (`voice: { provider: recorded }`) refuses a take that skips script words, and warns about words the
// script doesn't have. With the transcript beside the script, each difference is either recorded again or
// written into the narration as said.
//
//   lyceum transcribe <video> [--scene <scene-id>]
//
// Takes: recordings/_talk.<ext>, the whole talk, and recordings/<scene-id>.<ext>, a scene recorded on its
// own; `--scene` transcribes only that scene's take. Output: .cache/work/<video>/transcript.md, a sentence
// per line with when it starts and the longer pauses marked (scenes usually change at one), and the
// words with their timings in transcript.json beside it. Transcripts are cached by take, so a re-run only
// listens to new ones.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseScript } from "./script.mjs";
import { CACHE, ROOT, videoDir as resolveVideoDir, videoSlug, workDir } from "./paths.mjs";
import { TALK, fileHash, probeDuration, recordings, recordingsDir, whisperPython, whisperSlot } from "./takes.mjs";

// A silence this long starts a new line and is marked: where a narrator moves on, scenes usually change.
const PAUSE = 0.8;
// Bump when the way takes are transcribed changes: transcripts are cached by take and prompt.
const TRANSCRIBER = "transcribe@1";

const argv = process.argv.slice(2);
const only = argv.includes("--scene") ? argv[argv.indexOf("--scene") + 1] : undefined;
const videoArg = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--scene");
if (!videoArg || (argv.includes("--scene") && !only)) {
  console.error("usage: lyceum transcribe <video> [--scene <scene-id>]");
  process.exit(2);
}
const video = videoSlug(videoArg);
const dir = resolveVideoDir(videoArg);
const { meta, scenes } = parseScript(join(dir, "script.md"));

// The takes to transcribe: the talk, then scene takes in the script's order.
const takes = recordings(dir);
for (const id of takes.keys()) {
  if (id !== TALK && !scenes.some((s) => s.id === id)) console.log(`  recordings/: no scene "${id}" in the script; its take is skipped`);
}
const wanted = only
  ? [{ id: only, path: takes.get(only) }]
  : [TALK, ...scenes.map((s) => s.id)].filter((id) => takes.has(id)).map((id) => ({ id, path: takes.get(id) }));
const label = relative(ROOT, recordingsDir(dir));
if (only && !scenes.some((s) => s.id === only)) {
  console.error(`${video}: no scene "${only}"`);
  process.exit(2);
}
if (wanted.length === 0 || !wanted[0].path) {
  console.error(
    only
      ? `no take of "${only}": record it to ${label}/${only}.m4a`
      : `no takes: record the whole talk to ${label}/${TALK}.m4a (or each scene to ${label}/<scene-id>.m4a)`,
  );
  process.exit(1);
}

// The video's vocabulary, so names come out spelled as the script spells them: its title and scene
// titles, each written as a sentence, since Whisper copies a prompt's style. Only those: given the whole
// narration, Whisper can fall into repeating it instead of listening.
const prompt = [meta.title, ...scenes.map((s) => s.title)]
  .filter(Boolean)
  .map((piece) => String(piece).replace(/^\w/, (c) => c.toUpperCase()).replace(/[.;:,\s]*$/, "."))
  .join(" ");

const python = whisperPython();
const script = join(dirname(fileURLToPath(import.meta.url)), "transcribe.py");
const transcripts = [];
for (const { id, path } of wanted) {
  const key = createHash("sha256").update(JSON.stringify({ take: fileHash(path), prompt, transcriber: TRANSCRIBER })).digest("hex").slice(0, 16);
  const cached = join(CACHE, "narration", `${key}.transcript.json`);
  if (!existsSync(cached)) {
    console.log(`  transcribing ${relative(ROOT, path)}…`);
    mkdirSync(dirname(cached), { recursive: true });
    const promptPath = cached.replace(/\.json$/, ".prompt.txt");
    writeFileSync(promptPath, prompt);
    const { stdout } = await whisperSlot(() => promisify(execFile)(python, [script, path, promptPath], { maxBuffer: 64 * 1024 * 1024 }));
    writeFileSync(cached, stdout);
  } else {
    console.log(`  cached       ${relative(ROOT, path)}`);
  }
  const { words } = JSON.parse(readFileSync(cached, "utf8"));
  transcripts.push({ file: relative(dir, path), scene: id === TALK ? null : id, duration: probeDuration(path), words });
}

/** Seconds as m:ss.s. */
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/** A take's words as lines: a sentence each, broken at a pause too, the pauses marked between them. */
function lines(words) {
  const out = [];
  let line = [];
  const flush = () => {
    if (line.length) out.push(`[${clock(line[0].s)}] ${line.map((w) => w.w).join(" ")}`);
    line = [];
  };
  for (const [i, word] of words.entries()) {
    const gap = i > 0 ? word.s - words[i - 1].e : 0;
    if (gap >= PAUSE) {
      flush();
      out.push(`            · pause ${gap.toFixed(1)} s ·`);
    }
    line.push(word);
    if (/[.?!]["”]?$/.test(word.w)) flush();
  }
  flush();
  return out;
}

const sections = transcripts.map((t) => {
  const what = t.scene ? `scene ${t.scene}` : "the whole talk";
  return `## ${t.file}: ${what} (${clock(t.duration)})\n\n${lines(t.words).join("\n")}\n`;
});
const work = workDir(video);
mkdirSync(work, { recursive: true });
const md = join(work, "transcript.md");
writeFileSync(
  md,
  `# Transcript: ${video}

What was said in each take, a sentence per line with when it starts, and the longer pauses marked.
Compare it with the script's narration. Where they differ, record that scene again, or change the
narration to what was said, word for word (a misheard name is Whisper's mistake, not the narrator's).
What was said between scenes is cut from the audio, so it needs neither. Then run narrate.

${sections.join("\n")}`,
);
writeFileSync(join(work, "transcript.json"), JSON.stringify({ takes: transcripts }, null, 1) + "\n");
const count = transcripts.reduce((n, t) => n + t.words.length, 0);
console.log(`${video}: ${transcripts.length} take${transcripts.length > 1 ? "s" : ""}, ${count} words → ${relative(ROOT, md)}`);
