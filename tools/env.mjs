// Secrets: keys a tool needs (a voice's API key, the store's credentials), read from the environment or
// from the nearest .env walking up from the project. `lyceum init` gitignores the project's .env.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT } from "./paths.mjs";

/** The first of `names` that is set, from the environment or the nearest .env that defines it; null if none. */
export function maybeSecret(...names) {
  for (const name of names) if (process.env[name]) return process.env[name];
  for (let dir = ROOT; dir !== dirname(dir); dir = dirname(dir)) {
    const env = join(dir, ".env");
    if (!existsSync(env)) continue;
    const text = readFileSync(env, "utf8");
    for (const name of names) {
      const match = text.match(new RegExp(`^${name}=(.+)$`, "m"));
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

/** Like maybeSecret, but a missing secret is an error. */
export function secret(...names) {
  const value = maybeSecret(...names);
  if (value === null) throw new Error(`${names.join(" / ")} is not set, and no .env at or above ${ROOT} defines it`);
  return value;
}
