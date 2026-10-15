// Parses a video's script.md into scenes.
//
// Format: optional YAML frontmatter, then an optional intent section (what the video is for: anything
// before the first scene, never narrated), then one `## NN · id — Title` heading per scene. Lines
// starting with `> ` are the visual description; every other paragraph is narration, spoken in order.
// Narration may be written as a bulleted list, a line per breath, to read from: the bullets are only
// its shape, and the lines run on as one paragraph. HTML comments are ignored.

import { readFileSync } from "node:fs";
import YAML from "yaml";

const SCENE_HEADING = /^##\s+(\d+)\s+·\s+([a-z0-9-]+)\s+—\s+(.+)$/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

/**
 * A script's frontmatter, without parsing its scenes (a draft may have none yet).
 *
 * @param {string} source  the text of a script.md
 * @param {{ strings?: boolean }} options  `strings` reads every value as a string, so a commit like
 *   `1234567` or `1e34567` stays as written instead of becoming a number
 * @returns {{ meta: Record<string, any>, block: string | null, body: string }}
 */
export function frontmatter(source, { strings = false } = {}) {
  const front = source.match(FRONTMATTER);
  if (!front) return { meta: {}, block: null, body: source };
  const meta = YAML.parse(front[1], strings ? { schema: "failsafe" } : {}) ?? {};
  return { meta, block: front[1], body: source.slice(front[0].length) };
}

/**
 * @param {string} path  the script.md to read
 * @returns {{ meta: Record<string, any>, intent: string, scenes: { num: number, id: string, title: string, visual: string, narration: string }[] }}
 */
export function parseScript(path) {
  const parsed = frontmatter(readFileSync(path, "utf8").replace(/<!--[\s\S]*?-->/g, ""));
  const { meta } = parsed;
  const source = parsed.body;

  const scenes = [];
  const intent = [];
  let current = null;
  for (const line of source.split("\n")) {
    const heading = line.match(SCENE_HEADING);
    if (heading) {
      current = { num: Number(heading[1]), id: heading[2], title: heading[3].trim(), visual: [], narration: [] };
      scenes.push(current);
      continue;
    }
    if (!current) {
      intent.push(line);
      continue;
    }
    if (line.startsWith(">")) {
      current.visual.push(line.replace(/^>\s?/, "").replace(/^Visual:\s*/, ""));
    } else {
      current.narration.push(line.replace(/^\s*[-*+]\s+/, ""));
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
  return { meta, intent: intent.join("\n").trim(), scenes };
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
