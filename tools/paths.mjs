// Where everything lives. Lyceum is a package; the videos live in a *project* that uses it. The tools
// import their paths from here, so the layout is described once.
//
// In the Lyceum package (ENGINE):
//   kit/        the Remotion side: timing (cue), primitives, theme, the Video layout
//   tools/      these command-line tools
//   fonts/      fonts the kit loads
//
// In a project (ROOT, the nearest directory holding lyceum.config.json):
//   lyceum.config.json      the project's settings (see loadConfig)
//   videos/index.ts         the registry of videos the compositions are built from
//   videos/<video>/         script.md, scenes/, and the generated narration.json + captions.srt
//   videos/<video>/dist/    the deliverables: <video>.mp4, <video>.srt, scenes/<scene>.mp4 (gitignored)
//   .cache/                 everything regenerable (gitignored): TTS clips, the Remotion public
//                           directory, and per-video review scratch (word timings, contact sheets)
//
// Shared by every project on the machine (HOME): the Whisper venv and the slot locks that cap how
// much memory-hungry work runs at once.

import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_FILE = "lyceum.config.json";

/** The Lyceum package's own directory. */
export const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KIT = join(ENGINE, "kit");
export const ENTRY = join(KIT, "index.ts");

/** The machine-wide Lyceum directory: `LYCEUM_HOME`, else the platform's cache directory. */
export const HOME =
  process.env.LYCEUM_HOME ??
  (platform() === "darwin"
    ? join(homedir(), "Library", "Caches", "lyceum")
    : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "lyceum"));

/** The project directory: `LYCEUM_PROJECT`, else the nearest directory above the working directory
 *  that holds lyceum.config.json. */
export function findProject(from = process.env.LYCEUM_PROJECT ?? process.cwd()) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    if (dir === dirname(dir)) break;
  }
  console.error(`No ${CONFIG_FILE} in ${resolve(from)} or above it. Run \`lyceum init\` to make this a Lyceum project.`);
  process.exit(2);
}

/**
 * A project's settings, with defaults:
 *   videos       the videos directory (default "videos")
 *   cache        the regenerable cache directory (default ".cache")
 *   brief        a markdown file the agent skill reads first: audience, house rules, ground truth
 *   voice        the default narration voice, as a script's `voice:` frontmatter would set it
 *   pronounce    written form → spoken form, for every script (a script's own map wins)
 *   allowSpoken  words the acronym check lets through, for every script
 */
export function loadConfig(root) {
  const raw = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
  return { videos: "videos", cache: ".cache", pronounce: {}, allowSpoken: [], ...raw };
}

export const ROOT = findProject();
export const CONFIG = loadConfig(ROOT);
export const VIDEOS = join(ROOT, CONFIG.videos);
export const CACHE = join(ROOT, CONFIG.cache);
export const REGISTRY = join(VIDEOS, "index.ts");

/** Remotion's public directory: narration audio plus a copy of the fonts. Regenerable. */
export const PUBLIC = join(CACHE, "public");

/** A video's source directory, from its slug or a path to it. */
export function videoDir(video) {
  return video.includes("/") ? resolve(video) : join(VIDEOS, video);
}

/** A video's slug, from its slug or a path to it. */
export function videoSlug(video) {
  return basename(videoDir(video));
}

/** Where a video's renders go. */
export function distDir(video) {
  return join(videoDir(video), "dist");
}

/** A video's review scratch: word timings for authoring cues, contact sheets for checking scenes. */
export function workDir(video) {
  const dir = join(CACHE, "work", videoSlug(video));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Makes sure the public directory exists and holds the fonts, and returns it. */
export function preparePublic() {
  mkdirSync(PUBLIC, { recursive: true });
  cpSync(join(ENGINE, "fonts"), join(PUBLIC, "fonts"), { recursive: true });
  return PUBLIC;
}
