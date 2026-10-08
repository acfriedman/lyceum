#!/usr/bin/env node
// Which videos may be out of date: for each video, the commits since it was last checked that touched
// the files its script names as sources.
//
//   lyceum stale [<video>…] [--json]        report; exits 1 if any video is stale
//   lyceum stale --mark <video>… [--at <commit>]
//                                           record that a video was checked against the current commit
//
// A script names its sources in the frontmatter, one per line, a path first and what it rests on in
// parentheses: `tools/render.mjs (one scene re-rendered on its own)`. Every path-like word outside the
// parentheses is watched (`:12-40` line ranges are dropped, and a directory or glob watches what's
// in it). Paths are relative to the root of the git repository holding the project. A path whose first
// part names a checkout next to that repository (`haruspec/Sources/…`) is in that repository instead.
//
// The commit a video was checked against is `verified:` in its frontmatter: a commit of the project's
// repository, or, when its sources span checkouts, a map of checkout name to commit, with "." for the
// project's own (`verified: { ".": "1a2b3c4", haruspec: "5d6e7f8" }`). `--mark` writes it. A video
// without one is measured from the last commit that touched its directory, so a new video needs no
// setup. Changes to the video's own directory never count, nor do changes to another script that only
// move its `verified:` commit.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { ROOT, VIDEOS, videoDir, videoSlug } from "./paths.mjs";
import { frontmatter } from "./script.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const mark = args.includes("--mark");
const atIndex = args.indexOf("--at");
const at = atIndex >= 0 ? args[atIndex + 1] : null;
const named = args.filter((arg, i) => !arg.startsWith("--") && !(atIndex >= 0 && i === atIndex + 1));
if ((atIndex >= 0 && !at) || (at && !mark) || (mark && named.length === 0)) {
  console.error("usage: lyceum stale [<video>…] [--json]\n       lyceum stale --mark <video>… [--at <commit>]");
  process.exit(2);
}

/** Runs git in a repository and returns its output, trimmed; null if git fails and `quiet` is set. */
function git(repo, gitArgs, { quiet = false } = {}) {
  try {
    return execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (quiet) return null;
    throw new Error(`git ${gitArgs.join(" ")} in ${repo}: ${String(error.stderr ?? error.message).trim()}`);
  }
}

const HOME_REPO = git(ROOT, ["rev-parse", "--show-toplevel"], { quiet: true });
if (!HOME_REPO) {
  console.error(`${ROOT} isn't in a git repository, so there's no history to check videos against.`);
  process.exit(2);
}

/** The checkout `name` next to the project's repository, if there is one. */
function sibling(name) {
  if (!name || name === "." || name === ".." || name === basename(HOME_REPO)) return null;
  const dir = join(dirname(HOME_REPO), name);
  return existsSync(join(dir, ".git")) ? dir : null;
}

const hasGlob = (path) => /[*?[]/.test(path);

/** Whether `path` exists in `repo`'s working tree or at `commit` (so a deleted source still counts). */
function existsIn(repo, path, commit) {
  if (hasGlob(path)) return true;
  if (existsSync(join(repo, path))) return true;
  return commit ? git(repo, ["cat-file", "-e", `${commit}:${path.replace(/\/$/, "")}`], { quiet: true }) !== null : false;
}

/**
 * The paths a sources entry names: words outside parentheses that look like paths.
 * @returns {string[]}
 */
function pathWords(entry) {
  // `- a/b.ts (why: because)` parses as a map: a colon followed by a space reads as a key.
  let text =
    entry && typeof entry === "object"
      ? Object.entries(entry).map(([key, value]) => `${key}: ${value}`).join(" ")
      : String(entry);
  for (let previous = ""; previous !== text; ) [previous, text] = [text, text.replace(/\([^()]*\)/g, " ")];
  return text
    .split(/[\s,;]+/)
    .map((word) => word.replace(/^[`'"]+|[`'".:]+$/g, "").replace(/:[\d,-]+$/, ""))
    .filter((word) => word && word !== "and" && !word.startsWith("http"));
}

/**
 * Resolves a video's sources to repositories and paths.
 * @returns {{ watched: Map<string, string[]>, unresolved: string[] }}  repository directory → paths
 */
function resolveSources(sources, bases) {
  const watched = new Map([[HOME_REPO, []]]);
  const unresolved = [];
  for (const entry of Array.isArray(sources) ? sources : []) {
    for (const word of pathWords(entry)) {
      const looksLikePath = word.includes("/") || hasGlob(word) || /\.[A-Za-z]\w*$/.test(word);
      const [first, ...rest] = word.split("/");
      const other = sibling(first);
      if ((looksLikePath || existsSync(join(HOME_REPO, word))) && existsIn(HOME_REPO, word, bases.get(HOME_REPO))) {
        watched.get(HOME_REPO).push(word);
      } else if (other && existsIn(other, rest.join("/") || ".", null)) {
        if (!watched.has(other)) watched.set(other, []);
        watched.get(other).push(rest.join("/") || ".");
      } else if (looksLikePath) {
        unresolved.push(word);
      }
    }
  }
  return { watched, unresolved };
}

/** A script's `verified:` commits: repository directory → commit. */
function verifiedCommits(meta) {
  const verified = meta.verified;
  const commits = new Map();
  if (typeof verified === "string" && verified) commits.set(HOME_REPO, verified);
  else if (verified && typeof verified === "object") {
    for (const [name, commit] of Object.entries(verified)) {
      const repo = name === "." ? HOME_REPO : sibling(name);
      if (repo && commit) commits.set(repo, String(commit));
    }
  }
  return commits;
}

const isCommit = (repo, commit) => git(repo, ["cat-file", "-e", `${commit}^{commit}`], { quiet: true }) !== null;

/** True if every change to a script.md between two commits is to its `verified:` lines. */
function onlyVerifiedMoved(repo, base, path) {
  const diff = git(repo, ["diff", "-U0", `${base}..HEAD`, "--", path]);
  const changed = diff.split("\n").filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line));
  return changed.length > 0 && changed.every((line) => /^[+-]\s*(verified:|["']?[\w.-]+["']?:\s*["']?[0-9a-f]{7,40}["']?\s*$)/.test(line));
}

function check(video) {
  const dir = videoDir(video);
  const slug = videoSlug(video);
  const script = join(dir, "script.md");
  const ownDir = relative(HOME_REPO, dir);
  const report = { video: slug, status: "current", repos: [], unresolved: [], notes: [] };
  if (!existsSync(script)) return { ...report, status: "error", notes: ["no script.md"] };

  const { meta } = frontmatter(readFileSync(script, "utf8"), { strings: true });
  const verified = verifiedCommits(meta);
  const bases = new Map(verified);
  if (!bases.has(HOME_REPO)) {
    const last = git(HOME_REPO, ["log", "-1", "--format=%H", "--", ownDir]);
    if (!last) return { ...report, status: "new", notes: ["not committed yet"] };
    bases.set(HOME_REPO, last);
    report.notes.push(`no verified: commit, so measured from ${last.slice(0, 7)}, the last commit to touch the video`);
  }
  const { watched, unresolved } = resolveSources(meta.sources, bases);
  report.unresolved = unresolved;
  if ([...watched.values()].every((paths) => paths.length === 0)) {
    report.notes.push("its sources name no paths to watch");
  }

  for (const [repo, paths] of watched) {
    if (paths.length === 0) continue;
    const name = repo === HOME_REPO ? "." : basename(repo);
    let base = bases.get(repo);
    if (!base) {
      // No commit recorded for this checkout: take its last commit before the project's base.
      const when = git(HOME_REPO, ["log", "-1", "--format=%cI", bases.get(HOME_REPO)]);
      base = git(repo, ["rev-list", "-1", `--before=${when}`, "HEAD"]) || null;
      report.notes.push(`no verified: commit for ${name}, so measured from ${base ? base.slice(0, 7) : "its first commit"}`);
      base ??= git(repo, ["rev-list", "--max-parents=0", "HEAD"]).split("\n")[0];
    }
    if (!isCommit(repo, base)) {
      const shallow = git(repo, ["rev-parse", "--is-shallow-repository"], { quiet: true }) === "true";
      return { ...report, status: "error", notes: [`${name}: commit ${base} isn't in this checkout${shallow ? " (it's shallow: run git fetch --unshallow)" : ""}`] };
    }
    const spec = ["--", ...paths.map((path) => (hasGlob(path) ? `:(glob)${path}` : path))];
    if (repo === HOME_REPO) spec.push(`:(exclude)${ownDir}`);
    const files = git(repo, ["diff", "--name-status", "-M", `${base}..HEAD`, ...spec])
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, ...names] = line.split("\t");
        return { status: status[0], path: names.at(-1), from: names.length > 1 ? names[0] : undefined };
      })
      .filter((file) => !(repo === HOME_REPO && file.path.endsWith("/script.md") && file.status === "M" && onlyVerifiedMoved(repo, base, file.path)));
    const head = git(repo, ["rev-parse", "HEAD"]);
    const touched = files.flatMap((file) => (file.from ? [file.from, file.path] : [file.path]));
    const commits = touched.length
      ? git(repo, ["log", "--format=%h%x09%s", `${base}..HEAD`, "--", ...touched])
          .split("\n")
          .filter(Boolean)
          .map((line) => ({ sha: line.split("\t")[0], subject: line.split("\t").slice(1).join("\t") }))
      : [];
    report.repos.push({ repo: name, base: base.slice(0, 12), head: head.slice(0, 12), commits, files });
    if (files.length) report.status = "stale";
  }
  return report;
}

/** Writes `verified:` into a script's frontmatter, leaving the rest of it as written. */
function markVerified(video) {
  const dir = videoDir(video);
  const script = join(dir, "script.md");
  if (!existsSync(script)) throw new Error(`${relative(ROOT, dir)}: no script.md`);
  const source = readFileSync(script, "utf8");
  const { meta, block } = frontmatter(source, { strings: true });
  if (block === null) throw new Error(`${relative(ROOT, script)}: no frontmatter`);

  const head = git(HOME_REPO, ["rev-parse", "--short=12", at ?? "HEAD"]);
  const { watched } = resolveSources(meta.sources, new Map([[HOME_REPO, head]]));
  const others = [...watched].filter(([repo, paths]) => repo !== HOME_REPO && paths.length);
  const line = others.length
    ? `verified:\n  ".": "${head}"\n${others.map(([repo]) => `  ${basename(repo)}: "${git(repo, ["rev-parse", "--short=12", "HEAD"])}"`).join("\n")}`
    : `verified: "${head}"`;

  const existing = /^verified:[^\n]*(?:\n[ \t]+[^\n]*)*/m;
  const updated = existing.test(block) ? block.replace(existing, line) : `${block}\n${line}`;
  writeFileSync(script, source.replace(block, () => updated));
  return `${relative(ROOT, script)}: verified at ${head}${others.map(([repo]) => `, ${basename(repo)} at its HEAD`).join("")}`;
}

const videos = named.length
  ? named
  : readdirSync(VIDEOS)
      .filter((name) => statSync(join(VIDEOS, name)).isDirectory() && existsSync(join(VIDEOS, name, "script.md")))
      .sort();

if (mark) {
  try {
    for (const video of videos) console.log(markVerified(video));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  process.exit(0);
}

let reports;
try {
  reports = videos.map(check);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (json) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) {
    const changed = report.repos.filter((repo) => repo.files.length);
    const summary =
      report.status === "stale"
        ? changed.map((repo) => `${repo.commits.length} commit${repo.commits.length === 1 ? "" : "s"} in ${repo.repo} since ${repo.base.slice(0, 7)}`).join(", ")
        : report.status === "current"
          ? `no source changed since ${report.repos.map((repo) => repo.base.slice(0, 7)).join(", ") || "it was checked"}`
          : report.notes[0];
    console.log(`${report.video.padEnd(24)} ${report.status.padEnd(8)} ${summary}`);
    for (const repo of changed) {
      const at = (path) => (repo.repo === "." ? path : `${repo.repo}/${path}`);
      for (const file of repo.files) console.log(`  ${file.status} ${file.from ? `${at(file.from)} → ` : ""}${at(file.path)}`);
      for (const commit of repo.commits) console.log(`    ${commit.sha} ${commit.subject}`);
    }
    for (const note of report.status === "error" || report.status === "new" ? report.notes.slice(1) : report.notes) console.log(`  note: ${note}`);
    for (const word of report.unresolved) console.log(`  warning: source "${word}" names no file`);
  }
}
process.exit(reports.some((report) => report.status === "error") ? 2 : reports.some((report) => report.status === "stale") ? 1 : 0);
