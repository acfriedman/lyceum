#!/usr/bin/env node
// Narrates a video's script: one audio clip per scene, with word timings, plus the timeline the
// composition and the captions are laid out from.
//
//   lyceum narrate <video> [--provider openai|elevenlabs|say] [--only <scene-id>]
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
// The project's lyceum.config.json can set a default `voice`, plus `pronounce` and `allowSpoken`
// entries that apply to every script; a script's own frontmatter wins.

import { createHash } from "node:crypto";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { withSlot } from "./slots.mjs";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
    console.error("usage: lyceum narrate <video> [--provider openai|elevenlabs|say] [--only <scene-id>]");
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
 *  words Whisper never heard (`missing`). Paths are unique per clip, so calls may run concurrently. */
async function align(text, mp3Path, sentinel) {
  const textPath = mp3Path.replace(/\.mp3$/, ".txt");
  writeFileSync(textPath, text);
  const { stdout } = await whisperSlot(() =>
    promisify(execFile)(alignerPython(), [join(dirname(fileURLToPath(import.meta.url)), "align.py"), mp3Path, textPath, ...(sentinel ? [sentinel] : [])], {
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

const SYNTHESIZE = { openai: synthesizeOpenAI, elevenlabs: synthesizeElevenLabs, say: synthesizeSay };

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

  mkdirSync(CACHE, { recursive: true });
  const publicRoot = preparePublic();
  mkdirSync(join(publicRoot, video), { recursive: true });

  const previous = existsSync(join(videoDir, "narration.json"))
    ? JSON.parse(readFileSync(join(videoDir, "narration.json"), "utf8"))
    : null;

  // Lint every scene that would be newly voiced (cached scenes were already accepted).
  const allowed = new Set(meta.allow_spoken ?? []);
  const problems = [];
  for (const scene of scenes) {
    if (args.only && args.only !== scene.id) continue;
    const text = spokenText(scene.narration, meta.pronounce);
    const hash = createHash("sha256").update(JSON.stringify({ provider, voice, text })).digest("hex").slice(0, 16);
    if (existsSync(join(CACHE, `${hash}.mp3`))) continue;
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
      const text = spokenText(scene.narration, meta.pronounce);
      const shape = { provider, voice, text };
      const hash = createHash("sha256").update(JSON.stringify(shape)).digest("hex").slice(0, 16);
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
        const words = await SYNTHESIZE[provider](text, voice, cachedMp3, scene.id);
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
