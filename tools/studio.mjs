#!/usr/bin/env node
// `lyceum studio`: the project's videos in the browser, to scrub and play scenes with their narration
// (studio/app.tsx). The app is rebuilt whenever a scene, the kit or a narration changes, and the page
// reloads itself onto the same frame; a build that fails shows its errors over the page instead.
//
//   lyceum studio [--port <n>] [--no-open] [--engine remotion|lyceum]
//
// `--engine remotion`, for now the default, opens Remotion Studio instead (other flags pass through).

import { spawn } from "node:child_process";
import { context, formatMessages } from "esbuild";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { ENGINE, ENTRY, PUBLIC, ROOT, STUDIO, preparePublic } from "./paths.mjs";
import { TYPES, font, outputs, pageBuild } from "./pages.mjs";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? undefined : argv[i + 1];
};
const engine = opt("engine") ?? "remotion";
if (!["remotion", "lyceum"].includes(engine)) {
  console.error("usage: lyceum studio [--port <n>] [--no-open] [--engine remotion|lyceum]");
  process.exit(2);
}

if (engine === "remotion") await remotionStudio(argv.filter((arg, i) => arg !== "--engine" && argv[i - 1] !== "--engine"));
else await studio();

/** Builds, watches and serves the studio until interrupted. */
async function studio() {
  // The latest good build, and the errors of the latest build if it failed.
  let build = 0;
  let files = new Map();
  let problem = null;
  const clients = new Set();
  const send = (client, message) => client.write(`data: ${JSON.stringify(message)}\n\n`);
  let built;
  const firstBuild = new Promise((resolve) => (built = resolve));
  const announce = {
    name: "studio",
    setup(esbuild) {
      esbuild.onEnd(async (result) => {
        if (result.errors.length) {
          problem = (await formatMessages(result.errors, { kind: "error", color: false })).join("\n");
          console.error(`  the studio's build failed:\n${problem}`);
          for (const client of clients) send(client, { type: "error", text: problem });
        } else {
          files = outputs(result);
          problem = null;
          build++;
          if (build > 1) console.log(`  rebuilt; reloading (${new Date().toLocaleTimeString()})`);
          for (const client of clients) send(client, { type: "build", build });
        }
        built();
      });
    },
  };
  const builder = await context(pageBuild(join(STUDIO, "app.tsx"), [announce]));
  await builder.watch();
  await firstBuild;
  preparePublic();

  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      send(response, problem ? { type: "error", text: problem } : { type: "build", build });
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    const body = path === "/" ? page(build) : file(path, files);
    if (!body) return response.writeHead(404).end();
    const type = path === "/" ? TYPES[".html"] : (TYPES[extname(path)] ?? "application/octet-stream");
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
  });
  const port = await listen(server, Number(opt("port") ?? 3000), opt("port") === undefined);
  const url = `http://localhost:${port}`;
  console.log(`Lyceum Studio: ${url}  (Ctrl-C to stop)`);
  if (!argv.includes("--no-open")) open(url);
}

/** A file the studio serves: the app as built, the kit's fonts, or the project's narration audio. */
function file(path, files) {
  if (path.startsWith("/fonts/")) return font(path);
  if (path.startsWith("/public/")) {
    const target = resolve(PUBLIC, `.${decodeURIComponent(path.slice("/public".length))}`);
    return target.startsWith(PUBLIC + sep) && existsSync(target) && statSync(target).isFile() ? readFileSync(target) : null;
  }
  return files.get(path.slice(1)) ?? null;
}

/** The studio's page: the app, and a small script that keeps it on the latest build. */
const page = (build) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lyceum Studio</title>
<link rel="stylesheet" href="app.css">
<style>#problem { position: fixed; inset: 0; z-index: 10; margin: 0; padding: 32px 40px; overflow: auto; background: rgba(14, 14, 16, 0.96); color: #fc6255; font: 13px/1.6 Menlo, monospace; white-space: pre-wrap; }</style>
</head>
<body>
<div id="root"></div>
<script src="app.js"></script>
<script>
  // A new build reloads the page, which keeps its place in the URL; a failed one shows why.
  new EventSource("/events").onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "build" && message.build !== ${build}) location.reload();
    if (message.type === "error") {
      const problem = document.getElementById("problem") ?? document.body.appendChild(Object.assign(document.createElement("pre"), { id: "problem" }));
      problem.textContent = message.text;
    }
  };
</script>
</body>
</html>
`;

/** Listens on localhost at `port`, or (when `search`) at the first free port after it. */
async function listen(server, port, search) {
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise((done, fail) => {
        server.once("error", fail);
        server.listen(port + attempt, "127.0.0.1", () => {
          server.off("error", fail);
          done();
        });
      });
      return port + attempt;
    } catch (error) {
      if (error.code !== "EADDRINUSE" || !search || attempt >= 20) throw error;
    }
  }
}

/** Opens `url` in the default browser. */
function open(url) {
  const [command, ...args] =
    process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

/** Remotion Studio on every registered video, with the same aliases renders use. */
async function remotionStudio(args) {
  const { studioConfig } = await import("./bundle.mjs");
  const cliPackage = createRequire(join(ENGINE, "package.json")).resolve("@remotion/cli/package.json");
  const { bin } = JSON.parse(readFileSync(cliPackage, "utf8"));
  const cli = join(dirname(cliPackage), typeof bin === "string" ? bin : bin.remotion);
  const studio = spawn(process.execPath, [cli, "studio", ENTRY, "--public-dir", preparePublic(), "--config", studioConfig(), ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  studio.on("exit", (code) => process.exit(code ?? 0));
}
