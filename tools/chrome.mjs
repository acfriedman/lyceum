// Lyceum's renderer: the kit's page (kit/page.tsx) bundled with the project's videos, served on
// localhost, and drawn frame by frame in a pinned headless Chrome. `openScene` gives one scene's frames
// as screenshots: stills.mjs tiles a few of them, render.mjs pipes all of them into ffmpeg.
//
// A scene can't reach the network, whatever its code does (an agent often writes it): Chrome sends
// every request through the local server as its proxy, and the server answers only those for itself.
// Anything else is refused and fails the render, naming the scene and the URL.

import { Browser, Cache, computeExecutablePath, detectBrowserPlatform, install } from "@puppeteer/browsers";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, extname, join } from "node:path";
import { ENGINE, HOME, KIT, REGISTRY, ROOT } from "./paths.mjs";
import { withSlot } from "./slots.mjs";
import { loadVideo, pageOptions } from "./video.mjs";

/** The Chrome for Testing build that draws frames, pinned: text and filters can come out differently in
 *  another build, so render.mjs fingerprints it. */
export const CHROME_BUILD = "149.0.7790.0";

/** The SHA-256 of CHROME_BUILD's archive for each platform (by @puppeteer/browsers' names). A download
 *  that doesn't match is deleted and never run. Bumping CHROME_BUILD needs its hashes in the same change,
 *  or Chrome won't download at all: `node scripts/chrome-hashes.mjs` writes them. */
const CHROME_SHA256 = {
  "149.0.7790.0": {
    linux: "a3b011ab4c726e215cdeb623907a09cfb48f07054a7271fdda555ee2ae4f804d",
    mac: "2597bf0940b54afbdfcb76519b5c8cf423cec49eea90ce1c4123456aca47a851",
    mac_arm: "17ef152eba8ffcfebc42e25ab295eb040d8e62455cff7dfcc735b652456d6899",
    win32: "44c3064d2880536693e882e486093969ccdb77a8843ca61bd65fc6d25b3d9155",
    win64: "8a112c0e768907ff382ff994dcde35cdbd0e1f5a3a475da93d3a83e3260e78c2",
  },
};

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

/** Switches that keep a scene off the network. Every request goes to Lyceum's server, Chrome's proxy,
 *  which serves its own origin and refuses the rest (see serve): fetches, images, fonts, workers'
 *  and service workers' requests, and WebSockets alike. */
const offline = (origin) => [
  `--proxy-server=${origin}`,
  "--proxy-bypass-list=<-loopback>", // even other ports on this machine go through it
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", // and no host name is ever looked up
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", // WebRTC only through the proxy, which refuses it
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

/**
 * Serves the page, and the kit's fonts under /fonts/, on a free localhost port, at `server.origin`.
 * It's also Chrome's proxy (see offline), so every request the scene makes arrives here: one for any
 * other origin is refused, and recorded in `server.blocked`.
 */
async function serve(files) {
  const fonts = join(ENGINE, "fonts");
  const blocked = [];
  let origin;
  // A proxied request names its whole URL; one sent straight here, only its path. Null if it's neither.
  const target = (request, scheme) => {
    try {
      return new URL(request.url, `${scheme}://${request.headers.host}`);
    } catch {
      return null;
    }
  };
  const server = createServer((request, response) => {
    const url = target(request, "http");
    if (url?.origin !== origin) {
      blocked.push(url?.href ?? request.url);
      return response.writeHead(403).end();
    }
    const name = basename(url.pathname);
    const body = url.pathname.startsWith("/fonts/") ? existsSync(join(fonts, name)) && readFileSync(join(fonts, name)) : files.get(name);
    if (!body) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": TYPES[extname(name)] ?? "application/octet-stream" }).end(body);
  });
  // HTTPS, and WebSockets, ask the proxy for a tunnel to their host; a WebSocket sent straight here asks
  // for an upgrade. Neither is ever granted.
  server.on("connect", (request, socket) => {
    blocked.push(request.url);
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  server.on("upgrade", (request, socket) => {
    blocked.push(target(request, "ws")?.href ?? request.url);
    socket.destroy();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return Object.assign(server, { origin, blocked });
}

/**
 * What a scene tried to reach, for the error: the URLs its page saw fail (whole, with their paths),
 * then whatever else the server refused (a worker's request, say, which the page doesn't see; HTTPS
 * only by host and port, since it asked for a tunnel).
 */
function blockedRequests(failed, refused) {
  const seen = new Set(failed);
  const hosts = new Set(
    failed.map((u) => {
      const url = new URL(u);
      return `${url.hostname}:${url.port || (url.protocol === "https:" || url.protocol === "wss:" ? 443 : 80)}`;
    }),
  );
  return [...seen, ...new Set(refused.filter((r) => !seen.has(r) && !hosts.has(r)))];
}

/** A file's SHA-256, streamed. */
function sha256(file) {
  return new Promise((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", () => done(hash.digest("hex"))).on("error", fail);
  });
}

/**
 * The pinned headless Chrome, downloaded into the Lyceum home directory on first use. Its archive is
 * checked against CHROME_SHA256 before it's unpacked, and the install is stamped with the hash it was
 * checked against: one without the stamp (from before Lyceum checked, or cut short) is deleted and
 * downloaded again.
 */
async function chrome() {
  const platform = detectBrowserPlatform();
  const expected = CHROME_SHA256[CHROME_BUILD]?.[platform];
  if (!expected) {
    throw new Error(
      CHROME_SHA256[CHROME_BUILD]
        ? `headless Chrome ${CHROME_BUILD} isn't available for ${platform ?? `${process.platform} ${process.arch}`}`
        : `no SHA-256 for headless Chrome ${CHROME_BUILD}: CHROME_SHA256 in tools/chrome.mjs is for another build ` +
            `(node scripts/chrome-hashes.mjs writes it)`,
    );
  }
  const options = { browser: Browser.CHROMEHEADLESSSHELL, buildId: CHROME_BUILD, platform, cacheDir: join(HOME, "chrome") };
  const path = computeExecutablePath(options);
  const dir = new Cache(options.cacheDir).installationDir(options.browser, platform, CHROME_BUILD);
  const stamp = join(dir, ".lyceum-sha256");
  const verified = () => existsSync(path) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === expected;
  if (verified()) return path;
  // One download at a time on the machine: two would write the same archive.
  return withSlot("chrome", async () => {
    if (verified()) return path; // another command installed it while this one waited
    rmSync(dir, { recursive: true, force: true });
    console.log(`  downloading headless Chrome ${CHROME_BUILD} (once per machine)…`);
    // The download is checked as it arrives (expectedHash), and the archive checked again here before
    // it's unpacked: @puppeteer/browsers would unpack an archive already on disk without checking it.
    const archive = await install({ ...options, unpack: false, expectedHash: expected });
    const actual = await sha256(archive);
    if (actual !== expected) {
      rmSync(archive, { force: true });
      throw new Error(
        `headless Chrome ${CHROME_BUILD}'s archive has SHA-256 ${actual}, not the ${expected} Lyceum expects: ` +
          `deleted it rather than run it`,
      );
    }
    const { executablePath } = await install({ ...options, expectedHash: expected });
    writeFileSync(stamp, `${expected}\n`);
    return executablePath;
  });
}

/** A tab drawing the scene at `url`: `capture(frame, format, quality)` draws a frame and screenshots it.
 *  Requests the page saw fail for any origin but `origin`, and every WebSocket it opened (the server
 *  grants none), go into `failed`. */
async function openTab(browser, url, width, height, scale, options, origin, failed) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));
  page.on("requestfailed", (request) => {
    const target = request.url();
    if (/^https?:|^wss?:/.test(target) && new URL(target).origin !== origin) failed.push(target);
  });
  // The viewport, the scripts and the screenshots all go through one session: Chrome scopes emulation
  // to the session that set it, and a screenshot taken through another one ignores the scale.
  const cdp = await page.createCDPSession();
  await cdp.send("Emulation.setDeviceMetricsOverride", { mobile: false, width, height, deviceScaleFactor: scale });
  // A WebSocket reaches the server only as its host and port: this gives its whole URL.
  cdp.on("Network.webSocketCreated", ({ url }) => failed.push(url));
  await cdp.send("Network.enable");
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
  const failed = [];
  /** Fails the render if the scene tried to reach anything but the server. */
  const offlineCheck = () => {
    const tried = blockedRequests(failed, server.blocked);
    if (!tried.length) return;
    throw new Error(
      `${video}/${id} tried to reach the network, and scenes can't:\n${tried.map((t) => `  ${t}`).join("\n")}\n` +
        `A scene can only load what Lyceum serves it (its bundle and the kit's fonts): import or inline the asset instead.`,
    );
  };
  try {
    browser = await puppeteer.launch({
      executablePath: await chrome(),
      // Drawing at the scale natively, not only emulating it, matters to how small text comes out.
      args: [...ARGS, ...offline(server.origin), `--force-device-scale-factor=${scale}`],
      ignoreDefaultArgs: true,
      pipe: true,
      defaultViewport: null,
      waitForInitialPage: false, // there is none: the tabs are opened below
    });
    const url = `${server.origin}/index.html?${new URLSearchParams({ video, scene: id, theme: v.theme })}`;
    const pages = await Promise.all(Array.from({ length: tabs }, () => openTab(browser, url, width, height, scale, options, server.origin, failed))).catch(
      (error) => {
        offlineCheck(); // a scene that failed to open because its request was refused: say so
        throw error;
      },
    );
    offlineCheck();
    const frame = async (page, n, format) => {
      let shot;
      try {
        shot = await page.capture(n, format, quality);
      } catch (error) {
        offlineCheck(); // a scene that broke because its request was refused: say so
        throw new Error(`${video}/${id}, frame ${n}: ${error.message}`);
      }
      offlineCheck();
      return shot;
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
        offlineCheck(); // anything the last frames set off
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
