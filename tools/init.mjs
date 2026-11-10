#!/usr/bin/env node
// Makes a directory a Lyceum project, or fills in what an existing one is missing. Never overwrites a
// file; package.json, tsconfig.json and .gitignore only gain the entries Lyceum needs.
//
//   lyceum init [<dir>] [--provider say|openai|gemini]
//
// A new project's voice is chosen here: `--provider`, else the answer to a prompt when someone is at
// the terminal, else say.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { dependency } from "./version.mjs";

// The voices narrate knows (VOICES in narrate.mjs), the local one first: it's the default.
const VOICES = {
  say: "macOS's built-in voice: free, and narration never leaves this machine",
  openai: "OpenAI's gpt-4o-mini-tts: narration is sent to OpenAI (needs OPENAI_KEY)",
  gemini: "Google's Gemini text-to-speech: narration is sent to Google (needs GEMINI_API_KEY)",
};

const argv = process.argv.slice(2);
const flag = argv.indexOf("--provider");
const provider = flag < 0 ? undefined : argv[flag + 1];
if (flag >= 0 && !VOICES[provider]) {
  console.error(`--provider: use ${Object.keys(VOICES).join(", ")}`);
  process.exit(2);
}
const dir = resolve(argv.find((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--provider") ?? ".");
mkdirSync(dir, { recursive: true });
const created = [];
const updated = [];

function create(name, content) {
  const path = join(dir, name);
  if (existsSync(path)) return;
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  created.push(name);
}

/** The voice a new project narrates with: `--provider`, else the answer to a prompt, else say. */
async function chooseVoice() {
  if (provider) return provider;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "say"; // an agent or a script: no one to ask
  console.log("Which voice should narrate this project's videos?");
  for (const [name, about] of Object.entries(VOICES)) console.log(`  ${name.padEnd(7)} ${about}`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await prompt.question("Voice [say]: ")).trim().toLowerCase() || "say";
      if (VOICES[answer]) return answer;
      console.log(`  one of ${Object.keys(VOICES).join(", ")}, please`);
    }
  } finally {
    prompt.close();
  }
}

// The chosen voice is the project's `voice` and its only entry in `providers`, the list of where
// narration may be sent (narrate sends nothing to a hosted voice until it's set), so nothing goes
// anywhere the person setting the project up didn't pick.
const voice = existsSync(join(dir, "lyceum.config.json")) ? null : await chooseVoice();
if (voice) {
  create(
    "lyceum.config.json",
    JSON.stringify(
      { videos: "videos", cache: ".cache", project: "project.md", voice: { provider: voice }, providers: [voice], pronounce: {}, allowSpoken: [] },
      null,
      2,
    ) + "\n",
  );
}

create(
  "project.md",
  `# Explainer project

What holds for every video here. The agent skill reads this before writing any script. Keep it short
and specific; what one video is for goes in the intent at the top of its script.md.

## Audience

Who watches these videos, what they already know, and what they want out of them.

## Ground truth

Where the facts come from: the repositories, directories, design documents and tests a script may
cite, and how to reach them from here.

## House rules

Anything project-specific: terms to always spell out, names and how they're spoken, tone, length.

## Delivery

Where finished videos go and how changes are committed (branch and pull request, or straight to main).
`,
);

create(
  "videos/index.ts",
  `// The registry: one entry per video directory. \`lyceum scenes <video>\` adds a video's narration
// and scene map here.

import type { Narration, SceneMap } from "#kit";

export const videos: { narration: Narration; scenes: SceneMap }[] = [
];
`,
);

// package.json: `#kit` resolves to the kit, the lyceum dependency (this release onward, by tag), and short
// scripts. It's named after its directory, unless that's `lyceum/`, which would take its own dependency's
// name: then after the directory around it, as `<parent>-explainers`.
const pkgPath = join(dir, "package.json");
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
const name = slug(basename(dir)) === "lyceum" ? `${slug(basename(dirname(dir)))}-explainers` : slug(basename(dir));
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")) : { name, private: true };
const before = JSON.stringify(pkg);
pkg.type ??= "module";
pkg.imports = { "#kit": "lyceum/kit", ...(pkg.imports ?? {}) };
pkg.scripts = {
  ...Object.fromEntries(["new", "narrate", "scenes", "stills", "render", "typecheck"].map((c) => [c, `lyceum ${c}`])),
  ...(pkg.scripts ?? {}),
};
pkg.dependencies = { lyceum: dependency(), ...(pkg.dependencies ?? {}) };
if (JSON.stringify(pkg) !== before) {
  (existsSync(pkgPath) ? updated : created).push("package.json");
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

// tsconfig.json: strict, bundler resolution, and the registry alias the kit imports.
create(
  "tsconfig.json",
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        lib: ["ES2023", "DOM"],
        paths: { "@lyceum/videos": ["./videos/index.ts"] },
      },
      include: ["videos"],
      exclude: ["node_modules", ".cache", "videos/*/dist"],
    },
    null,
    2,
  ) + "\n",
);

// .gitignore: renders, caches and dependencies are regenerable, and .env holds voice keys.
const ignore = [".cache/", "videos/*/dist/", "node_modules/", ".env"];
const ignorePath = join(dir, ".gitignore");
const existing = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8").split("\n") : [];
const missing = ignore.filter((line) => !existing.includes(line));
if (missing.length) {
  appendFileSync(ignorePath, (existing.length && existing.at(-1) !== "" ? "\n" : "") + missing.join("\n") + "\n");
  (existing.length ? updated : created).push(".gitignore");
}

// .claude/settings.json: a session-start hook, so Claude Code hears about a newer Lyceum release when a
// chat begins, not only when a command runs. It goes in the repository holding the project, where the
// agent is opened, and runs the project's own install; until that exists it prints nothing.
let root = dir;
while (!existsSync(join(root, ".git")) && dirname(root) !== root) root = dirname(root);
if (!existsSync(join(root, ".git"))) root = dir;
const settingsPath = join(root, ".claude", "settings.json");
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
const sessionStart = (settings.hooks ??= {}).SessionStart ??= [];
if (!sessionStart.some((entry) => entry.hooks?.some((h) => /lyceum"? version --hook/.test(h.command ?? "")))) {
  const bin = join("$CLAUDE_PROJECT_DIR", relative(root, dir), "node_modules", ".bin", "lyceum");
  sessionStart.push({ matcher: "startup", hooks: [{ type: "command", command: `"${bin}" version --hook 2>/dev/null || true`, timeout: 10 }] });
  (existsSync(settingsPath) ? updated : created).push(relative(dir, settingsPath));
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

for (const name of created) console.log(`  created  ${name}`);
for (const name of updated) console.log(`  updated  ${name}`);
if (!created.length && !updated.length) console.log("  nothing to do: this is already a Lyceum project");
const step = (what, why) => `  ${what.padEnd(34)}${why}`;
const KEYS = { openai: "OPENAI_KEY", gemini: "GEMINI_API_KEY" };
const voiceSteps = !voice
  ? []
  : voice === "say"
    ? [step("narration voice: say", `free, and stays on this machine; "voice" and "providers" in lyceum.config.json change it`)]
    : [step(`put ${KEYS[voice]} in .env`, `narration is sent to ${voice === "openai" ? "OpenAI" : "Google"}, the voice you chose`)];
if (voice === "say" && process.platform !== "darwin") {
  voiceSteps.push(step("", `say is macOS's voice: to narrate here, set "voice" and "providers" to openai or gemini`));
}
console.log(
  [
    "",
    "Next:",
    step("npm install", "installs Lyceum"),
    step("npx lyceum skill link", "gives your coding agent the skill that drives the workflow"),
    step("edit project.md", "audience, ground truth, house rules"),
    ...voiceSteps,
    step(`npx lyceum new <slug> "<Title>"`, "then ask your agent to write the script"),
  ].join("\n"),
);
