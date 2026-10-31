#!/usr/bin/env node
// Prints Lyceum's version and whether a newer release is out, asking GitHub now rather than going by
// its last remembered answer.
//
//   lyceum version           the version, and the update notice if a newer release is out
//   lyceum version --hook    for an agent's session-start hook (`lyceum init` adds one for Claude Code):
//                            silent unless a newer release is out, then the notice and what to do with it

import { SKIP_CHECK, VERSION, newerRelease, updateNotice } from "./version.mjs";

const hook = process.argv.includes("--hook");
if (!hook) console.log(`lyceum ${VERSION}`);
const latest = SKIP_CHECK ? undefined : await newerRelease({ fresh: true });
if (latest) {
  console.log(updateNotice(latest));
  if (hook) {
    console.log(
      "Tell the user about this once, early, in a sentence that starts with 🎁, with the command and the link. " +
        "Don't update unless they ask: a new release can change how every video renders.",
    );
  }
}
