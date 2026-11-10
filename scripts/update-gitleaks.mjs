#!/usr/bin/env node
// Vendors gitleaks's secret-detection rules into tools/sensitive/gitleaks.json, for narrate's check for
// sensitive strings (tools/sensitive.mjs), with gitleaks's license beside them. gitleaks is MIT; its
// rules are maintained upstream, so update them from a release rather than editing the JSON.
//
//   node scripts/update-gitleaks.mjs [<tag>]    a gitleaks release, e.g. v8.30.1 (default: the latest)
//
// Needs uv (Python's tomllib reads the TOML). The rules are converted from Go's regular expressions to
// JavaScript's:
// - Go's inline flags have no equivalent in Node 20, so they're widened to the whole pattern: `(?i)` or
//   `(?i:…)` anywhere makes the whole rule case-insensitive, `(?-i:…)` becomes a plain group, and `(?s:…)`
//   lets every `.` match newlines. A widened rule only ever matches more.
// - `\z` becomes `$`, `(?P<name>` becomes `(?<name>`, and `[:alnum:]` its letters and digits.
// Rules that only match file paths are left out (narration has none), and so is any rule that still
// doesn't compile, which this lists.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "tools", "sensitive");

const tag =
  process.argv[2] ?? (await (await fetch("https://api.github.com/repos/gitleaks/gitleaks/releases/latest")).json()).tag_name;
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error(`not a gitleaks release tag: ${tag}`);
const raw = async (path) => {
  const response = await fetch(`https://raw.githubusercontent.com/gitleaks/gitleaks/${tag}/${path}`);
  if (!response.ok) throw new Error(`gitleaks ${tag}/${path}: HTTP ${response.status}`);
  return response.text();
};
const [toml, license] = await Promise.all([raw("config/gitleaks.toml"), raw("LICENSE")]);
const config = JSON.parse(
  execFileSync("uv", ["run", "--quiet", "--no-project", "--python", "3.12", "python", "-I", "-c", "import json, sys, tomllib; json.dump(tomllib.loads(sys.stdin.read()), sys.stdout)"], {
    input: toml,
    encoding: "utf8",
  }),
);

/** A Go regular expression as JavaScript's `{ source, flags }`, or null if it doesn't compile. */
function convert(go) {
  let flags = "";
  if (/\(\?i[):]/.test(go)) flags += "i";
  if (/\(\?s[):]/.test(go)) flags += "s";
  const source = go
    .replace(/\(\?[is]+\)/g, "")
    .replace(/\(\?-?[is]+:/g, "(?:")
    .replace(/\(\?P</g, "(?<")
    .replace(/(?<!\\)\\z/g, "$")
    .replace(/\[:alnum:\]/g, "a-zA-Z0-9");
  try {
    new RegExp(source, flags);
    return { source, flags };
  } catch {
    return null;
  }
}

const dropped = [];
/** An allowlist that can apply to narration (one that only names paths can't), converted. */
function allowlist(list, rule) {
  const regexes = (list.regexes ?? []).map((r) => convert(r) ?? (dropped.push(`${rule}: allowlist regex ${r}`), null)).filter(Boolean);
  const stopwords = list.stopwords ?? [];
  if (!regexes.length && !stopwords.length) return null;
  return {
    ...(list.condition === "AND" ? { condition: "AND", paths: Boolean(list.paths?.length) } : {}),
    ...(list.regexTarget ? { regexTarget: list.regexTarget } : {}),
    ...(regexes.length ? { regexes } : {}),
    ...(stopwords.length ? { stopwords } : {}),
  };
}

const rules = [];
for (const rule of config.rules) {
  if (!rule.regex) continue; // matches file paths only
  const regex = convert(rule.regex);
  if (!regex) {
    dropped.push(`${rule.id}: ${rule.regex}`);
    continue;
  }
  const allowlists = (rule.allowlists ?? []).map((list) => allowlist(list, rule.id)).filter(Boolean);
  rules.push({
    id: rule.id,
    regex,
    keywords: (rule.keywords ?? []).map((k) => k.toLowerCase()),
    ...(rule.secretGroup ? { secretGroup: rule.secretGroup } : {}),
    ...(rule.entropy ? { entropy: rule.entropy } : {}),
    ...(allowlists.length ? { allowlists } : {}),
  });
}

mkdirSync(OUT, { recursive: true });
const data = {
  source: `https://github.com/gitleaks/gitleaks/blob/${tag}/config/gitleaks.toml`,
  license: "MIT: see LICENSE.gitleaks beside this file",
  generatedBy: "node scripts/update-gitleaks.mjs",
  allowlist: allowlist(config.allowlist ?? {}, "global"),
  rules,
};
writeFileSync(join(OUT, "gitleaks.json"), JSON.stringify(data, null, 1) + "\n");
writeFileSync(join(OUT, "LICENSE.gitleaks"), license);
console.log(`gitleaks ${tag}: ${rules.length} rules → tools/sensitive/gitleaks.json`);
for (const line of dropped) console.log(`  left out (doesn't compile in JavaScript): ${line}`);
