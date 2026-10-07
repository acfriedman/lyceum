// Machine-wide slots for the memory-hungry work: each Whisper alignment loads its own model, and each
// render or contact sheet drives a headless browser. A cap inside one process isn't enough, because
// several commands (narrations, renders, scene agents' stills) can run at once. Three narrations and a
// render together once exhausted 16 GB and froze the machine (2026-10-04), so every such job takes a
// slot here first, and the slots are shared by every process on the machine.
//
// A slot is a lock file holding its owner's pid, created exclusively. A lock whose owner has died is
// taken over, so a crashed command never wedges the next one.

import { mkdirSync, openSync, closeSync, writeSync, readFileSync, unlinkSync } from "node:fs";
import { totalmem } from "node:os";
import { join } from "node:path";
import { HOME } from "./paths.mjs";

// Under HOME, not the project: the caps are for the whole machine, across every project.
const LOCKS = join(HOME, "locks");
const GB = 1024 ** 3;

/** How many of each kind may run at once on this machine, by memory: a Whisper model is ~2 GB resident,
 *  a browser job (headless Chrome, a tab per core) ~4 GB, a TypeScript check ~0.5–1 GB. On 16 GB that is
 *  two alignments, one browser job and two type checks. */
export const SLOTS = {
  whisper: Math.max(1, Math.floor(totalmem() / (8 * GB))),
  browser: Math.max(1, Math.floor(totalmem() / (16 * GB))),
  typecheck: Math.max(1, Math.floor(totalmem() / (8 * GB))),
};

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function tryTake(path) {
  try {
    const fd = openSync(path, "wx");
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner = NaN;
    try {
      owner = Number(readFileSync(path, "utf8"));
    } catch {
      return false; // released between our open and read: try again next poll
    }
    if (Number.isFinite(owner) && owner > 0 && alive(owner)) return false;
    try {
      unlinkSync(path); // its owner died without releasing it
    } catch {}
    return false;
  }
}

const held = new Set();
process.on("exit", () => {
  for (const path of held) {
    try {
      unlinkSync(path);
    } catch {}
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

/** Runs `task` once one of the machine's `kind` slots is free, holding the slot until it settles. */
export async function withSlot(kind, task) {
  mkdirSync(LOCKS, { recursive: true });
  const count = SLOTS[kind];
  let path;
  let waited = false;
  for (;;) {
    for (let i = 0; i < count && !path; i++) {
      const candidate = join(LOCKS, `${kind}-${i}.lock`);
      if (tryTake(candidate)) path = candidate;
    }
    if (path) break;
    if (!waited && kind === "browser") console.log(`  waiting for a free ${kind} slot (another render or stills run is going)…`);
    waited = true;
    await new Promise((resume) => setTimeout(resume, 300));
  }
  held.add(path);
  try {
    return await task();
  } finally {
    held.delete(path);
    try {
      unlinkSync(path);
    } catch {}
  }
}

/** Takes one of the machine's `kind` slots and holds it until this process exits: for a command whose
 *  whole run is the heavy work (render, stills). */
export async function holdSlot(kind) {
  let release;
  const released = new Promise((resume) => (release = resume));
  let taken;
  const ready = new Promise((resume) => (taken = resume));
  withSlot(kind, () => (taken(), released));
  await ready;
  process.on("beforeExit", release);
}
