// Lyceum's version, the dependency spec projects pin it with, and the check for a newer release.
//
// Releases are git tags (vX.Y.Z) on GitHub, so a project depends on
// `github:<owner>/<repo>#semver:^X.Y.Z` and npm resolves the range against the tags. The repository is
// the one this copy of Lyceum was installed from (see REPO), so a fork's installs follow the fork. Every
// six hours at most, a command asks GitHub for the tags and prints the notice to stderr if a newer
// release exists; `lyceum version` asks every time (an agent's session-start hook runs it). The check
// never fails a command: errors are ignored, it gives up after a couple of seconds, and it is skipped in
// CI, when LYCEUM_NO_UPDATE_CHECK is set, and in a git checkout of Lyceum (which updates with git, not
// npm).

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME } from "./home.mjs";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = JSON.parse(readFileSync(join(ENGINE, "package.json"), "utf8"));
/** How long an answer from GitHub stands before a command asks again. */
const INTERVAL = 6 * 60 * 60 * 1000;

export const VERSION = PACKAGE.version;

/**
 * "owner/repo" of a GitHub URL (`git+ssh://git@github.com/o/r.git#…`, `https://github.com/o/r`) or npm
 * spec (`github:o/r`), or undefined for anything else. `shorthand` also accepts a bare `o/r`, which
 * package.json's repository may use but which in a lockfile is a local path.
 */
export function githubRepo(spec, { shorthand = false } = {}) {
  if (typeof spec !== "string") return undefined;
  const [, owner, repo] =
    spec.match(/(?:^|[@/])github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[#/?]|$)/) ??
    spec.match(shorthand ? /^(?:github:)?([\w.-]+)\/([\w.-]+?)(?:#|$)/ : /^github:([\w.-]+)\/([\w.-]+?)(?:#|$)/) ??
    [];
  return owner && repo ? `${owner}/${repo}` : undefined;
}

/**
 * Where npm says it installed this copy from: the `resolved` URL of its entry in the lockfile of the
 * install around it (npm's hidden node_modules/.package-lock.json, else package-lock.json). That's the
 * repository a project's dependency or `npx github:…` named, a fork's included, whatever the fork's
 * package.json says. Undefined outside an npm install (a git checkout, a linked copy, another package
 * manager).
 */
function installedFrom() {
  for (let dir = dirname(ENGINE); dir !== dirname(dir); dir = dirname(dir)) {
    const key = relative(dir, ENGINE).split(sep).join("/");
    if (!key.startsWith("node_modules/")) continue;
    for (const lock of [join(dir, "node_modules", ".package-lock.json"), join(dir, "package-lock.json")]) {
      try {
        const resolved = JSON.parse(readFileSync(lock, "utf8")).packages?.[key]?.resolved;
        if (resolved) return githubRepo(resolved);
      } catch {}
    }
  }
}

/**
 * The GitHub repository this copy of Lyceum came from, as "owner/repo": where npm installed it from,
 * else the `repository` in its own package.json. Releases are looked up, and `lyceum init` pins
 * projects, there.
 */
export const REPO = installedFrom() ?? githubRepo(PACKAGE.repository?.url ?? PACKAGE.repository, { shorthand: true });

/** The dependency spec for a release: npm resolves it against the repository's tags. */
export function dependency(version = VERSION) {
  if (!REPO) throw new Error(`can't tell which GitHub repository this Lyceum (${ENGINE}) came from: give its package.json a repository`);
  return `github:${REPO}#semver:^${version}`;
}

/** [major, minor, patch] of "X.Y.Z" or "vX.Y.Z", or undefined for anything else (pre-releases too). */
const parse = (v) => v.match(/^v?(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
const newer = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

/** The newest release tag on GitHub, or undefined if it can't be read. */
function latestRelease() {
  return new Promise((done) => {
    execFile("git", ["ls-remote", "--tags", "--refs", `https://github.com/${REPO}.git`], { timeout: 2000 }, (error, stdout) => {
      if (error) return done(undefined);
      const versions = stdout.split("\n").map((line) => parse(line.split("refs/tags/")[1] ?? "")).filter(Boolean);
      done(versions.reduce((best, v) => (!best || newer(v, best) ? v : best), undefined)?.join("."));
    });
  });
}

/** Whether to skip the check: in CI, when it's turned off, in a git checkout of Lyceum, and when there's
 *  no repository to ask. */
export const SKIP_CHECK = Boolean(process.env.CI || process.env.LYCEUM_NO_UPDATE_CHECK) || existsSync(join(ENGINE, ".git")) || !REPO;

/**
 * The newest release, if it's newer than this one. Asks GitHub when the last answer is six hours old, or
 * always with `fresh`, and remembers the answer machine-wide.
 */
export async function newerRelease({ fresh = false } = {}) {
  try {
    const file = join(HOME, "update-check.json");
    let state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    if (fresh || !(Date.now() - (state.checked ?? 0) < INTERVAL)) {
      // Recorded even when GitHub can't be reached, so an offline machine waits six hours, not every command.
      state = { checked: Date.now(), latest: (await latestRelease()) ?? state.latest };
      mkdirSync(HOME, { recursive: true });
      writeFileSync(file, JSON.stringify(state) + "\n");
    }
    const latest = state.latest && parse(state.latest);
    return latest && newer(latest, parse(VERSION)) ? state.latest : undefined;
  } catch {}
}

/** The notice for a newer release: the version, the command that installs it, and what changed. */
export function updateNotice(latest) {
  return (
    `🎁 lyceum ${latest} is available (this project has ${VERSION}): npm install ${dependency(latest)}\n` +
    `  what changed: https://github.com/${REPO}/releases`
  );
}

/** Prints the notice to stderr if a newer release exists, checking GitHub every six hours at most. */
export async function noticeUpdate() {
  if (SKIP_CHECK) return;
  const latest = await newerRelease();
  if (latest) console.error(updateNotice(latest) + "\n");
}
