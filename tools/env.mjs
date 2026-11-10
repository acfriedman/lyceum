// Secrets: keys a tool needs (a voice's API key, the store's credentials), read from the environment or
// from the project's own .env, and nowhere else. A .env above the project (a home directory's, or the
// application's around a nested project) belongs to something else, so it's never read. `lyceum init`
// gitignores the project's .env.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

/** The only .env Lyceum reads: the project's own. */
export const ENV_FILE = join(ROOT, ".env");

/** The first of `names` that is set, from the environment or the project's .env; null if none. */
export function maybeSecret(...names) {
  for (const name of names) if (process.env[name]) return process.env[name];
  if (!existsSync(ENV_FILE)) return null;
  const text = readFileSync(ENV_FILE, "utf8");
  for (const name of names) {
    const match = text.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Like maybeSecret, but a missing secret is an error that says where Lyceum looked. */
export function secret(...names) {
  const value = maybeSecret(...names);
  if (value !== null) return value;
  const which = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
  throw new Error(
    `${which} isn't set. Lyceum looked in the environment, then in ${ENV_FILE}` +
      `${existsSync(ENV_FILE) ? "" : " (there is none)"}, and never looks above the project.\n` +
      `Inject it into the environment from a secrets manager, e.g. 1Password's ` +
      `\`op run --env-file=secrets.env -- npx lyceum …\` with ${names[0]}=op://… in secrets.env.\n` +
      `Or put ${names[0]}=… in ${ENV_FILE}, which lyceum init gitignores.`,
  );
}
