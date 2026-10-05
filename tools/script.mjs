// Parses a video's script.md into scenes.
//
// Format: optional YAML frontmatter, then one `## NN · id — Title` heading per scene. Lines starting
// with `> ` are the visual description; every other paragraph is narration, spoken in order. HTML
// comments are ignored.

import { readFileSync } from "node:fs";
import YAML from "yaml";

const SCENE_HEADING = /^##\s+(\d+)\s+·\s+([a-z0-9-]+)\s+—\s+(.+)$/;

/**
 * @param {string} path  the script.md to read
 * @returns {{ meta: Record<string, any>, scenes: { num: number, id: string, title: string, visual: string, narration: string }[] }}
 */
export function parseScript(path) {
  let source = readFileSync(path, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  let meta = {};
  const front = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (front) {
    meta = YAML.parse(front[1]) ?? {};
    source = source.slice(front[0].length);
  }

  const scenes = [];
  let current = null;
  for (const line of source.split("\n")) {
    const heading = line.match(SCENE_HEADING);
    if (heading) {
      current = { num: Number(heading[1]), id: heading[2], title: heading[3].trim(), visual: [], narration: [] };
      scenes.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith(">")) {
      current.visual.push(line.replace(/^>\s?/, "").replace(/^Visual:\s*/, ""));
    } else {
      current.narration.push(line);
    }
  }

  const ids = new Set();
  for (const scene of scenes) {
    if (ids.has(scene.id)) throw new Error(`${path}: duplicate scene id "${scene.id}"`);
    ids.add(scene.id);
    scene.visual = scene.visual.join(" ").trim();
    scene.narration = scene.narration
      .join("\n")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n\n");
    if (!scene.narration) throw new Error(`${path}: scene "${scene.id}" has no narration`);
  }
  if (scenes.length === 0) throw new Error(`${path}: no scenes (expected "## NN · id — Title" headings)`);
  return { meta, scenes };
}

/**
 * The text the voice actually speaks: markdown emphasis stripped, then the script's `pronounce`
 * substitutions applied (whole words only).
 *
 * @param {string} narration  a scene's narration
 * @param {Record<string, string>} pronounce  written form → spoken form
 */
export function spokenText(narration, pronounce = {}) {
  let text = narration.replace(/[*_`]/g, "");
  for (const [written, spoken] of Object.entries(pronounce)) {
    text = text.replace(new RegExp(`\\b${written.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), spoken);
  }
  return text;
}
