#!/usr/bin/env node
// Keeps a project's videos current from CI, with no one reviewing: an agent revises what `lyceum stale`
// says needs work, `lyceum ship` gates and publishes it, and the changes land as a pull request that
// merges itself.
//
//   lyceum ci init [--force]              write .github/workflows/lyceum.yml in the repository
//   lyceum ci plan [--max <n>] [<video>…] decide what this run works on (.cache/ci/plan.json)
//   lyceum ci run                         run the agent on each planned video, then ship it
//   lyceum ci land                        open a pull request with the changes and merge it; open an
//                                         issue for any video that failed
//
// The agent is Claude Code by default (`claude -p`, authenticated by CLAUDE_CODE_OAUTH_TOKEN, a
// subscription token from `claude setup-token`, or ANTHROPIC_API_KEY, which wins when both are set).
// LYCEUM_AGENT_MODEL picks its model. The prompt arrives on stdin. LYCEUM_AGENT replaces the whole
// command, run by the shell, with the prompt also in LYCEUM_PROMPT. LYCEUM_AGENT_TIMEOUT caps each video, in minutes (90).
//
// Order of work: orphaned videos first (cheap), then stale ones (usually cheap: most diffs change nothing
// a video says), then missing ones (a whole new video each). `--max` caps how many one run takes on.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE, ROOT, VIDEOS, videoDir, workDir } from "./paths.mjs";

const LYCEUM = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "lyceum.mjs");
const OUT = join(CACHE, "ci");
const PLAN = join(OUT, "plan.json");
const RESULTS = join(OUT, "results.json");
const SUMMARY = join(OUT, "summary.md");
const ORDER = { orphaned: 0, stale: 1, missing: 2 };

const [sub, ...argv] = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? undefined : argv[i + 1];
};
const REPO = execFileSync("git", ["-C", ROOT, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
/** Runs git at the repository's root, where every path below is relative to. */
const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const PROJECT = relative(REPO, ROOT) || ".";
const env = { ...process.env, LYCEUM_NO_UPDATE_CHECK: "1", LYCEUM_UNATTENDED: "1" };
const lyceum = (...args) => spawnSync(process.execPath, [LYCEUM, ...args], { encoding: "utf8", env, cwd: ROOT });

/** Appends to the GitHub Actions step output or summary, when running there. */
function actions(file, text) {
  if (process.env[file]) writeFileSync(process.env[file], text, { flag: "a" });
}

const COMMANDS = { init, plan, run, land };
if (!COMMANDS[sub]) {
  console.error("usage: lyceum ci init [--force] | plan [--max <n>] [<video>…] | run | land");
  process.exit(2);
}
await COMMANDS[sub]();

// ── init ────────────────────────────────────────────────────────────────────────────────────────────

function init() {
  const file = join(REPO, ".github", "workflows", "lyceum.yml");
  if (existsSync(file) && !argv.includes("--force")) {
    console.error(`${relative(process.cwd(), file)} exists; --force replaces it`);
    process.exit(1);
  }
  const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ci-workflow.yml"), "utf8");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, template.replaceAll("__PROJECT__", PROJECT));
  console.log(`${relative(REPO, file)} written. The repository needs these Actions secrets:
  LYCEUM_STORE_ACCESS_KEY_ID, LYCEUM_STORE_SECRET_ACCESS_KEY   the store (see lyceum.config.json's store)
  OPENAI_KEY (or the key of the project's voice)                narration
  CLAUDE_CODE_OAUTH_TOKEN (from \`claude setup-token\`) or ANTHROPIC_API_KEY   the agent
and, under Settings → Actions → General, "Allow GitHub Actions to create and approve pull requests".`);
}

// ── plan ────────────────────────────────────────────────────────────────────────────────────────────

function plan() {
  const max = Number(opt("max") ?? process.env.LYCEUM_CI_MAX ?? 3);
  const named = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--max");
  const stale = lyceum("stale", ...named, "--json");
  if (stale.status === 2 || !stale.stdout.trim().startsWith("[")) {
    console.error(stale.stderr || stale.stdout);
    process.exit(2);
  }
  const reports = JSON.parse(stale.stdout);
  const needed = reports.filter((r) => r.status in ORDER).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const work = needed.slice(0, max).map((r) => ({
    video: r.video,
    status: r.status,
    explains: r.explains ?? null,
    changed: r.repos.flatMap((repo) => repo.files.map((f) => (repo.repo === "." ? f.path : `${repo.repo}/${f.path}`))),
  }));
  const errors = reports.filter((r) => r.status === "error").map((r) => `${r.video}: ${r.notes.join("; ")}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(PLAN, JSON.stringify({ started: new Date().toISOString(), work, deferred: needed.length - work.length, errors }, null, 2) + "\n");
  rmSync(RESULTS, { force: true });
  rmSync(SUMMARY, { force: true });
  for (const w of work) console.log(`${w.video.padEnd(24)} ${w.status}${w.explains ? `  (${w.explains})` : ""}`);
  if (needed.length > work.length) console.log(`${needed.length - work.length} more left for the next run (--max ${max})`);
  for (const e of errors) console.log(`error: ${e}`);
  if (!work.length) console.log("Nothing to do: every video is current.");
  actions("GITHUB_OUTPUT", `work=${work.length ? "true" : "false"}\n`);
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────

/** What the agent is asked to do for one video. */
function prompt(w) {
  const task = {
    missing: `${w.explains} has no video yet. Make one under the slug \`${w.video}\`: \`npx lyceum new ${w.video} "<Title>" --explains ${w.explains}\`.`,
    stale: `The video \`${w.video}\` may be out of date. These of its sources changed since it was verified: ${w.changed.join(", ") || "(see `npx lyceum stale " + w.video + "`)"}.`,
    orphaned: `The video \`${w.video}\` explains ${w.explains}, which is gone. Remove the video.`,
  }[w.status];
  return `/lyceum You are running unattended in CI for a Lyceum project at \`${PROJECT}\` (run every lyceum command from there). Nobody will review your work or answer questions.

Use the Lyceum skill. Read its SKILL.md, then references/unattended.md, which overrides the review steps, and follow it exactly.

Your one task: ${task}

Finish as unattended.md says: \`npx lyceum stale --mark ${w.video}\`, then \`npx lyceum ship ${w.video}\` (not for a removed video). Don't commit or push. End with the one-line result unattended.md describes.
`;
}

/** Runs the agent on one video, its output shown as it goes. Resolves to its exit code. */
function agent(w) {
  const text = prompt(w);
  const minutes = Number(process.env.LYCEUM_AGENT_TIMEOUT ?? 90);
  // Claude Code headless: no prompts (a tool it isn't allowed is refused, not asked about), and only
  // the tools the skill uses: the shell for lyceum's commands, files, subagents for scenes, the skill.
  // The prompt goes on stdin: --allowedTools takes any number of values, so a prompt after it would be
  // read as one more tool.
  const claude = [
    "-p", "--permission-mode", "acceptEdits", "--permission-prompts", "none",
    "--allowedTools", "Bash,Read,Edit,Write,Agent,Skill",
    ...(process.env.LYCEUM_AGENT_MODEL ? ["--model", process.env.LYCEUM_AGENT_MODEL] : []),
  ];
  return new Promise((resolve) => {
    const child = process.env.LYCEUM_AGENT
      ? spawn(process.env.LYCEUM_AGENT, { shell: true, cwd: REPO, env: { ...env, LYCEUM_PROMPT: text }, stdio: ["pipe", "inherit", "inherit"] })
      : spawn("claude", claude, { cwd: REPO, env, stdio: ["pipe", "inherit", "inherit"] });
    const timer = setTimeout(() => {
      console.error(`agent: ${w.video} took longer than ${minutes} minutes; stopping it`);
      child.kill("SIGTERM");
    }, minutes * 60_000);
    child.stdin.end(text);
    child.on("error", (error) => console.error(`agent: ${error.message}`));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve(signal ? `killed (${signal})` : code);
    });
  });
}

/** The ship.json `lyceum ship` wrote for a video since `since`, or null. */
function shipped(video, since) {
  const file = join(CACHE, "work", video, "ship.json");
  return existsSync(file) && statSync(file).mtimeMs >= since ? JSON.parse(readFileSync(file, "utf8")) : null;
}

async function run() {
  if (!existsSync(PLAN)) {
    console.error("no plan: run `lyceum ci plan` first");
    process.exit(2);
  }
  const { work, deferred, errors } = JSON.parse(readFileSync(PLAN, "utf8"));
  // The agent needs the skill: linked into the repository for this run only, and removed after.
  const linked = !existsSync(join(REPO, ".claude", "skills", "lyceum"));
  if (linked) lyceum("skill", "link", "--agent", "claude", "--project", REPO);

  const results = [];
  for (const w of work) {
    console.log(`\n━━ ${w.video} (${w.status}) ━━`);
    const since = Date.now();
    const code = await agent(w);
    let ship = shipped(w.video, since);
    const result = { video: w.video, status: w.status, explains: w.explains, ok: false, outcome: "", url: null };
    if (w.status === "orphaned") {
      result.ok = !existsSync(videoDir(w.video));
      result.outcome = result.ok ? "removed" : `not removed (agent exited ${code})`;
    } else {
      // An agent that marked the video but stopped short of shipping it: ship's own gates decide.
      if (!ship && existsSync(join(VIDEOS, w.video, "script.md"))) {
        console.log(`agent: ${w.video} wasn't shipped (agent exited ${code}); shipping it now`);
        lyceum("ship", w.video);
        ship = shipped(w.video, since);
      }
      if (ship?.ok) Object.assign(result, { ok: true, outcome: "published", url: ship.url });
      else if (ship) result.outcome = `failed at ${ship.step}: ${ship.error}`;
      else result.outcome = `no video to ship (agent exited ${code})`;
    }
    console.log(`→ ${w.video}: ${result.outcome}`);
    results.push(result);
  }
  if (linked) rmSync(join(REPO, ".claude", "skills", "lyceum"), { force: true });

  writeFileSync(RESULTS, JSON.stringify(results, null, 2) + "\n");
  const summary = summarize(results, deferred, errors);
  writeFileSync(SUMMARY, summary);
  actions("GITHUB_STEP_SUMMARY", summary);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

function summarize(results, deferred, errors) {
  const line = (r) => `- **${r.video}** (${r.status}${r.explains ? `, \`${r.explains}\`` : ""}): ${r.url ? `[${r.outcome}](${r.url})` : r.outcome}`;
  return [
    "## Lyceum videos",
    "",
    ...results.map(line),
    ...(deferred ? ["", `${deferred} more video${deferred === 1 ? "" : "s"} left for the next run.`] : []),
    ...(errors.length ? ["", "Couldn't check:", ...errors.map((e) => `- ${e}`)] : []),
    "",
  ].join("\n");
}

// ── land ────────────────────────────────────────────────────────────────────────────────────────────

function gh(...args) {
  return execFileSync("gh", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function land() {
  if (!existsSync(RESULTS)) {
    console.log("no results: nothing ran");
    return;
  }
  const results = JSON.parse(readFileSync(RESULTS, "utf8"));
  const summary = readFileSync(SUMMARY, "utf8");
  const failed = results.filter((r) => !r.ok);

  // Only the project and the files its videos explain (for their video blocks) are committed: never
  // what the run left anywhere else.
  const paths = [PROJECT, ...results.filter((r) => r.explains && existsSync(join(REPO, r.explains))).map((r) => r.explains)];
  const changed = git("status", "--porcelain", "--", ...paths);
  if (changed) {
    const touched = results.filter((r) => r.ok).map((r) => r.video);
    const branch = `lyceum/refresh-${process.env.GITHUB_RUN_ID ?? Date.now()}`;
    const title = `Videos: ${touched.length ? `refresh ${touched.join(", ")}` : "partial refresh"}`;
    git("switch", "-c", branch);
    git("add", "--", ...paths);
    execFileSync("git", ["-C", REPO, "-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-q", "-m", title, "-m", summary.replace(/^## .*\n\n/, "")], { stdio: "inherit" });
    // Pushed with the job's token here, not before: the agent ran without push credentials.
    const remote = process.env.GH_TOKEN && process.env.GITHUB_REPOSITORY ? `https://x-access-token:${process.env.GH_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git` : "origin";
    execFileSync("git", ["-C", REPO, "push", "-q", remote, `HEAD:refs/heads/${branch}`], { stdio: ["ignore", "inherit", "pipe"] });
    const body = `${summary}\n_Opened by the Lyceum workflow. Its videos were made and checked by an agent, unreviewed by design._\n`;
    const url = gh("pr", "create", "--head", branch, "--title", title, "--body", body);
    console.log(`opened ${url}`);
    // Merges once required checks pass where the branch is protected, else right away.
    try {
      gh("pr", "merge", url, "--squash", "--delete-branch", "--auto");
    } catch {
      gh("pr", "merge", url, "--squash", "--delete-branch");
    }
    console.log(`merged (or queued to merge) ${url}`);
  } else {
    console.log("no changes to land");
  }

  if (failed.length) {
    const title = "Lyceum: videos that couldn't be refreshed";
    const body = `${summary}\nA video that failed keeps the copy published before; the next run tries it again.${process.env.GITHUB_RUN_ID ? `\n\nRun: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : ""}\n`;
    const open = gh("issue", "list", "--state", "open", "--search", `"${title}" in:title`, "--json", "number", "--jq", ".[0].number");
    if (open) gh("issue", "comment", open, "--body", body);
    else gh("issue", "create", "--title", title, "--body", body);
    console.log(open ? `commented on issue #${open}` : "opened an issue for the failures");
  }
}
