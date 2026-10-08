#!/usr/bin/env node
// The `lyceum` command: one entry point that runs the tool for each subcommand.

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), "..", "tools");

const COMMANDS = {
  init: ["init.mjs", "make the current directory (or <dir>) a Lyceum project"],
  new: ["new-video.mjs", 'start a video: <slug> "<Title>"'],
  narrate: ["narrate.mjs", "voice a video's script: <video> [--provider openai|elevenlabs|say] [--only <scene>]"],
  scenes: ["scenes.mjs", "scaffold scene files and per-scene briefs from the narration: <video>"],
  stills: ["stills.mjs", "a contact sheet of one scene: <video> <scene> [--at <s1,s2,…> | --every <s>]"],
  render: ["render.mjs", "render a video (or one scene): <video> [--scene <id> [--draft]]"],
  stale: ["stale.mjs", "which videos' sources changed since they were checked: [<video>…] [--json] | --mark <video>…"],
  typecheck: ["typecheck.mjs", "type-check the project's scenes"],
  skill: ["skill.mjs", "install the agent skill: link [--agent claude,codex,agents] [--project <dir>]"],
};

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "help" || command === "--help" || command === "-h" || !COMMANDS[command]) {
  if (command && !["help", "--help", "-h"].includes(command)) console.error(`unknown command "${command}"\n`);
  console.log("usage: lyceum <command> [args]\n");
  for (const [name, [, about]] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(10)} ${about}`);
  process.exit(command && !["help", "--help", "-h"].includes(command) ? 2 : 0);
}

// Each tool reads its arguments from process.argv, as if it had been run directly.
const tool = join(TOOLS, COMMANDS[command][0]);
process.argv = [process.argv[0], tool, ...rest];
await import(pathToFileURL(tool).href);
