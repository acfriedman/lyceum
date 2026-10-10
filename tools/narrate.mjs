#!/usr/bin/env node
// Narrates a video's script: one audio clip per scene, with word timings, plus the timeline the
// composition and the captions are laid out from.
//
//   lyceum narrate <video> [--provider openai|elevenlabs|say|recorded] [--only <scene-id>]
//
// Each clip is cached under .cache/narration by a hash of everything that shapes the audio (provider,
// voice, model, settings, spoken text), so re-running after a script edit only pays for the scenes
// whose narration changed. Every clip is brought to the same loudness (LOUDNESS), so separate takes
// don't jump in volume. Keys (OPENAI_KEY or OPENAI_API_KEY, ELEVEN_LABS_KEY or ELEVENLABS_API_KEY) come from the environment or from the
// nearest .env walking up from the project.
//
// The default voice is OpenAI's gpt-4o-mini-tts "cedar". A script picks another with frontmatter
// `voice: { provider, id, … }`; fields override that provider's defaults below. Only ElevenLabs
// reports word timings itself; for the others, align.py (beside this file) derives them with local Whisper
// (a Python venv shared by every project, under the Lyceum home directory, created on first use).
//
// `recorded` is the narrator's own voice, from the video's recordings/ directory: the whole talk in one
// take, `recordings/_talk.m4a` (or .wav, .mp3, …), split into scenes, and any scene recorded again on
// its own, `recordings/<scene-id>.m4a`, which wins over its part of the talk. Takes are aligned against
// the script and cut to its words.
//
// The project's lyceum.config.json can set a default `voice`, plus `pronounce` and `allowSpoken`
// entries that apply to every script; a script's own frontmatter wins.

import { createHash } from "node:crypto";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { withSlot } from "./slots.mjs";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { toSrt } from "./captions.mjs";
import { parseScript, spokenText } from "./script.mjs";
import { CACHE as CACHE_ROOT, CONFIG, HOME, ROOT, preparePublic, videoDir as resolveVideoDir, videoSlug } from "./paths.mjs";

const CACHE = join(CACHE_ROOT, "narration");

const DEFAULTS = {
  fps: 30,
  width: 1920,
  height: 1080,
  // Seconds of picture before a scene's narration starts and after it ends.
  leadIn: 0.6,
  tail: 1.1,
};

// Each provider's default voice. The object's key order is part of the cache hash: keep it stable.
const VOICES = {
  openai: {
    provider: "openai",
    id: "cedar",
    model: "gpt-4o-mini-tts",
    instructions:
      "Voice: a calm, curious explainer narrator in the style of 3Blue1Brown. Tone: warm, intelligent, " +
      "unhurried. Pacing: measured, with brief natural pauses at commas and full stops; slightly slower " +
      "on key ideas. Never rushed, never theatrical.",
    // Voiced paragraph by paragraph, with a trimmed sentinel, each checked against the script and
    // loudness-normalized (see synthesizeOpenAI). Bump the version when that processing changes: the
    // raw speech is cached apart (see openAISpeech), so it re-processes clips without re-billing them.
    chunk: "paragraph+sentinel+loudness@5",
  },
  elevenlabs: {
    provider: "elevenlabs",
    id: "TX3LPaxmHKxFdv7VOQHJ", // Liam
    model: "eleven_multilingual_v2",
    settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    seed: 7,
  },
  say: { provider: "say", id: "Samantha", rate: 180 },
  // Bump `processing` when the way takes are cut changes: each clip is cached by its take's contents.
  recorded: { provider: "recorded", id: "recording", processing: "trim@1" },
};

/** The voice a run uses: `--provider` wins, then the script's `voice:`, then OpenAI. */
function resolveVoice(cliProvider, scripted = {}) {
  const provider = cliProvider ?? scripted.provider ?? "openai";
  const base = VOICES[provider];
  if (!base) throw new Error(`unknown provider "${provider}" (expected ${Object.keys(VOICES).join(", ")})`);
  // The script's overrides describe its own provider's voice; they don't carry over to another one.
  return (scripted.provider ?? "openai") === provider ? { ...base, ...scripted, provider } : base;
}

function parseArgs(argv) {
  const args = { dir: null, provider: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--provider") args.provider = argv[++i];
    else if (argv[i] === "--only") args.only = argv[++i];
    else args.dir = argv[i];
  }
  if (!args.dir) {
    console.error("usage: lyceum narrate <video> [--provider openai|elevenlabs|say|recorded] [--only <scene-id>]");
    process.exit(2);
  }
  return args;
}

/** A secret from the environment, or from the nearest .env walking up from the project. */
function secret(...names) {
  for (const name of names) if (process.env[name]) return process.env[name];
  for (let dir = ROOT; dir !== dirname(dir); dir = dirname(dir)) {
    const env = join(dir, ".env");
    if (!existsSync(env)) continue;
    for (const name of names) {
      const match = readFileSync(env, "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${names.join(" / ")} is not set, and no .env at or above ${ROOT} defines it`);
}

/** Characters with start/end seconds → words with start/end seconds. */
function wordsFromAlignment({ characters, character_start_times_seconds: starts, character_end_times_seconds: ends }) {
  const words = [];
  let word = null;
  characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      word = null;
      return;
    }
    if (!word) {
      word = { w: "", s: starts[i], e: ends[i] };
      words.push(word);
    }
    word.w += ch;
    word.e = ends[i];
  });
  return words;
}

/** The Python that runs align.py: a venv with mlx-whisper, created with uv on first use. */
function alignerPython() {
  const venv = join(HOME, "py");
  const python = join(venv, "bin", "python");
  if (!existsSync(python)) {
    console.log(`  creating ${venv} (mlx-whisper) for word alignment…`);
    execFileSync("uv", ["venv", "-q", "--python", "3.12", venv], { stdio: "inherit" });
    execFileSync("uv", ["pip", "install", "-q", "mlx-whisper"], { stdio: "inherit", env: { ...process.env, VIRTUAL_ENV: venv } });
  }
  return python;
}

// Whisper loads its model per process, so alignments take machine-wide slots (see slots.mjs): the cap
// holds however many narrations run at once.
const whisperSlot = (task) => withSlot("whisper", task);

/** Word timings for a clip, from local Whisper matched back to the script's words, plus the script
 *  words Whisper never heard (`missing`) and what it heard that the script doesn't say (`extra`).
 *  Paths are unique per clip, so calls may run concurrently. */
async function align(text, audioPath, sentinel) {
  const textPath = audioPath.replace(/\.\w+$/, ".txt");
  writeFileSync(textPath, text);
  const { stdout } = await whisperSlot(() =>
    promisify(execFile)(alignerPython(), [join(dirname(fileURLToPath(import.meta.url)), "align.py"), audioPath, textPath, ...(sentinel ? [sentinel] : [])], {
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  return JSON.parse(String(stdout));
}

function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(String(out).trim());
}

async function synthesizeElevenLabs(text, voice, mp3Path) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": secret("ELEVEN_LABS_KEY", "ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: voice.model, voice_settings: voice.settings, seed: voice.seed }),
    },
  );
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  const body = await response.json();
  writeFileSync(mp3Path, Buffer.from(body.audio_base64, "base64"));
  return wordsFromAlignment(body.alignment);
}

// The level every clip is brought to: integrated loudness in LUFS (EBU R128's reference, about where
// the default voice already sits, so the gain stays small), and the true peak, in dBTP, no gain may
// push past.
const LOUDNESS = { lufs: -23, peak: -1 };

/**
 * The filter that brings a clip to LOUDNESS: it measures the clip (with `outputArgs`, e.g. a `-t`
 * cut, applied as they will be), then applies one constant gain. Nothing is compressed or reshaped;
 * a clip whose peaks can't take the full gain just stays a little quieter.
 */
function loudnessFilter(path, outputArgs = []) {
  const { stderr } = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", path, ...outputArgs, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const start = stderr.lastIndexOf("{");
  const measured = JSON.parse(stderr.slice(start, stderr.indexOf("}", start) + 1));
  const loudness = Number(measured.input_i);
  const peak = Number(measured.input_tp);
  // Too short or too quiet to measure: leave the clip as it is.
  if (!Number.isFinite(loudness) || !Number.isFinite(peak)) return "anull";
  return `volume=${Math.min(LOUDNESS.lufs - loudness, LOUDNESS.peak - peak).toFixed(2)}dB`;
}

/** Writes a copy of a clip brought to LOUDNESS. */
function normalizeLoudness(inPath, outPath) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", inPath, "-af", loudnessFilter(inPath), "-b:a", "160k", outPath]);
}

// Seconds of silence between a scene's paragraphs when they're voiced separately.
const PARAGRAPH_GAP = 0.45;
const ATTEMPTS = 3;
// gpt-4o-mini-tts often drops an input's last sentence (measured: ~70% of the time for a short
// closing one). A throwaway sentence after it absorbs the drop; the audio is cut before it.
const SENTINEL = "Okay.";

/**
 * One billed OpenAI speech request, cached under .cache/tts-raw by exactly what was sent (and the
 * attempt number, so a retry is a fresh take). The audio is kept *before* any trimming or
 * alignment: changing how clips are processed never pays for the same speech twice.
 */
async function openAISpeech(voice, input, attempt) {
  const request = { model: voice.model, voice: voice.id, input, instructions: voice.instructions, response_format: "mp3" };
  const key = createHash("sha256").update(JSON.stringify({ request, attempt })).digest("hex").slice(0, 16);
  const rawPath = join(CACHE_ROOT, "tts-raw", `${key}.mp3`);
  if (existsSync(rawPath)) return rawPath;
  mkdirSync(dirname(rawPath), { recursive: true });
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret("OPENAI_KEY", "OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  writeFileSync(rawPath, Buffer.from(await response.arrayBuffer()));
  return rawPath;
}

/**
 * OpenAI voices a scene one paragraph at a time (all paragraphs concurrently), each with SENTINEL
 * appended. Each paragraph is aligned against its real text, cut between its last word and the
 * sentinel, checked for skipped words (and retried), and brought to LOUDNESS (each is a separate take,
 * so they differ), then the paragraphs are joined with a short pause.
 */
async function synthesizeOpenAI(text, voice, mp3Path, label) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const parts = await Promise.all(
    paragraphs.map(async (paragraph, index) => {
      const partPath = mp3Path.replace(/\.mp3$/, `.p${index}.mp3`);
      for (let attempt = 1; ; attempt++) {
        const rawPath = await openAISpeech(voice, `${paragraph} ${SENTINEL}`, attempt);
        const aligned = await align(paragraph, rawPath, SENTINEL);
        if (aligned.missing.length === 0) {
          cutAfterLastWord(rawPath, partPath, aligned);
          return { path: partPath, words: aligned.words, duration: probeDuration(partPath) };
        }
        if (attempt === ATTEMPTS) {
          throw new Error(`${label}: paragraph ${index + 1} still missing words after ${ATTEMPTS} attempts: "${aligned.missing.join(" ")}"`);
        }
        console.log(`  ${label}: retrying paragraph ${index + 1} (missing "${aligned.missing.join(" ")}")`);
      }
    }),
  );
  return joinParts(parts, mp3Path);
}

/**
 * Trims a clip just after its last scripted word (halfway to the sentinel, when it was spoken) and
 * brings what's left to LOUDNESS.
 */
function cutAfterLastWord(rawPath, outPath, { words, tail }) {
  const lastEnd = words.at(-1).e;
  const cut = Math.min(probeDuration(rawPath), tail == null ? lastEnd + 0.3 : Math.max(lastEnd + 0.08, (lastEnd + tail) / 2));
  const trim = ["-t", cut.toFixed(3)];
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", rawPath, ...trim,
    "-af", `${loudnessFilter(rawPath, trim)},afade=t=out:st=${Math.max(0, cut - 0.06).toFixed(3)}:d=0.06`, "-b:a", "160k", outPath,
  ]);
}

/** Concatenates clips with PARAGRAPH_GAP of silence between them, shifting their word timings. */
function joinParts(parts, mp3Path) {
  if (parts.length === 1) {
    copyFileSync(parts[0].path, mp3Path);
    return parts[0].words;
  }
  const inputs = parts.flatMap((p) => ["-i", p.path]);
  const gaps = parts
    .slice(1)
    .map((_, i) => `anullsrc=r=44100:cl=mono,atrim=duration=${PARAGRAPH_GAP}[g${i + 1}]`)
    .join(";");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex", `${gaps};${parts.map((_, i) => `[${i}:a]aresample=44100,aformat=channel_layouts=mono[a${i}]`).join(";")};` +
      `${parts.map((_, i) => (i === 0 ? "[a0]" : `[g${i}][a${i}]`)).join("")}concat=n=${parts.length * 2 - 1}:v=0:a=1[out]`,
    "-map", "[out]", "-b:a", "160k", mp3Path,
  ]);
  const words = [];
  let offset = 0;
  for (const part of parts) {
    words.push(...part.words.map((w) => ({ ...w, s: w.s + offset, e: w.e + offset })));
    offset += part.duration + PARAGRAPH_GAP;
  }
  return words;
}

async function synthesizeSay(text, voice, mp3Path) {
  const aiff = mp3Path.replace(/\.mp3$/, ".aiff");
  execFileSync("say", ["-v", voice.id, "-r", String(voice.rate), "-o", aiff, text]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-b:a", "192k", mp3Path]);
  return (await align(text, mp3Path)).words;
}

// A take is cut this far either side of its first and last words, so the silence before and after
// speaking doesn't count, and the timeline's lead-in and tail space every scene alike.
const RECORDING_PAD = { before: 0.25, after: 0.4 };
// What a take can be: anything ffmpeg reads with an audio track, a phone's video included.
const RECORDING_TYPES = new Set([".wav", ".m4a", ".mp3", ".aif", ".aiff", ".caf", ".flac", ".ogg", ".opus", ".webm", ".mp4", ".mov"]);
// The whole talk in one take: recordings/_talk.m4a. (Scene ids can't start with "_".) A scene's own take
// wins over its part of the talk, so a fluffed scene is fixed by recording just that scene again.
const TALK = "_talk";
// Bump when the way a talk is aligned or split changes: its alignment is cached by take and script.
const TALK_ALIGNER = "talk@1";

/** The video's recordings/ directory: the talk, and takes named for the scenes they narrate. */
const recordingsDir = (videoDir) => join(videoDir, "recordings");

const fileHash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Every take in recordings/, by scene id (or TALK). Two takes of one scene is an error: which one? */
function recordings(videoDir) {
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

/** Word timings for a take, from Whisper on a mono copy of its audio (in the cache, never beside it). */
async function alignTake(path, text, scratch) {
  const wav = `${scratch}.wav`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", "44100", wav]);
  try {
    return await align(text, wav);
  } finally {
    rmSync(wav, { force: true });
  }
}

/** Seconds `from`–`to` of a take, faded in and out, as a clip. */
function cutTake(path, [from, to], outPath) {
  const length = to - from;
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", from.toFixed(3), "-t", length.toFixed(3), "-i", path, "-vn", "-ac", "1", "-ar", "44100",
    "-af", `afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, length - 0.1).toFixed(3)}:d=0.1`, "-b:a", "160k", outPath,
  ]);
}

/** The span of a take to keep: its words, RECORDING_PAD either side, inside `within`. */
function keep(words, [lo, hi]) {
  return [Math.max(lo, words[0].s - RECORDING_PAD.before), Math.min(hi, words.at(-1).e + RECORDING_PAD.after)];
}

/** Warns about unscripted speech inside the span kept (what falls outside it is cut anyway). */
function warnExtra(label, extra, [from, to]) {
  for (const phrase of extra) {
    if (phrase.e > from && phrase.s < to) console.log(`  ${label}: heard "${phrase.text}", which isn't in the script (the captions won't show it)`);
  }
}

/**
 * Where each scene's narration comes from (scenes in `wanted`; others, if they have a take, too):
 *   { path, hash }                   its own take, aligned when its clip is made
 *   { path, hash, span, words, … }   its part of the talk: the talk is aligned against the whole script
 *                                    once, and each scene cut halfway through the pauses around it
 * A scene with neither, or whose part of the talk skips words, is an error, all of them reported at once.
 */
async function planRecordings(videoDir, scenes, spoken, wanted) {
  const takes = recordings(videoDir);
  const label = relative(ROOT, recordingsDir(videoDir));
  for (const id of takes.keys()) {
    // A take named for no scene is usually a scene renamed since it was recorded.
    if (id !== TALK && !scenes.some((s) => s.id === id)) console.log(`  ${label}/: no scene "${id}" in the script; its take is unused`);
  }
  const sources = new Map();
  for (const scene of scenes) {
    const path = takes.get(scene.id);
    if (path) sources.set(scene.id, { path, hash: fileHash(path) });
  }
  const fromTalk = wanted.filter((s) => !sources.has(s.id));
  if (fromTalk.length === 0) return sources;
  const talk = takes.get(TALK);
  if (!talk) {
    // The easy mistake: a take saved beside script.md instead of in recordings/.
    const astray = readdirSync(videoDir).filter((f) => RECORDING_TYPES.has(extname(f).toLowerCase()));
    throw new Error(
      `no recording of ${fromTalk.map((s) => s.id).join(", ")}: record the whole talk to ${label}/${TALK}.m4a, or each scene ` +
        `to ${label}/<scene-id>.m4a (or .wav, .mp3, …), reading the narration as written` +
        (astray.length ? `\n(${astray.join(", ")} is beside script.md: takes go in ${label}/)` : ""),
    );
  }

  const hash = fileHash(talk);
  const text = scenes.map(spoken).join("\n\n");
  const cached = join(CACHE, `${createHash("sha256").update(JSON.stringify({ hash, text, aligner: TALK_ALIGNER })).digest("hex").slice(0, 16)}.talk.json`);
  if (!existsSync(cached)) {
    console.log(`  aligning ${relative(ROOT, talk)} against the script…`);
    writeFileSync(cached, JSON.stringify(await alignTake(talk, text, cached.replace(/\.json$/, ""))));
  }
  const aligned = JSON.parse(readFileSync(cached, "utf8"));

  // Each scene's words, by counting the script's words (align.py splits on whitespace too).
  let at = 0;
  const parts = scenes.map((scene) => {
    const count = spoken(scene).split(/\s+/).filter(Boolean).length;
    const part = { scene, from: at, to: at + count, words: aligned.words.slice(at, at + count) };
    at += count;
    return part;
  });
  const duration = probeDuration(talk);
  const problems = [];
  for (const [k, part] of parts.entries()) {
    if (!fromTalk.includes(part.scene)) continue;
    const before = parts[k - 1]?.words.at(-1)?.e;
    const after = parts[k + 1]?.words[0]?.s;
    const first = part.words[0].s;
    const last = part.words.at(-1).e;
    const span = keep(part.words, [before === undefined ? 0 : (before + first) / 2, after === undefined ? duration : (last + after) / 2]);
    const missing = aligned.skipped
      .map(([i, j]) => [Math.max(i, part.from), Math.min(j, part.to)])
      .filter(([i, j]) => i < j)
      .flatMap(([i, j]) => aligned.words.slice(i, j).map((w) => w.w));
    if (missing.length) problems.push(`  ${part.scene.id}: skips "${missing.join(" ")}"`);
    sources.set(part.scene.id, { path: talk, hash, span, words: part.words, extra: aligned.extra });
  }
  if (problems.length) {
    throw new Error(
      `${relative(ROOT, talk)} doesn't say all of the script:\n${problems.join("\n")}\n` +
        `Record each of these scenes on its own, to ${label}/<scene-id>.m4a, or change its narration in script.md to what you said.`,
    );
  }
  return sources;
}

/** What narration.json says of a recorded scene's take: its file, and the span cut from the talk. */
function takeOf({ path, span }) {
  return { file: basename(path), ...(span && { from: Number(span[0].toFixed(3)), to: Number(span[1].toFixed(3)) }) };
}

/**
 * A scene the narrator recorded: its part of the talk, already aligned, or its own take, aligned and
 * checked for skipped lines here. Either is cut to its words with RECORDING_PAD either side. Words
 * heard that the script doesn't have only warn: the picture is timed to the script's words, and the
 * captions show the script.
 */
async function synthesizeRecorded(text, voice, mp3Path, label, source) {
  let { words, span, extra } = source;
  if (!span) {
    const aligned = await alignTake(source.path, text, mp3Path.replace(/\.mp3$/, ".take"));
    if (aligned.missing.length) {
      throw new Error(
        `${label}: the recording skips "${aligned.missing.join(" ")}". Record the scene again, or change its narration in ` +
          `script.md to what you said.`,
      );
    }
    ({ words, extra } = aligned);
    span = keep(words, [0, probeDuration(source.path)]);
  }
  warnExtra(label, extra, span);
  cutTake(source.path, span, mp3Path);
  const shift = (t) => Number((t - span[0]).toFixed(3));
  return words.map((w) => ({ ...w, s: shift(w.s), e: shift(w.e) }));
}

const SYNTHESIZE = { openai: synthesizeOpenAI, elevenlabs: synthesizeElevenLabs, say: synthesizeSay, recorded: synthesizeRecorded };

// Narration says things in full: no acronyms, no shortenings. Listeners can't see the spelling, and
// "op" or "GCD" makes them decode instead of follow. Checked before anything is billed.
const SHORTENINGS = new Set(
  "op ops impl impls config configs repo repos func funcs param params arg args env dep deps init info stats".split(" "),
);

// Acronyms so common that saying them in full would sound stranger than the acronym.
const EVERYDAY_ACRONYMS = new Set("API APIs URL URLs UI CPU GPU JSON HTTP HTTPS SQL PDF AI ID IDs".split(" "));

/** Acronyms (two or more capitals) and known shortenings in a scene's spoken text. */
function shortenings(text, allowed) {
  const found = new Set();
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (!word || allowed.has(word) || EVERYDAY_ACRONYMS.has(word)) continue;
    if (/^[A-Z]{2,}s?$/.test(word) || SHORTENINGS.has(word.toLowerCase())) found.add(word);
  }
  return [...found];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videoDir = resolveVideoDir(args.dir);
  const video = videoSlug(args.dir);
  const { meta: scripted, scenes } = parseScript(join(videoDir, "script.md"));
  // Project-wide defaults from lyceum.config.json; the script's own frontmatter wins.
  const meta = {
    ...scripted,
    voice: scripted.voice ?? CONFIG.voice,
    pronounce: { ...CONFIG.pronounce, ...(scripted.pronounce ?? {}) },
    allow_spoken: [...CONFIG.allowSpoken, ...(scripted.allow_spoken ?? [])],
  };

  const timing = { ...DEFAULTS, ...(meta.timing ?? {}) };
  const voice = resolveVoice(args.provider, meta.voice);
  const provider = voice.provider;
  // A person reads the script as written: `pronounce` respells words for synthetic voices only.
  const recorded = provider === "recorded";
  const spoken = (scene) => spokenText(scene.narration, recorded ? {} : meta.pronounce);
  const wanted = scenes.filter((s) => !args.only || args.only === s.id);
  const sources = recorded ? await planRecordings(videoDir, scenes, spoken, wanted) : new Map();
  /** What shapes a scene's clip, and so its cache key: for a recording, the take (and the part of it) too. */
  const shapeOf = (scene) => {
    const source = sources.get(scene.id);
    const shape = { provider, voice, text: spoken(scene) };
    if (!source) return shape;
    return source.span ? { ...shape, take: source.hash, span: source.span.map((t) => Number(t.toFixed(3))) } : { ...shape, take: source.hash };
  };
  const hashOf = (shape) => createHash("sha256").update(JSON.stringify(shape)).digest("hex").slice(0, 16);

  mkdirSync(CACHE, { recursive: true });
  const publicRoot = preparePublic();
  mkdirSync(join(publicRoot, video), { recursive: true });

  const previous = existsSync(join(videoDir, "narration.json"))
    ? JSON.parse(readFileSync(join(videoDir, "narration.json"), "utf8"))
    : null;

  // Lint every scene that would be newly voiced (cached scenes were already accepted). A recording is
  // the narrator's own wording, and the script has to match what they said, so it isn't held to this.
  const allowed = new Set(meta.allow_spoken ?? []);
  const problems = [];
  for (const scene of scenes) {
    if (recorded || (args.only && args.only !== scene.id)) continue;
    const text = spoken(scene);
    if (existsSync(join(CACHE, `${hashOf(shapeOf(scene))}.mp3`))) continue;
    const found = shortenings(text, allowed);
    if (found.length) problems.push(`  ${scene.id}: ${found.join(", ")}`);
  }
  if (problems.length) {
    throw new Error(
      `narration must say things in full (no acronyms or shortenings):\n${problems.join("\n")}\n` +
        `Rewrite them in script.md, map them under pronounce:, or list a deliberate exception under allow_spoken:.`,
    );
  }

  // Every scene that needs voicing is voiced at once; each scene's paragraphs run concurrently too.
  if (provider !== "elevenlabs") alignerPython(); // create the venv once, before any parallel use
  const out = await Promise.all(
    scenes.map(async (scene) => {
      const text = spoken(scene);
      const hash = hashOf(shapeOf(scene));
      const cachedMp3 = join(CACHE, `${hash}.mp3`);
      const cachedWords = join(CACHE, `${hash}.json`);

      const skip = args.only && args.only !== scene.id;
      if (!existsSync(cachedMp3) || !existsSync(cachedWords)) {
        if (skip) {
          const kept = previous?.scenes.find((s) => s.id === scene.id);
          if (!kept) throw new Error(`--only ${args.only}: scene "${scene.id}" has never been narrated`);
          return { ...kept, title: scene.title };
        }
        console.log(`  narrating ${scene.id} (${text.length} chars, ${provider})…`);
        const words = await SYNTHESIZE[provider](text, voice, cachedMp3, scene.id, sources.get(scene.id));
        writeFileSync(cachedWords, JSON.stringify(words));
        console.log(`  done      ${scene.id}`);
      } else {
        console.log(`  cached    ${scene.id}`);
      }

      // Every provider's clip is brought to LOUDNESS beside the cached one, so the level can change
      // without voicing anything again.
      const leveled = join(CACHE, `${hash}.lufs${-LOUDNESS.lufs}.mp3`);
      if (!existsSync(leveled)) normalizeLoudness(cachedMp3, leveled);
      const audio = `${video}/${scene.id}.mp3`;
      copyFileSync(leveled, join(publicRoot, audio));
      return {
        id: scene.id,
        title: scene.title,
        audio,
        hash,
        duration: probeDuration(leveled),
        // A recorded scene's take, and for a part of the talk, the seconds of it the clip was cut from.
        ...(sources.has(scene.id) && { take: takeOf(sources.get(scene.id)) }),
        words: JSON.parse(readFileSync(cachedWords, "utf8")),
      };
    }),
  );

  // The timeline: each scene holds `leadIn` of picture, its narration, then `tail`.
  let from = 0;
  for (const scene of out) {
    scene.leadInFrames = Math.round(timing.leadIn * timing.fps);
    scene.frames = scene.leadInFrames + Math.ceil(scene.duration * timing.fps) + Math.round(timing.tail * timing.fps);
    scene.from = from;
    from += scene.frames;
  }

  const narration = {
    video,
    provider,
    voice: voice.id,
    fps: timing.fps,
    width: timing.width,
    height: timing.height,
    frames: from,
    scenes: out,
  };
  writeFileSync(join(videoDir, "narration.json"), JSON.stringify(narration, null, 1) + "\n");
  writeFileSync(join(videoDir, "captions.srt"), captions(narration));
  console.log(`${video}: ${out.length} scenes, ${(from / timing.fps / 60).toFixed(1)} min`);
}

/** SubRip captions, a sentence (or ~12 words) per cue, timed on the composition's timeline. */
function captions({ fps, scenes }) {
  const cues = [];
  for (const scene of scenes) {
    const offset = (scene.from + scene.leadInFrames) / fps;
    let run = [];
    const flush = () => {
      if (run.length === 0) return;
      cues.push({ s: offset + run[0].s, e: offset + run.at(-1).e, text: run.map((w) => w.w).join(" ") });
      run = [];
    };
    for (const word of scene.words) {
      run.push(word);
      if (/[.!?]["”]?$/.test(word.w) || (run.length >= 12 && /[,;:—]$/.test(word.w)) || run.length >= 16) flush();
    }
    flush();
  }
  return toSrt(cues);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
