// Lyceum's renderer: the kit's page (kit/page.tsx) bundled with the project's videos, served on
// localhost, and drawn frame by frame in a pinned headless Chrome. `openScene` gives one scene's frames
// as screenshots: stills.mjs tiles a few of them, render.mjs pipes all of them into ffmpeg.

import { Browser, computeExecutablePath, install } from "@puppeteer/browsers";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, extname, join } from "node:path";
import { ENGINE, HOME, KIT, REGISTRY, ROOT } from "./paths.mjs";
import { loadVideo, pageOptions } from "./video.mjs";

/** The Chrome for Testing build that draws frames, pinned: text and filters can come out differently in
 *  another build, so render.mjs fingerprints it. */
export const CHROME_BUILD = "149.0.7790.0";

// Switches for drawing frames: the same pixels on every machine, and no throttling of the tabs that
// draw in parallel.
const ARGS = [
  "--force-color-profile=srgb", // colors as written, whatever the display's profile
  "--font-render-hinting=none", // glyph outlines independent of the system's hinting
  "--hide-scrollbars",
  "--ignore-gpu-blocklist",
  "--force-gpu-mem-available-mb=4096",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-ipc-flooding-protection",
  "--disable-features=Translate,BackForwardCache,IntensiveWakeUpThrottling",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--disable-breakpad",
  "--disable-dev-shm-usage",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
  "--use-mock-keychain",
];

// The stage sits at the page's top-left corner, the video's size; screenshots clip to it. Every
// element is border-box: scenes were laid out that way (under Remotion, whose page set the same rule),
// and a bordered box drawn content-box would grow by its border.
const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
html, body { margin: 0; overflow: hidden; }
#stage { position: relative; overflow: hidden; }
</style></head>
<body><div id="stage"></div><script src="page.js"></script></body></html>
`;

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

/** Bundles the page with the project's videos, in memory: file name → contents. */
async function bundlePage() {
  const { outputFiles } = await build({
    entryPoints: [join(KIT, "page.tsx")],
    outfile: "page.js",
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [resolver],
    logLevel: "silent",
  });
  return new Map([["index.html", HTML], ...outputFiles.map((f) => [basename(f.path), f.contents])]);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2" };

/** Serves the page, and the kit's fonts under /fonts/, on a free localhost port. */
async function serve(files) {
  const fonts = join(ENGINE, "fonts");
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const name = basename(path);
    const body = path.startsWith("/fonts/") ? existsSync(join(fonts, name)) && readFileSync(join(fonts, name)) : files.get(name);
    if (!body) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": TYPES[extname(name)] ?? "application/octet-stream" }).end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

/** The pinned headless Chrome, downloaded into the Lyceum home directory on first use. */
async function chrome() {
  const options = { browser: Browser.CHROMEHEADLESSSHELL, buildId: CHROME_BUILD, cacheDir: join(HOME, "chrome") };
  const path = computeExecutablePath(options);
  if (existsSync(path)) return path;
  console.log(`  downloading headless Chrome ${CHROME_BUILD} (once per machine)…`);
  return (await install(options)).executablePath;
}

/** A tab drawing the scene at `url`: `capture(frame, format, quality)` draws a frame and screenshots it. */
async function openTab(browser, url, width, height, scale, options) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));
  // The viewport, the scripts and the screenshots all go through one session: Chrome scopes emulation
  // to the session that set it, and a screenshot taken through another one ignores the scale.
  const cdp = await page.createCDPSession();
  await cdp.send("Emulation.setDeviceMetricsOverride", { mobile: false, width, height, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: "load" });
  const run = async (expression) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (!exceptionDetails) return result.value;
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  };
  // A page whose script failed never defined window.lyceum; the script's own error says why.
  const info = await run(`window.lyceum.open(${JSON.stringify(options)})`).catch((error) => {
    throw errors[0] ?? error;
  });
  return {
    info,
    async capture(frame, format, quality) {
      await run(`window.lyceum.seek(${frame})`);
      const { data } = await cdp.send("Page.captureScreenshot", {
        format,
        ...(format === "jpeg" ? { quality } : {}),
        clip: { x: 0, y: 0, width, height, scale: 1 },
        captureBeyondViewport: true,
        optimizeForSpeed: true,
        fromSurface: true,
      });
      return Buffer.from(data, "base64");
    },
  };
}

/**
 * Opens one clip of a video for drawing (a scene, or the title card: `TITLE` in video.mjs), in `tabs` tabs
 * at `scale` (1 = the video's own size).
 * Resolves to `{ fps, width, height, frames, frame(n, format), stream(list, format), close() }`, where
 * `format` is "png" or "jpeg" and `quality` is the JPEG quality.
 */
export async function openScene(video, id, { scale = 1, tabs = 1, quality = 92 } = {}) {
  const v = loadVideo(video);
  const { width, height } = v.narration;
  const options = pageOptions(v, id);
  const server = await serve(await bundlePage());
  let browser;
  const close = async () => {
    await browser?.close();
    server.close();
  };
  try {
    browser = await puppeteer.launch({
      executablePath: await chrome(),
      // Drawing at the scale natively, not only emulating it, matters to how small text comes out.
      args: [...ARGS, `--force-device-scale-factor=${scale}`],
      ignoreDefaultArgs: true,
      pipe: true,
      defaultViewport: null,
      waitForInitialPage: false, // there is none: the tabs are opened below
    });
    const url = `http://127.0.0.1:${server.address().port}/index.html?${new URLSearchParams({ video, scene: id })}`;
    const pages = await Promise.all(Array.from({ length: tabs }, () => openTab(browser, url, width, height, scale, options)));
    const frame = async (page, n, format) => {
      try {
        return await page.capture(n, format, quality);
      } catch (error) {
        throw new Error(`${video}/${id}, frame ${n}: ${error.message}`);
      }
    };
    return {
      ...pages[0].info,
      frame: (n, format) => frame(pages[0], n, format),
      /** The frames in `list`, in order, drawn round-robin across the tabs a few frames ahead. */
      async *stream(list, format) {
        const queues = pages.map(() => Promise.resolve());
        const pending = [];
        const enqueue = () => {
          const i = pending.length;
          const tab = i % pages.length;
          const shot = queues[tab].then(() => frame(pages[tab], list[i], format));
          queues[tab] = shot.catch(() => {});
          pending.push(shot);
        };
        while (pending.length < Math.min(list.length, pages.length * 2)) enqueue();
        for (let i = 0; i < list.length; i++) {
          const shot = await pending[i];
          pending[i] = null;
          if (pending.length < list.length) enqueue();
          yield shot;
        }
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
