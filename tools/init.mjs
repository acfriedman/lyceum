#!/usr/bin/env node
// Makes a directory a Lyceum project, or fills in what an existing one is missing. Never overwrites a
// file; package.json, tsconfig.json and .gitignore only gain the entries Lyceum needs.
//
//   lyceum init [<dir>]

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
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

create(
  "lyceum.config.json",
  JSON.stringify({ videos: "videos", cache: ".cache", project: "project.md", pronounce: {}, allowSpoken: [] }, null, 2) + "\n",
);

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

// package.json: `#kit` resolves to the kit, the lyceum dependency, and short scripts.
const pkgPath = join(dir, "package.json");
const pkg = existsSync(pkgPath)
  ? JSON.parse(readFileSync(pkgPath, "utf8"))
  : { name: basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, "-"), private: true };
const before = JSON.stringify(pkg);
pkg.type ??= "module";
pkg.imports = { "#kit": "lyceum/kit", ...(pkg.imports ?? {}) };
pkg.scripts = {
  ...Object.fromEntries(["new", "narrate", "scenes", "stills", "render", "typecheck"].map((c) => [c, `lyceum ${c}`])),
  ...(pkg.scripts ?? {}),
};
pkg.dependencies = { lyceum: "github:acfriedman/lyceum", ...(pkg.dependencies ?? {}) };
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

// .gitignore: renders, caches and dependencies are regenerable.
const ignore = [".cache/", "videos/*/dist/", "node_modules/"];
const ignorePath = join(dir, ".gitignore");
const existing = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8").split("\n") : [];
const missing = ignore.filter((line) => !existing.includes(line));
if (missing.length) {
  appendFileSync(ignorePath, (existing.length && existing.at(-1) !== "" ? "\n" : "") + missing.join("\n") + "\n");
  (existing.length ? updated : created).push(".gitignore");
}

for (const name of created) console.log(`  created  ${name}`);
for (const name of updated) console.log(`  updated  ${name}`);
if (!created.length && !updated.length) console.log("  nothing to do: this is already a Lyceum project");
console.log(`
Next:
  npm install                       installs Lyceum
  npx lyceum skill link             gives your coding agent the skill that drives the workflow
  edit project.md                   audience, ground truth, house rules
  npx lyceum new <slug> "<Title>"   then ask your agent to write the script`);
