// The machine-wide Lyceum directory, on its own so tools that run outside a project (init, the update
// check) can find it: importing tools/paths.mjs looks for the project.

import { homedir, platform } from "node:os";
import { join } from "node:path";

/** The machine-wide Lyceum directory: `LYCEUM_HOME`, else the platform's cache directory. */
export const HOME =
  process.env.LYCEUM_HOME ??
  (platform() === "darwin"
    ? join(homedir(), "Library", "Caches", "lyceum")
    : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "lyceum"));
