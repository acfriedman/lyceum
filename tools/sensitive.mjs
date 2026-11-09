// Sensitive strings in narration: emails, phone numbers and credentials. Narration leaves the machine
// for hosted voices and ends up in the captions, and scripts are often drafted by an agent from source
// material that may hold any of these, so narrate refuses text that contains one (see narrate.mjs).
//
// Narration is written to be said aloud, so emails and phone numbers are caught in their spoken forms
// too ("name at example dot com", "five five five, one two one two"). Credentials come from gitleaks's
// maintained rules (MIT), vendored in sensitive/gitleaks.json by scripts/update-gitleaks.mjs and applied
// the way gitleaks applies them: each rule's keywords first, then its pattern, its entropy floor and its
// allowlists, then the global allowlist.

import { readFileSync } from "node:fs";

const GITLEAKS = JSON.parse(readFileSync(new URL("./sensitive/gitleaks.json", import.meta.url), "utf8"));

const compile = ({ source, flags }) => new RegExp(source, flags);
const compileList = (list) =>
  list && { ...list, regexes: (list.regexes ?? []).map(compile), stopwords: (list.stopwords ?? []).map((s) => s.toLowerCase()) };
const RULES = GITLEAKS.rules.map((rule) => ({
  ...rule,
  regex: new RegExp(rule.regex.source, `${rule.regex.flags}g`),
  allowlists: (rule.allowlists ?? []).map(compileList),
}));
const GLOBAL = compileList(GITLEAKS.allowlist);

/** Shannon entropy, in bits per character: how random a string looks. */
function entropy(text) {
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) bits -= (count / text.length) * Math.log2(count / text.length);
  return bits;
}

/** Whether a gitleaks allowlist lets a finding through, as gitleaks decides it (narration has no path). */
function allows(list, { secret, match, line }) {
  if (!list) return false;
  const target = list.regexTarget === "match" ? match : list.regexTarget === "line" ? line : secret;
  const checks = [];
  if (list.regexes.length) checks.push(list.regexes.some((r) => r.test(target)));
  if (list.stopwords.length) checks.push(list.stopwords.some((word) => secret.toLowerCase().includes(word)));
  if (list.condition === "AND") return !list.paths && checks.length > 0 && checks.every(Boolean);
  return checks.some(Boolean);
}

/** Credentials, by gitleaks's rules. */
function credentials(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const rule of RULES) {
    if (rule.keywords.length && !rule.keywords.some((keyword) => lower.includes(keyword))) continue;
    for (const m of text.matchAll(rule.regex)) {
      // gitleaks's secret: the rule's group, else the first group that matched, else the whole match.
      const secret = (rule.secretGroup ? m[rule.secretGroup] : m.slice(1).find(Boolean)) ?? m[0];
      if (!secret) continue;
      if (rule.entropy) {
        if (entropy(secret) <= rule.entropy) continue;
        // gitleaks's generic rules also need a digit, so a long word isn't taken for a key.
        if (rule.id.startsWith("generic") && !/\d/.test(secret)) continue;
      }
      const start = text.lastIndexOf("\n", m.index) + 1;
      const end = text.indexOf("\n", m.index + m[0].length);
      const finding = { secret, match: m[0], line: text.slice(start, end < 0 ? undefined : end) };
      if (rule.allowlists.some((list) => allows(list, finding)) || allows(GLOBAL, finding)) continue;
      found.push({ kind: "credential", rule: rule.id, match: secret });
    }
  }
  return found;
}

// Top-level domains a spoken email ends with ("… dot com"): the common ones, so an ordinary phrase
// with "at" and "dot" in it isn't taken for an address.
const TLDS =
  "com org net edu gov mil int io dev app ai co me us uk ca au nz ie de fr es it nl be at ch se no dk fi pl pt " +
  "jp cn kr in br mx ru eu info biz xyz tech so sh gg tv fm ly to cc email mail cloud online site page";

// Written emails, and spoken ones: a name, "at", then a domain spoken label by label.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const SPOKEN_EMAIL = new RegExp(
  String.raw`\b([a-z][a-z0-9_-]*(?:(?: dot |\.| underscore | dash )[a-z0-9]+)*) at ((?:[a-z0-9-]+(?: dot |\.))+(?:${TLDS.split(" ").join("|")}))\b`,
  "gi",
);
// Words that come before "at" in ordinary speech ("find it at github dot com"): not a mailbox's name.
// Nor is a noun after a determiner ("the docs at docs dot python dot org").
const DETERMINERS = new Set("the a an our your their its my his her this that these those some any each every".split(" "));
const NOT_A_NAME = new Set(
  ("it its that this these those there here where which what who them they us we you me him her one ones " +
    "is are was were be been look looks looking looked find found live lives living hosted available online " +
    "published posted listed point points pointed aim aimed arrive arrives arrived stop stops start starts " +
    "begin begins end ends stay stays sit sits wait waits work works home first last least most best once all " +
    "more again now then today up out")
    .split(" "),
);

// Written phone numbers: a North American number (with or without its area code and country code), or an
// international one starting with +.
const PHONES = [
  /(?<![\w+.-])(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?![\w-]|\.\d)/g,
  /(?<![\w+.-])\d{3}[.-]\d{4}(?![\w-]|\.\d)/g,
  /\+\d{1,3}(?:[ .-]?\(?\d{1,4}\)?){2,5}(?![\w-])/g,
];
// Spoken digits: seven or more in a row (a phone number, or a card or account number) is sensitive.
const DIGIT_WORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const SPOKEN_DIGITS = new RegExp(
  String.raw`\b(?:(?:double|triple) )?(?:${Object.keys(DIGIT_WORDS).join("|")})(?:[\s,.-]+(?:(?:double|triple) )?(?:${Object.keys(DIGIT_WORDS).join("|")}))+\b`,
  "gi",
);

/** The digits a run of spoken digit words says, "double five" as two. */
function spokenDigits(run) {
  const digits = [];
  let repeat = 1;
  for (const word of run.toLowerCase().split(/[\s,.-]+/)) {
    if (word === "double" || word === "triple") repeat = word === "double" ? 2 : 3;
    else {
      for (let i = 0; i < repeat; i++) digits.push(DIGIT_WORDS[word]);
      repeat = 1;
    }
  }
  return digits;
}

/** Whether digits just count up or down ("one, two, three, …"), which isn't a number anyone owns. */
const counting = (digits) => [1, -1].some((step) => digits.every((d, i) => i === 0 || d === digits[i - 1] + step));

function contacts(text) {
  const found = [];
  const add = (m, kind, rule) => found.push({ kind, rule, match: m[0], start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(EMAIL)) add(m, "email", "email");
  for (const m of text.matchAll(SPOKEN_EMAIL)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index).match(/(\w+)\s+$/)?.[1].toLowerCase();
    if (!NOT_A_NAME.has(m[1].toLowerCase()) && !DETERMINERS.has(before)) add(m, "email", "spoken email");
  }
  for (const pattern of PHONES) {
    for (const m of text.matchAll(pattern)) {
      const digits = m[0].replace(/\D/g, "").length;
      if (digits >= 7 && digits <= 15) add(m, "phone number", "phone number");
    }
  }
  for (const m of text.matchAll(SPOKEN_DIGITS)) {
    const digits = spokenDigits(m[0]);
    if (digits.length >= 7 && !counting(digits)) add(m, "phone number", "spoken digits");
  }
  // A match inside a longer one ("555-1234" in "(212) 555-1234") is the same string, reported once.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  let reach = -1;
  return found.filter((f) => f.end > reach && (reach = f.end)).map(({ kind, rule, match }) => ({ kind, rule, match }));
}

/**
 * The sensitive strings in `text`, each `{ kind, rule, match }`: kind is "email", "phone number" or
 * "credential", rule what caught it (a gitleaks rule's id, for a credential), and match the exact
 * string, as an exception would list it. A string caught by several rules is listed once.
 */
export function findSensitive(text) {
  const seen = new Set();
  return [...contacts(text), ...credentials(text)].filter((f) => !seen.has(f.match) && seen.add(f.match));
}

/** A finding for an error message: a credential shortened, so the error doesn't repeat it whole. */
export function describe({ kind, rule, match }) {
  const shown = kind === "credential" && match.length > 12 ? `${match.slice(0, 4)}…${match.slice(-4)}` : match;
  return kind === "credential" ? `credential (${rule}) "${shown}"` : `${kind} "${shown}"`;
}
