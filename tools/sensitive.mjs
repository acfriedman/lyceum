// Sensitive strings in narration: emails, phone numbers and credentials. Narration leaves the machine
// for hosted voices and ends up in the captions, and scripts are often drafted by an agent from source
// material that may hold any of these, so narrate refuses text that contains one (see narrate.mjs).
//
// Narration is written to be said aloud, so emails and phone numbers are caught in their spoken forms
// too ("name at example dot com", "five five five, one two one two"). Credentials are caught three ways,
// each passing over what an earlier one already named:
// - by the prefixes of well-known keys (AWS, GitHub, Google, OpenAI, …), so the error can name one;
// - by gitleaks's maintained rules (MIT), for the hundreds of services Lyceum doesn't name itself:
//   vendored in sensitive/gitleaks.json by scripts/update-gitleaks.mjs, and applied the way gitleaks
//   applies them (each rule's keywords, pattern, entropy floor and allowlists, then the global allowlist).
//   The rules are copied in, not the gitleaks binary run: a check that stops narration has to give the
//   same answer on every machine and in CI, which an optional binary wouldn't, and requiring one would
//   add an install beside Node, ffmpeg and uv for every author and runner. Copied, the rules need nothing
//   installed or downloaded, check each request's text in-process, and change only in a reviewed diff;
// - by shape: narration is prose, which never holds a long, random-looking run of letters and digits,
//   so any such token is taken for a key, whoever issued it.

import { readFileSync } from "node:fs";

/** Keys with a recognisable shape, named in errors. gitleaks's rules and RANDOM catch the rest. */
const KEYS = [
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ["OpenAI API key", /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g],
  ["AWS access key", /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}/g],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g],
  ["GitLab token", /\bglpat-[A-Za-z0-9_-]{20,}/g],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ["Slack webhook", /hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/g],
  ["Stripe key", /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ["Hugging Face token", /\bhf_[A-Za-z0-9]{30,}/g],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/g],
  ["JSON web token", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
];

// A run of the characters keys are made of; and, within it, a stretch with no word break in it (no
// hyphen, underscore or dot), which is where a key's randomness lives. "whisper-large-v3-turbo" has a
// digit but no long stretch; a key does.
const TOKEN = /[A-Za-z0-9_\-+/=.]{20,}/g;
const STRETCH = /[A-Za-z0-9+/=]{20,}/g;
// How varied a stretch must be, in bits per character (Shannon entropy), to count: only enough to pass
// over filler like "a1a1a1…". It can't tell a key from an identifier ("CompletionDelivery2Scene" scores
// as high as random letters), and needn't: what marks a key in prose is a long stretch mixing letters and
// digits at all. A random 32-digit hex key scores 2.9 at the lowest, its median 3.6.
const RANDOM = 3.0;

/** Shannon entropy, in bits per character: how random a string looks. */
function entropy(text) {
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) bits -= (count / text.length) * Math.log2(count / text.length);
  return bits;
}

// gitleaks's rules, compiled once. Their patterns were converted from Go's syntax when vendored.
const GITLEAKS = JSON.parse(readFileSync(new URL("./sensitive/gitleaks.json", import.meta.url), "utf8"));
const compileList = (list) =>
  list && {
    ...list,
    regexes: (list.regexes ?? []).map(({ source, flags }) => new RegExp(source, flags)),
    stopwords: (list.stopwords ?? []).map((word) => word.toLowerCase()),
  };
const RULES = GITLEAKS.rules.map((rule) => ({
  ...rule,
  regex: new RegExp(rule.regex.source, `${rule.regex.flags}g`),
  allowlists: (rule.allowlists ?? []).map(compileList),
}));
const GLOBAL = compileList(GITLEAKS.allowlist);

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

/** What gitleaks's rules find in `text`: `{ rule, secret, start, end }`, the span the secret's. */
function gitleaks(text) {
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
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const lineEnd = text.indexOf("\n", m.index + m[0].length);
      const finding = { secret, match: m[0], line: text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd) };
      if (rule.allowlists.some((list) => allows(list, finding)) || allows(GLOBAL, finding)) continue;
      const start = m.index + Math.max(0, m[0].indexOf(secret));
      found.push({ rule: rule.id, secret, start, end: start + secret.length });
    }
  }
  return found;
}

/** Credentials: well-known keys by name, then gitleaks's rules, then any other random-looking token. */
function credentials(text) {
  const found = [];
  const overlaps = (start, end) => found.some((f) => f.start < end && f.end > start);
  for (const [name, pattern] of KEYS) {
    for (const m of text.matchAll(pattern)) {
      const start = m.index;
      const end = start + m[0].length;
      // The first name that fits wins: an Anthropic key also has OpenAI's sk- prefix.
      if (!overlaps(start, end)) found.push({ kind: "credential", rule: name, match: m[0], start, end });
    }
  }
  for (const { rule, secret, start, end } of gitleaks(text)) {
    if (!overlaps(start, end)) found.push({ kind: "credential", rule: `gitleaks ${rule}`, match: secret, start, end });
  }
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlaps(start, end)) continue; // already named
    // A key mixes letters and digits; words, numbers and dates don't, at this length.
    const random = [...m[0].matchAll(STRETCH)].some(([s]) => /\d/.test(s) && /[A-Za-z]/.test(s) && entropy(s) >= RANDOM);
    if (random) found.push({ kind: "credential", rule: "random-looking token", match: m[0].replace(/[.\-_]+$/, ""), start, end });
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
 * "credential", rule what caught it (for a credential, the kind of key, or "gitleaks <rule id>"), and
 * match the exact string, as an exception would list it. A string caught by several rules is listed once.
 */
export function findSensitive(text) {
  const seen = new Set();
  return [...contacts(text), ...credentials(text)]
    .filter((f) => !seen.has(f.match) && seen.add(f.match))
    .map(({ kind, rule, match }) => ({ kind, rule, match }));
}

/** A finding for an error message: a credential shortened, so the error doesn't repeat it whole. */
export function describe({ kind, rule, match }) {
  const shown = kind === "credential" && match.length > 12 ? `${match.slice(0, 4)}…${match.slice(-4)}` : match;
  return kind === "credential" ? `credential (${rule}) "${shown}"` : `${kind} "${shown}"`;
}
