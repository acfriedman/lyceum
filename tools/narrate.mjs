#!/usr/bin/env node
// Narrates a video's script: one audio clip per scene, with word timings, plus the timeline the
// composition and the captions are laid out from.
//
//   lyceum narrate <video> [--provider say|openai|gemini] [--only <scene-id>]
//
// Each clip is cached under .cache/narration by a hash of everything that shapes the audio (provider,
// voice, model, settings, spoken text), so re-running after a script edit only pays for the scenes
// whose narration changed. Every clip is brought to the same loudness (LOUDNESS), so separate takes
// don't jump in volume. Keys (OPENAI_KEY or OPENAI_API_KEY, GEMINI_API_KEY) come from the environment or
// from the project's own .env (see env.mjs).
//
// The default voice is macOS's say, which runs on this machine: narration goes nowhere unless a project
// or script picks a hosted voice with `voice: { provider, id, … }` (`lyceum init` writes the one chosen
// there). A voice's fields override that provider's defaults below. Word timings come from
// align.py (beside this file), which derives them with local Whisper (a Python venv shared by every
// project, under the Lyceum home directory, created on first use).
//
// The project's lyceum.config.json lists the only `providers` its narration may be sent to: until it
// does, nothing is sent to a hosted voice. It can also set a default `voice`, pin each provider's voice
// under `voices` (its model, say), and add `pronounce` and `allowSpoken` entries that apply to every
// script; a script's own frontmatter wins.
//
// Nothing is sent that holds a sensitive string (an email, a phone number or a credential, written or
// spoken: see sensitive.mjs), whatever the provider, since the text also ends up in the captions. The
// only exceptions are exact strings the project lists under `allowSensitive`, never a script's
// frontmatter, and each one used is recorded in narration.json.

import { createHash } from "node:crypto";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { ALIGNERS, PYTHON, lock, specs } from "./aligners.mjs";
import { withSlot } from "./slots.mjs";
import { secret } from "./env.mjs";
import { fetchNarration, pushNarration } from "./store.mjs";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { toSrt } from "./captions.mjs";
import { describe, findSensitive } from "./sensitive.mjs";
import { parseScript, spokenText } from "./script.mjs";
import { CACHE as CACHE_ROOT, CONFIG, CONFIG_FILE, ENGINE, HOME, ROOT, preparePublic, videoDir as resolveVideoDir, videoSlug } from "./paths.mjs";

const CACHE = join(CACHE_ROOT, "narration");

const DEFAULTS = {
  fps: 30,
  width: 1920,
  height: 1080,
  // Seconds of picture before a scene's narration starts and after it ends.
  leadIn: 0.6,
  tail: 1.1,
};

// Hosted voices are voiced paragraph by paragraph, with a trimmed sentinel, each checked against the
// script and loudness-normalized (see byParagraph). Bump the version when that processing changes: the
// raw speech is cached apart (see cachedSpeech), so it re-processes clips without re-billing them.
const PARAGRAPHS = "paragraph+sentinel+loudness@5";

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
    chunk: PARAGRAPHS,
  },
  gemini: {
    provider: "gemini",
    id: "Charon",
    model: "gemini-3.8-flash-tts",
    // Sent as Gemini's style, apart from the text, which it reads verbatim. Kept short: Google warns
    // that long style directions make the voice drift.
    instructions: "A calm, curious explainer narrator: warm, intelligent and unhurried, never rushed or theatrical.",
    chunk: PARAGRAPHS,
  },
  say: { provider: "say", id: "Samantha", rate: 180 },
};

// The provider when nothing names one: the local voice, so nothing is sent anywhere unless someone chose
// to send it. A `voice:` without a `provider` is this provider's voice too.
const DEFAULT_PROVIDER = "say";

/**
 * The voice a run uses: `--provider` wins, then the script's `voice:` (else the project's), then
 * DEFAULT_PROVIDER. Its defaults are that provider's VOICES entry with the project's `voices` entry for
 * it on top, whichever way the provider was chosen. Overrides keep VOICES' key order, so a project
 * without them keeps its cache. `from` names where `scripted` came from, for errors.
 */
function resolveVoice(cliProvider, scripted = {}, from = CONFIG_FILE) {
  const expected = `expected ${Object.keys(VOICES).join(", ")}`;
  for (const name of Object.keys(CONFIG.voices)) {
    if (!VOICES[name]) throw new Error(`${CONFIG_FILE}: unknown provider "${name}" under voices (${expected})`);
  }
  if (CONFIG.providers !== undefined) {
    if (!Array.isArray(CONFIG.providers)) throw new Error(`${CONFIG_FILE}: providers must be a list, e.g. ["openai", "say"]`);
    for (const name of CONFIG.providers) {
      if (!VOICES[name]) throw new Error(`${CONFIG_FILE}: unknown provider "${name}" under providers (${expected})`);
    }
  }
  const provider = cliProvider ?? scripted.provider ?? DEFAULT_PROVIDER;
  if (!VOICES[provider]) throw new Error(`unknown provider "${provider}" (${expected})`);
  const base = { ...VOICES[provider], ...CONFIG.voices[provider], provider };
  // The script's overrides describe its own provider's voice; they don't carry over to another one.
  if ((scripted.provider ?? DEFAULT_PROVIDER) !== provider) return base;
  // A voice written for a hosted provider before say became the default names none: say would ignore
  // its delivery and model, so it says so rather than read the script in another voice.
  const hosted = ["instructions", "model"].filter((field) => field in scripted && !(field in VOICES[provider]));
  if (!scripted.provider && hosted.length) {
    throw new Error(
      `voice: in ${from} has ${hosted.join(" and ")} but no provider, and a voice without one is ${provider}'s, ` +
        `which takes neither. Add the provider it was written for, e.g. voice: { provider: openai, … }.`,
    );
  }
  return { ...base, ...scripted, provider };
}

/** Where a run's provider was chosen, for messages: the flag, the script, the project, or the default. */
function providerChoice(cliProvider, scriptVoice, video) {
  if (cliProvider) return "--provider";
  if (scriptVoice) return scriptVoice.provider ? `voice: in ${video}/script.md` : `Lyceum's default, ${DEFAULT_PROVIDER} (voice: in ${video}/script.md names no provider)`;
  if (CONFIG.voice?.provider) return `voice in ${CONFIG_FILE}`;
  return `Lyceum's default, ${DEFAULT_PROVIDER}`;
}

// Voices that run on this machine: their narration goes nowhere, so they need no `providers` entry
// while a project hasn't set one.
const LOCAL = new Set(["say"]);

/**
 * A project's `providers` lists where its narration may be sent: nothing is voiced by any other
 * provider, and until the project sets it, by no hosted provider at all (a local voice still runs).
 * Clips already cached never leave the machine, so they're reused whatever their provider; only
 * `toVoice`, the scenes that would be voiced now, are refused.
 */
function checkProviderAllowed(provider, chosenBy, toVoice) {
  const allowed = CONFIG.providers;
  if (toVoice.length === 0) return;
  if (allowed === undefined) {
    if (LOCAL.has(provider)) return;
    throw new Error(
      `${CONFIG_FILE} doesn't say where narration may be sent, so nothing was sent: ${toVoice.join(", ")} ` +
        `would go to "${provider}" (chosen by ${chosenBy}).\n` +
        `List the voice providers this project may use in ${join(ROOT, CONFIG_FILE)}, e.g. "providers": ["${provider}"]. ` +
        `Known providers: ${Object.keys(VOICES).join(", ")}; ${[...LOCAL].join(", ")} runs on this machine and is allowed without it.`,
    );
  }
  if (allowed.includes(provider)) return;
  throw new Error(
    `provider "${provider}" (chosen by ${chosenBy}) isn't allowed in this project: ${CONFIG_FILE} allows ` +
      `${allowed.length ? allowed.join(", ") : "none"}, and ${toVoice.join(", ")} would be sent to it.\n` +
      `Narrate with an allowed provider, or add "${provider}" to providers in ${CONFIG_FILE}.`,
  );
}

function parseArgs(argv) {
  const args = { dir: null, provider: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--provider") args.provider = argv[++i];
    else if (argv[i] === "--only") args.only = argv[++i];
    else args.dir = argv[i];
  }
  if (!args.dir) {
    console.error("usage: lyceum narrate <video> [--provider say|openai|gemini] [--only <scene-id>]");
    process.exit(2);
  }
  return args;
}

// The Whisper that aligns narration: ALIGNERS (tools/aligners.mjs) pins, per backend, the package's
// release, its whole dependency tree (a lockfile with hashes) and the model's revision.
//
// The backend is LYCEUM_ALIGNER, else `whisper.backend` in lyceum.config.json, else mlx on Apple
// Silicon and faster-whisper elsewhere. A project can pin either under `whisper.mlx` or
// `whisper["faster-whisper"]` (a flat `whisper: { version, model, revision }` still pins mlx). Each
// release gets its own venv and each revision its own download, so changing a pin never reuses the old
// one. A project that pins another release (or other `requires`) than ALIGNERS gets it resolved fresh,
// since Lyceum's lockfile is for its own pins. The clip cache's key leaves the aligner out: clips already
// cached keep the word timings they were accepted with, whichever backend timed them.
const ALIGNER = process.env.LYCEUM_ALIGNER || CONFIG.whisper?.backend || (process.platform === "darwin" && process.arch === "arm64" ? "mlx" : "faster-whisper");
if (!ALIGNERS[ALIGNER]) throw new Error(`unknown aligner "${ALIGNER}": use ${Object.keys(ALIGNERS).join(" or ")}`);
const WHISPER = (() => {
  const { backend, mlx, "faster-whisper": faster, ...flat } = CONFIG.whisper ?? {};
  return { ...ALIGNERS[ALIGNER], ...(ALIGNER === "mlx" ? { ...flat, ...mlx } : faster) };
})();
const ALIGN_PY = join(dirname(fileURLToPath(import.meta.url)), "align.py");

let alignerBin;
/**
 * The Python that runs align.py: a venv with the pinned aligner, created with uv on first use. It's
 * installed from the backend's lockfile, every package checked against its hash (a mismatch fails the
 * install), unless the project pins another release than the lockfile's.
 */
function alignerPython() {
  if (alignerBin) return alignerBin;
  // mlx keeps its original venv name, so existing machines reuse theirs.
  const venv = join(HOME, ALIGNER === "mlx" ? `whisper-${WHISPER.version}` : `${WHISPER.package}-${WHISPER.version}`);
  const installed = join(venv, ".installed"); // written last, so an interrupted install is redone
  const wanted = specs(WHISPER);
  const locked = wanted.join("\n") === specs(ALIGNERS[ALIGNER]).join("\n") ? lock(ALIGNER) : null;
  // What the venv holds: the lockfile it was installed from, by hash, or the specs it was resolved from.
  const stamp = locked ? `${relative(ENGINE, locked.path)} sha256:${locked.sha256}\n` : `${wanted.join("\n")}\n`;
  if (!existsSync(installed) || readFileSync(installed, "utf8") !== stamp) {
    console.log(`  creating ${venv} (${wanted.join(", ")}${locked ? ", from its lockfile" : ""}) for word alignment…`);
    if (!locked) {
      console.log(`  ${CONFIG_FILE} pins ${wanted.join(", ")}, which Lyceum's lockfile doesn't: resolving it fresh, without hashes`);
    }
    const env = { ...process.env, VIRTUAL_ENV: venv };
    execFileSync("uv", ["venv", "-q", "--clear", "--python", PYTHON, venv], { stdio: "inherit" });
    if (locked) execFileSync("uv", ["pip", "sync", "-q", "--require-hashes", locked.path], { stdio: "inherit", env });
    else execFileSync("uv", ["pip", "install", "-q", ...wanted], { stdio: "inherit", env });
    writeFileSync(installed, stamp);
  }
  return (alignerBin = join(venv, "bin", "python"));
}

let modelDir;
/** The pinned Whisper model's local directory, downloaded on first use (about 1.6 GB, once per revision). */
function whisperModel() {
  const python = alignerPython();
  try {
    modelDir ??= String(execFileSync(python, [ALIGN_PY, "--fetch", WHISPER.model, WHISPER.revision], { stdio: ["ignore", "pipe", "inherit"] })).trim();
  } catch {
    throw new Error(`couldn't fetch the Whisper model ${WHISPER.model} at revision ${WHISPER.revision} (see above)`);
  }
  return modelDir;
}

// Whisper loads its model per process, so alignments take machine-wide slots (see slots.mjs): the cap
// holds however many narrations run at once.
const whisperSlot = (task) => withSlot("whisper", task);

/** Word timings for a clip, from local Whisper matched back to the script's words, plus the script
 *  words Whisper never heard (`missing`). Paths are unique per clip, so calls may run concurrently. */
async function align(text, audioPath, sentinel) {
  const textPath = audioPath.replace(/\.\w+$/, ".txt");
  writeFileSync(textPath, text);
  const { stdout } = await whisperSlot(() =>
    promisify(execFile)(alignerPython(), [ALIGN_PY, "--backend", ALIGNER, audioPath, textPath, whisperModel(), ...(sentinel ? [sentinel] : [])], {
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  return JSON.parse(String(stdout));
}

function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(String(out).trim());
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
// closing one). A throwaway sentence after it absorbs the drop; the audio is cut before it. Gemini is
// voiced the same way, so a drop there is caught too.
const SENTINEL = "Okay.";

/**
 * One billed speech request, cached under .cache/tts-raw by exactly what was sent (and the attempt
 * number, so a retry is a fresh take). The audio is kept *before* any trimming or alignment: changing
 * how clips are processed never pays for the same speech twice.
 */
async function cachedSpeech(request, attempt, extension, fetchAudio) {
  const key = createHash("sha256").update(JSON.stringify({ request, attempt })).digest("hex").slice(0, 16);
  const rawPath = join(CACHE_ROOT, "tts-raw", `${key}.${extension}`);
  if (existsSync(rawPath)) return rawPath;
  mkdirSync(dirname(rawPath), { recursive: true });
  writeFileSync(rawPath, await fetchAudio(request));
  return rawPath;
}

function openAISpeech(voice, input, attempt) {
  const request = { model: voice.model, voice: voice.id, input, instructions: voice.instructions, response_format: "mp3" };
  return cachedSpeech(request, attempt, "mp3", async () => {
    assertSendable(request, "OpenAI");
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret("OPENAI_KEY", "OPENAI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    return Buffer.from(await response.arrayBuffer());
  });
}

/** Gemini reads `text` verbatim and takes the delivery as a separate style; it answers with a WAV. */
function geminiSpeech(voice, input, attempt) {
  const annotations = voice.instructions ? [{ type: "speech_metadata", style: voice.instructions }] : [];
  const request = {
    model: voice.model,
    input: [{ type: "user_input", content: [{ type: "text", text: input, annotations }] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: voice.id }] },
  };
  return cachedSpeech(request, attempt, "wav", async () => {
    assertSendable(request, "Gemini");
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": secret("GEMINI_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const { steps = [] } = await response.json();
    const audio = steps
      .filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .filter((part) => part.type === "audio")
      .at(-1);
    if (!audio?.data) throw new Error("Gemini returned no audio");
    return Buffer.from(audio.data, "base64");
  });
}

/**
 * A hosted voice reads a scene one paragraph at a time (all paragraphs concurrently), each with
 * SENTINEL appended. Each paragraph is aligned against its real text, cut between its last word and
 * the sentinel, checked for skipped words (and retried), and brought to LOUDNESS (each is a separate
 * take, so they differ), then the paragraphs are joined with a short pause.
 */
const byParagraph = (speech) => async (text, voice, mp3Path, label) => {
  const paragraphs = paragraphsOf(text);
  const parts = await Promise.all(
    paragraphs.map(async (paragraph, index) => {
      const partPath = mp3Path.replace(/\.mp3$/, `.p${index}.mp3`);
      for (let attempt = 1; ; attempt++) {
        const rawPath = await speech(voice, `${paragraph} ${SENTINEL}`, attempt);
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
};

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
  assertSendable({ text }, "say");
  const aiff = mp3Path.replace(/\.mp3$/, ".aiff");
  try {
    execFileSync("say", ["-v", voice.id, "-r", String(voice.rate), "-o", aiff, text]);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(
      `say is macOS's voice, and this machine doesn't have it: to narrate here, name a hosted voice ` +
        `("voice" and "providers" in ${CONFIG_FILE}, or --provider openai|gemini)`,
    );
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-b:a", "192k", mp3Path]);
  return (await align(text, mp3Path)).words;
}

const SYNTHESIZE = { openai: byParagraph(openAISpeech), gemini: byParagraph(geminiSpeech), say: synthesizeSay };

/** A scene's paragraphs: a hosted voice reads each in a request of its own (see byParagraph). */
function paragraphsOf(text) {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** The spoken text of every request voicing a scene sends: each paragraph with SENTINEL for a hosted
 *  voice, the whole scene for say. (A hosted voice's instructions go with each one too.) */
function requestTexts(text, provider) {
  return provider === "say" ? [text] : paragraphsOf(text).map((paragraph) => `${paragraph} ${SENTINEL}`);
}

// Exact strings the project lets through the sensitive-string check: only from lyceum.config.json, which
// the user controls, never from a script, which an agent writes and could approve its own exceptions in.
const ALLOW_SENSITIVE = new Set(CONFIG.allowSensitive);

/** The sensitive strings in some text: those the project didn't except (`refused`), and those it did. */
function sensitive(texts) {
  const found = [...new Map(texts.flatMap((text) => findSensitive(text)).map((f) => [f.match, f])).values()];
  return { refused: found.filter((f) => !ALLOW_SENSITIVE.has(f.match)), excepted: found.filter((f) => ALLOW_SENSITIVE.has(f.match)) };
}

/** The last check before a request goes out: every string in it, the text and the voice's instructions.
 *  Each scene was checked before any was voiced, so this only stops what slipped past that. */
function assertSendable(request, provider) {
  const strings = [];
  const collect = (value) => {
    if (typeof value === "string") strings.push(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(request);
  const { refused } = sensitive(strings);
  if (refused.length) throw new Error(`refusing to send ${provider} a request with ${refused.map(describe).join(", ")}`);
}

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

  if (scripted.allowSensitive !== undefined || scripted.allow_sensitive !== undefined) {
    throw new Error(
      `${video}/script.md: a script can't list exceptions to the sensitive-string check; only the user can, ` +
        `under allowSensitive in ${CONFIG_FILE}`,
    );
  }

  const timing = { ...DEFAULTS, ...(meta.timing ?? {}) };
  const voice = resolveVoice(args.provider, meta.voice, scripted.voice ? `${video}/script.md` : CONFIG_FILE);
  const provider = voice.provider;

  mkdirSync(CACHE, { recursive: true });
  const publicRoot = preparePublic();
  mkdirSync(join(publicRoot, video), { recursive: true });

  const previous = existsSync(join(videoDir, "narration.json"))
    ? JSON.parse(readFileSync(join(videoDir, "narration.json"), "utf8"))
    : null;

  // Lint every scene that would be newly voiced (cached scenes were already accepted), and check
  // that its provider is allowed, before anything is sent.
  const clipHash = (text) => createHash("sha256").update(JSON.stringify({ provider, voice, text })).digest("hex").slice(0, 16);
  const cached = (hash) => existsSync(join(CACHE, `${hash}.mp3`)) && existsSync(join(CACHE, `${hash}.json`));

  // A clip voiced on another machine (or in CI) comes from the project's store, when it has one.
  const fetched = new Set();
  await Promise.all(
    scenes.map(async (scene) => {
      if (args.only && args.only !== scene.id) return;
      const hash = clipHash(spokenText(scene.narration, meta.pronounce));
      if (!cached(hash) && (await fetchNarration(hash, -LOUDNESS.lufs))) fetched.add(scene.id);
    }),
  );

  const allowed = new Set(meta.allow_spoken ?? []);
  const problems = [];
  const leaks = [];
  const exceptions = []; // each allowSensitive entry used, and where: recorded in narration.json
  const toVoice = [];
  // A hosted voice's instructions go out with every request, so they matter once anything is voiced.
  const instructions = provider !== "say" && voice.instructions ? sensitive([voice.instructions]) : { refused: [], excepted: [] };
  exceptions.push(...instructions.excepted.map((f) => ({ in: "voice instructions", match: f.match })));
  for (const scene of scenes) {
    const text = spokenText(scene.narration, meta.pronounce);
    // Every scene's exceptions are recorded, voiced now or not, so narration.json lists them all.
    const { refused, excepted } = sensitive(requestTexts(text, provider));
    exceptions.push(...excepted.map((f) => ({ in: scene.id, match: f.match })));
    if (args.only && args.only !== scene.id) continue;
    if (cached(clipHash(text))) continue;
    toVoice.push(scene.id);
    if (refused.length) leaks.push(`  ${scene.id}: ${refused.map(describe).join(", ")}`);
    const found = shortenings(text, allowed);
    if (found.length) problems.push(`  ${scene.id}: ${found.join(", ")}`);
  }
  // A video voiced with another provider while that was Lyceum's default (OpenAI, until say) names none,
  // and would otherwise be voiced again, every scene, in another voice.
  if (!args.provider && !meta.voice?.provider && previous?.provider && previous.provider !== provider && toVoice.length) {
    throw new Error(
      `${video} was narrated with ${previous.provider} (see its narration.json), but nothing names a provider now, and ` +
        `Lyceum's default is ${provider}: every scene would be voiced again, in another voice. To keep its voice, set ` +
        `"voice": { "provider": "${previous.provider}" } in ${CONFIG_FILE}, and list it under "providers". To move it to ` +
        `${provider}, narrate with --provider ${provider}.`,
    );
  }
  if (toVoice.length && instructions.refused.length) leaks.unshift(`  the voice's instructions: ${instructions.refused.map(describe).join(", ")}`);
  if (leaks.length) {
    throw new Error(
      `narration can't contain emails, phone numbers or credentials: it would be sent to ${provider}, and ` +
        `written into the captions. Nothing was sent.\n${leaks.join("\n")}\n` +
        `Take them out of script.md (credentials are shown shortened). If one really must be said, only the user can ` +
        `allow it, by listing the exact string under allowSensitive in ${CONFIG_FILE}.`,
    );
  }
  if (problems.length) {
    throw new Error(
      `narration must say things in full (no acronyms or shortenings):\n${problems.join("\n")}\n` +
        `Rewrite them in script.md, map them under pronounce:, or list a deliberate exception under allow_spoken:.`,
    );
  }
  checkProviderAllowed(provider, providerChoice(args.provider, scripted.voice, video), toVoice);

  // Every scene that needs voicing is voiced at once; each scene's paragraphs run concurrently too.
  if (toVoice.length) whisperModel(); // create the venv and fetch the model once, before any parallel use
  const out = await Promise.all(
    scenes.map(async (scene) => {
      const text = spokenText(scene.narration, meta.pronounce);
      const hash = clipHash(text);
      const cachedMp3 = join(CACHE, `${hash}.mp3`);
      const cachedWords = join(CACHE, `${hash}.json`);

      const skip = args.only && args.only !== scene.id;
      let voiced = false;
      if (!existsSync(cachedMp3) || !existsSync(cachedWords)) {
        if (skip) {
          const kept = previous?.scenes.find((s) => s.id === scene.id);
          if (!kept) throw new Error(`--only ${args.only}: scene "${scene.id}" has never been narrated`);
          return { ...kept, title: scene.title };
        }
        console.log(`  narrating ${scene.id} (${text.length} chars, ${provider})…`);
        const words = await SYNTHESIZE[provider](text, voice, cachedMp3, scene.id);
        writeFileSync(cachedWords, JSON.stringify(words));
        voiced = true;
        console.log(`  done      ${scene.id}`);
      } else {
        console.log(`  ${fetched.has(scene.id) ? "fetched" : "cached "}   ${scene.id}`);
      }

      // Every provider's clip is brought to LOUDNESS beside the cached one, so the level can change
      // without voicing anything again.
      const leveled = join(CACHE, `${hash}.lufs${-LOUDNESS.lufs}.mp3`);
      if (!existsSync(leveled)) normalizeLoudness(cachedMp3, leveled);
      // The leveled clip goes up too: its duration sets the timeline, so every machine must play the same one.
      if (voiced) await pushNarration(hash);
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
    ...(exceptions.length ? { sensitiveExceptions: exceptions } : {}),
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
