// The browser side of Lyceum, bundled with a project's videos by esbuild: the page the renderer draws
// frames in (kit/page.tsx, see chrome.mjs) and the studio (studio/app.tsx, see studio.mjs). Both are
// built in memory and served on localhost, with the kit's fonts under /fonts/.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { ENGINE, KIT, REGISTRY, ROOT } from "./paths.mjs";

/** Where to resolve a package from: the project, if it has its own copy, else Lyceum. */
function resolveDir(name) {
  try {
    createRequire(join(ROOT, "package.json")).resolve(`${name}/package.json`);
    return ROOT;
  } catch {
    return ENGINE;
  }
}

/** The kit and the registry resolve to this Lyceum, whatever the project's own package.json says, and
 *  React to a single copy across the kit and the scenes (two Reacts break hooks). */
const resolver = {
  name: "lyceum",
  setup(build) {
    const fixed = { "#kit": join(KIT, "scene.ts"), "lyceum/kit": join(KIT, "scene.ts"), "@lyceum/videos": REGISTRY };
    build.onResolve({ filter: /^(#kit|lyceum\/kit|@lyceum\/videos)$/ }, (args) => ({ path: fixed[args.path] }));
    const single = { resolved: true };
    build.onResolve({ filter: /^react(-dom)?(\/|$)/ }, async (args) => {
      if (args.pluginData === single) return undefined;
      const name = args.path.startsWith("react-dom") ? "react-dom" : "react";
      const result = await build.resolve(args.path, { kind: args.kind, resolveDir: resolveDir(name), pluginData: single });
      return result.errors.length ? { errors: result.errors } : { path: result.path };
    });
  },
};

/** esbuild options for a page whose script is `entry`: bundled in memory for Chrome, its outputs named
 *  after the entry (page.tsx → page.js, and page.css if it imports CSS). */
export function pageBuild(entry, plugins = []) {
  return {
    entryPoints: [entry],
    absWorkingDir: ROOT, // error messages name files from the project's root
    outdir: "out",
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [resolver, ...plugins],
    logLevel: "silent",
  };
}

/** A build's files by name, from memory. */
export function outputs(result) {
  return new Map(result.outputFiles.map((file) => [basename(file.path), file.contents]));
}

/** One of the kit's fonts, by file name, or null. */
export function font(name) {
  const path = join(ENGINE, "fonts", basename(name));
  return existsSync(path) ? readFileSync(path) : null;
}

export const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
