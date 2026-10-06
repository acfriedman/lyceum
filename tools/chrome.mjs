// Lyceum's renderer: the kit's page (kit/page.tsx) bundled with the project's videos, served on
// localhost, and drawn frame by frame in a pinned headless Chrome. `openScene` gives one scene's frames
// as screenshots: stills.mjs tiles a few of them, render.mjs pipes all of them into ffmpeg.

import { Browser, computeExecutablePath, install } from "@puppeteer/browsers";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join } from "node:path";
import { HOME, KIT, videoDir } from "./paths.mjs";
import { TYPES, font, outputs, pageBuild } from "./pages.mjs";

/** The Chrome for Testing build that draws frames (the one Remotion 4.0.533 was tested against, so the
 *  two renderers can be compared pixel for pixel). Text and filters can come out differently in another
 *  build, so render.mjs fingerprints it. */
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
// element is border-box, as it was under Remotion (whose page injects the same rule): scenes were laid
// out that way, and a bordered box drawn content-box would grow by its border.
const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
html, body { margin: 0; overflow: hidden; }
#stage { position: relative; overflow: hidden; }
</style></head>
<body><div id="stage"></div><script src="page.js"></script></body></html>
`;

/** The page, bundled with the project's videos: file name → contents. */
async function bundlePage() {
  return new Map([["index.html", HTML], ...outputs(await build(pageBuild(join(KIT, "page.tsx"))))]);
}

/** Serves the page, and the kit's fonts under /fonts/, on a free localhost port. */
async function serve(files) {
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const name = basename(path);
    const body = path.startsWith("/fonts/") ? font(name) : files.get(name);
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
async function openTab(browser, url, width, height, scale) {
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
  const info = await run("window.lyceum.open()").catch((error) => {
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
 * Opens one scene of a video for drawing, in `tabs` tabs at `scale` (1 = the video's own size).
 * Resolves to `{ fps, width, height, frames, frame(n, format), stream(list, format), close() }`, where
 * `format` is "png" or "jpeg" and `quality` is the JPEG quality.
 */
export async function openScene(video, id, { scale = 1, tabs = 1, quality = 92 } = {}) {
  const { width, height } = JSON.parse(readFileSync(join(videoDir(video), "narration.json"), "utf8"));
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
    const pages = await Promise.all(Array.from({ length: tabs }, () => openTab(browser, url, width, height, scale)));
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
