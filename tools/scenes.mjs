#!/usr/bin/env node
// Syncs a narrated video's scene scaffolding with its script, and dumps word timings for authoring.
//
//   lyceum scenes <video>
//
// Idempotent. Creates a placeholder `scenes/sNN-<id>.tsx` for every scene that has no file yet,
// regenerates `scenes/index.ts` in script order, creates `scenes/shared.tsx` if missing, registers
// the video in `videos/index.ts`, and writes authoring material to `.cache/work/<video>/`:
// word-timings.md (every spoken word with its start time, which is what `cue()` phrases are chosen
// from), scenes/<id>.md (one scene agent's whole brief pack), and kit-api.md (the scene API).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseScript } from "./script.mjs";
import { ENGINE, REGISTRY, ROOT, videoDir as resolveVideoDir, videoSlug, workDir } from "./paths.mjs";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: lyceum scenes <video>");
  process.exit(2);
}
const video = videoSlug(arg);
const videoDir = resolveVideoDir(arg);
const narrationPath = join(videoDir, "narration.json");
if (!existsSync(narrationPath)) {
  console.error(`${video}: no narration.json yet; run "lyceum narrate ${video}" first`);
  process.exit(1);
}

const { intent, scenes } = parseScript(join(videoDir, "script.md"));
const narration = JSON.parse(readFileSync(narrationPath, "utf8"));
const pascal = (id) => id.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const camel = (id) => pascal(id).replace(/^./, (c) => c.toLowerCase());

const scenesDir = join(videoDir, "scenes");
mkdirSync(scenesDir, { recursive: true });
const existing = readdirSync(scenesDir);

const entries = scenes.map((scene) => {
  const prefix = `s${String(scene.num).padStart(2, "0")}-${scene.id}`;
  const file = existing.find((f) => f === `${prefix}.tsx`);
  const component = pascal(scene.id);
  if (!file) {
    writeFileSync(
      join(scenesDir, `${prefix}.tsx`),
      `import React from "react";
import { C, Text, useScene } from "#kit";

// Placeholder until the scene is built.
export const ${component}: React.FC = () => {
  const { title } = useScene();
  return <Text x={960} y={540} size={56} color={C.dim} italic>{title}</Text>;
};
`,
    );
    console.log(`  created scenes/${prefix}.tsx`);
  }
  return { prefix, component, id: scene.id };
});

writeFileSync(
  join(scenesDir, "index.ts"),
  `import type { SceneMap } from "#kit";
${entries.map((e) => `import { ${e.component} } from "./${e.prefix}";`).join("\n")}

export const scenes: SceneMap = {
${entries.map((e) => `  ${/^[a-z][a-zA-Z0-9]*$/.test(e.id) ? e.id : JSON.stringify(e.id)}: ${e.component},`).join("\n")}
};
`,
);

if (!existsSync(join(scenesDir, "shared.tsx"))) {
  writeFileSync(
    join(scenesDir, "shared.tsx"),
    `// The visual vocabulary this video reuses across scenes, so the same idea always looks the same:
// role colours, standard positions, and recurring props. Define it before building scenes.

import { C } from "#kit";

export const ROLE = {
  primary: C.blue,
  wrong: C.red,
} as const;
`,
  );
  console.log("  created scenes/shared.tsx");
}

let registry = readFileSync(REGISTRY, "utf8");
if (!registry.includes(`"./${video}/narration.json"`)) {
  const name = camel(video);
  const imports = `import ${name}Narration from "./${video}/narration.json";\nimport { scenes as ${name}Scenes } from "./${video}/scenes";\n`;
  registry = registry.replace(/\nexport const videos/, `${imports}\nexport const videos`);
  registry = registry.replace(/\n\];\s*$/, `\n  { narration: ${name}Narration as Narration, scenes: ${name}Scenes },\n];\n`);
  writeFileSync(REGISTRY, registry);
  console.log("  registered in videos/index.ts");
}

// Authoring material, regenerated on every run: all word timings in one file, plus one brief pack
// per scene and a kit API digest, so a scene agent reads exactly what it needs and nothing else.
const work = workDir(video);
const wordLine = (s) => s.words.map((w) => `${w.w}@${w.s.toFixed(1)}`).join(" ");
const timingHeader = (s) =>
  `${(s.frames / narration.fps).toFixed(1)}s total; composition time = narration time + ${(s.leadInFrames / narration.fps).toFixed(1)}s lead-in`;
writeFileSync(
  join(work, "word-timings.md"),
  narration.scenes.map((s) => `### ${s.id} (${timingHeader(s)})\n${wordLine(s)}`).join("\n\n") + "\n",
);

const packs = join(work, "scenes");
mkdirSync(packs, { recursive: true });
scenes.forEach((scene, index) => {
  const timing = narration.scenes.find((s) => s.id === scene.id);
  const entry = entries[index];
  const neighbour = (i) => (scenes[i] ? `${scenes[i].num} · ${scenes[i].id} — ${scenes[i].title}` : "none");
  writeFileSync(
    join(packs, `${scene.id}.md`),
    `# Scene ${scene.num} · ${scene.id} — ${scene.title}

File: \`${relative(ROOT, join(scenesDir, `${entry.prefix}.tsx`))}\` → export \`${entry.component}\`
Before: ${neighbour(index - 1)}
After: ${neighbour(index + 1)}
${intent ? `\n## What the video is for\n${intent.replace(/^#+ .*\n+/, "")}\n` : ""}
## Visual brief
${scene.visual || "(none)"}

## Narration
${scene.narration}

## Word timings (${timingHeader(timing)})
Copy cue phrases from here: \`cue("…")\` throws on a phrase the narration doesn't contain.

${wordLine(timing)}
`,
  );
});
writeFileSync(join(work, "kit-api.md"), kitDigest());

console.log(`${video}: ${entries.length} scenes; briefs → ${relative(ROOT, packs)}/<scene>.md, kit → ${relative(ROOT, join(work, "kit-api.md"))}`);

/**
 * The scene API in one page: each exported declaration of the files `#kit` re-exports, with its doc
 * comment, prop types and constants in full, and components and functions by signature.
 */
function kitDigest() {
  const files = ["cue.tsx", "anim.ts", "theme.ts", "primitives.tsx"];
  const sections = files.map((file) => {
    const lines = readFileSync(join(ENGINE, "kit", file), "utf8").split("\n");
    // The file's leading comment says how its pieces are used (cue.tsx's is the timing how-to).
    const header = [];
    for (const line of lines) {
      if (!line.startsWith("//")) break;
      header.push(line);
    }
    const out = header.length ? [header.join("\n")] : [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("export ")) continue;
      let doc = [];
      for (let j = i - 1; j >= 0 && /^\s*(\/\/|\/\*\*|\*)/.test(lines[j]); j--) doc.unshift(lines[j]);
      let body;
      if (/^export (type|const) \w+[^=]*= \{$/.test(line) || /^export const \w+ = \{$/.test(line)) {
        let j = i;
        while (j < lines.length && !/^\}/.test(lines[j])) j++;
        body = lines.slice(i, j + 1);
      } else if (/^export const \w+: React\.FC/.test(line)) {
        body = [line.replace(/\s*=\s*\(.*$/, "").replace(/\s*=\s*$/, "")];
      } else if (/^export function/.test(line)) {
        let j = i;
        while (j < lines.length && !/\{\s*$/.test(lines[j])) j++;
        body = [lines.slice(i, j + 1).join("\n").replace(/\s*\{\s*$/, "")];
      } else {
        body = [line];
      }
      out.push([...doc, ...body].join("\n"));
    }
    return `## ${file}\n\n\`\`\`ts\n${out.join("\n\n")}\n\`\`\``;
  });
  return `# Kit API (generated by \`lyceum scenes\`; import everything from "#kit")\n\n${sections.join("\n\n")}\n`;
}
