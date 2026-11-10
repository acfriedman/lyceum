// Coverage: which files in the repository must each have a video, and the block that links a file to its
// video. A project opts in with `coverage` in lyceum.config.json:
//
//   "coverage": { "explains": "**/README.md", "exclude": ["Tests/**"] }
//
// `explains` (a glob or a list of them) and `exclude` are relative to the root of the git repository
// holding the project, and match tracked files only, so dependency and build folders never count, nor
// does anything inside the project itself. A video says which file it explains with `explains:` in its
// script's frontmatter, and `lyceum stale` reports covered files with no video (`missing`) and videos
// whose file is gone (`orphaned`).
//
// `lyceum embed <video>` writes the block that shows a video in the file it explains: a thumbnail
// linking to the published player page, between two markers. Both URLs are fixed, so the block is
// written once and a refresh never touches the file. Changes inside the block never make the video
// stale.

import { execFileSync } from "node:child_process";
import { basename, relative } from "node:path";
import { CONFIG, ROOT } from "./paths.mjs";

export const EMBED_START = "<!-- lyceum:video -->";
export const EMBED_END = "<!-- /lyceum:video -->";
const BLOCK = /^[ \t]*<!-- lyceum:video -->[\s\S]*?<!-- \/lyceum:video -->[ \t]*\n?(?:[ \t]*\n)?/m;

/** The project's coverage settings, or null when it has none. */
export const COVERAGE = CONFIG.coverage
  ? { explains: [CONFIG.coverage.explains].flat().filter(Boolean), exclude: [CONFIG.coverage.exclude ?? []].flat() }
  : null;

/**
 * The tracked files the project's coverage says must each have a video, relative to `repo`.
 * @param {string} repo  the root of the git repository holding the project
 * @returns {string[]}
 */
export function coveredFiles(repo) {
  if (!COVERAGE?.explains.length) return [];
  const own = relative(repo, ROOT);
  const spec = [
    ...COVERAGE.explains.map((glob) => `:(glob)${glob}`),
    ...COVERAGE.exclude.map((glob) => `:(glob,exclude)${glob}`),
    ...(own ? [`:(exclude)${own}`] : []),
  ];
  const out = execFileSync("git", ["-C", repo, "ls-files", "-z", "--", ...spec], { encoding: "utf8" });
  return out.split("\0").filter(Boolean).sort();
}

const kebab = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The repository's name: its `origin` remote's, so every checkout and worktree agrees, else its folder's. */
function repoName(repo) {
  try {
    const url = execFileSync("git", ["-C", repo, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const name = basename(url.replace(/\/+$/, "")).replace(/\.git$/, "");
    if (name) return name;
  } catch {}
  return basename(repo);
}

/**
 * A slug for a new video explaining `path`, unlike any in `taken`: named after the file's folder (the
 * repository's name for a file at its root), with more of the path before it until it's unique.
 * `Sources/GlossLint/README.md` → `gloss-lint`.
 */
export function suggestSlug(path, repo, taken) {
  const folders = path.split("/").slice(0, -1);
  const stem = basename(path).replace(/\.[^.]+$/, "");
  const named = /^(readme|index)$/i.test(stem) ? folders : [...folders, stem];
  const parts = named.length ? named : [repoName(repo)];
  for (let n = 1; n <= parts.length; n++) {
    const slug = kebab(parts.slice(-n).join("-")) || "video";
    if (!taken.has(slug)) return slug;
  }
  for (let i = 2; ; i++) if (!taken.has(`${kebab(parts.join("-"))}-${i}`)) return `${kebab(parts.join("-"))}-${i}`;
}

/** A file's text without its video block, so a change to the block alone doesn't count. */
export const withoutEmbed = (text) => text.replace(BLOCK, "");

/**
 * A file's text with `block` as its video block: in place of the one it has, else after its summary,
 * the first paragraph under its `#` title (where a README says what it is), else at the top.
 */
export function withEmbed(text, block) {
  const wrapped = `${EMBED_START}\n${block}\n${EMBED_END}\n`;
  if (BLOCK.test(text)) return text.replace(BLOCK, `${wrapped}\n`);
  const lines = text.split("\n");
  let fence = false;
  let title = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (!fence && /^# /.test(lines[i])) {
      title = i;
      break;
    }
  }
  if (title < 0) return `${wrapped}\n${text}`;
  let i = title + 1;
  while (i < lines.length && lines[i].trim() === "") i++; // to the summary
  if (i < lines.length && !/^#/.test(lines[i])) while (i < lines.length && lines[i].trim() !== "") i++; // past it
  const before = lines.slice(0, i).join("\n").replace(/\n*$/, "");
  const after = lines.slice(i).join("\n").replace(/^\n*/, "");
  return `${before}\n\n${wrapped}${after ? `\n${after}` : ""}`;
}
