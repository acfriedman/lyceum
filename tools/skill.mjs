#!/usr/bin/env node
// Installs the Lyceum agent skill by linking it into the skill directories coding agents read. The
// skill is a standard SKILL.md (the Agent Skills format), so one copy serves every agent; a link
// keeps it current as Lyceum updates.
//
//   lyceum skill link [--agent claude,codex,agents] [--project <dir>]
//   lyceum skill path
//
// Without --project, the skill is linked for the user (~/.claude/skills, ~/.codex/skills,
// ~/.agents/skills); with it, into that repository's .claude/skills, .codex/skills, .agents/skills.
// Without --agent, it links for every agent whose directory already exists, falling back to all.

import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills", "lyceum");
const AGENTS = { claude: ".claude", codex: ".codex", agents: ".agents" };

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? undefined : argv[i + 1];
};

if (argv[0] === "path") {
  console.log(SKILL);
  process.exit(0);
}
if (argv[0] !== "link") {
  console.error("usage: lyceum skill link [--agent claude,codex,agents] [--project <dir>]\n       lyceum skill path");
  process.exit(2);
}

const base = opt("project") ? resolve(opt("project")) : homedir();
const requested = opt("agent")?.split(",").map((a) => a.trim());
for (const agent of requested ?? []) {
  if (!AGENTS[agent]) {
    console.error(`unknown agent "${agent}" (expected ${Object.keys(AGENTS).join(", ")})`);
    process.exit(2);
  }
}
const present = Object.keys(AGENTS).filter((agent) => existsSync(join(base, AGENTS[agent])));
const agents = requested ?? (present.length ? present : Object.keys(AGENTS));

for (const agent of agents) {
  const target = join(base, AGENTS[agent], "skills", "lyceum");
  mkdirSync(dirname(target), { recursive: true });
  let current = null;
  try {
    current = lstatSync(target).isSymbolicLink() ? readlinkSync(target) : "(not a link)";
  } catch {}
  if (current === SKILL) {
    console.log(`  current  ${target}`);
  } else if (current) {
    console.log(`  skipped  ${target} already exists (${current}); remove it to relink`);
  } else {
    symlinkSync(SKILL, target);
    console.log(`  linked   ${target} → ${SKILL}`);
  }
}
