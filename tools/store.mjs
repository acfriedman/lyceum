#!/usr/bin/env node
// The project's store: an S3-compatible bucket (Cloudflare R2, Amazon S3, …) for what's costly to make
// again, and for the published videos. Without `store` in lyceum.config.json, nothing here runs and
// every tool works as before.
//
//   "store": {
//     "endpoint": "https://<account>.r2.cloudflarestorage.com",   the S3 API (signed requests)
//     "bucket": "gloss",
//     "public": "https://pub-….r2.dev",                           the bucket's public URL
//     "region": "auto",                                           optional; R2 takes "auto"
//     "prefix": ""                                                optional; put before every key
//   }
//
// Credentials are LYCEUM_STORE_ACCESS_KEY_ID and LYCEUM_STORE_SECRET_ACCESS_KEY, from the environment or
// the nearest .env, never the config. With them, reads and writes are signed (AWS Signature Version 4).
// Without them, reads go through the public URL, so any checkout can use the caches, and writes are
// skipped.
//
// What it holds, by key:
//   cache/narration/<hash>.mp3, .json, .lufs23.mp3    a voiced clip, its word timings and the leveled
//                                                     clip renders play, under narrate's clip hash
//   cache/scenes/<fingerprint>.mp4                    a rendered scene clip, under render's fingerprint
//   videos/<video>/…                                  what `lyceum publish` puts out, at fixed keys
//
// Narrate and render read through it on a local miss and write what they make, so a clip is voiced,
// and a scene drawn, once for every machine, CI included.
//
//   lyceum store push <video>…    upload a video's current clips and scene clips (to seed the store
//                                 from a machine that made them before it existed)

import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maybeSecret } from "./env.mjs";
import { CACHE as CACHE_ROOT, CONFIG } from "./paths.mjs";

/** Where narrate keeps its clips (as narrate.mjs names it). */
const NARRATION = join(CACHE_ROOT, "narration");

/** The store's settings, or null when the project has none. */
export const STORE = CONFIG.store
  ? { region: "auto", prefix: "", ...CONFIG.store, endpoint: CONFIG.store.endpoint?.replace(/\/+$/, ""), public: CONFIG.store.public?.replace(/\/+$/, "") }
  : null;
if (STORE && (!STORE.endpoint || !STORE.bucket)) throw new Error("lyceum.config.json: store needs an endpoint and a bucket");

const credentials = (() => {
  if (!STORE) return null;
  const accessKeyId = maybeSecret("LYCEUM_STORE_ACCESS_KEY_ID");
  const secretAccessKey = maybeSecret("LYCEUM_STORE_SECRET_ACCESS_KEY");
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : null;
})();

/** Whether this checkout can write to the store. */
export const canWrite = Boolean(credentials);

const TYPES = { mp3: "audio/mpeg", mp4: "video/mp4", json: "application/json", jpg: "image/jpeg", png: "image/png", vtt: "text/vtt", srt: "application/x-subrip", html: "text/html; charset=utf-8" };
const typeOf = (key) => TYPES[key.split(".").pop()] ?? "application/octet-stream";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
// RFC 3986, as S3's canonical request wants it: encodeURIComponent leaves !'()* alone.
const encode = (text) => encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const keyPath = (key) => `${STORE.prefix}${key}`.split("/").map(encode).join("/");

/** The headers that sign a request to the S3 API (AWS Signature Version 4). */
function signed(method, url, body, headers = {}) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payload = sha256(body ?? "");
  const all = { ...headers, host: url.host, "x-amz-content-sha256": payload, "x-amz-date": amzDate };
  const names = Object.keys(all).map((name) => name.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([name, value]) => [name.toLowerCase(), String(value).trim()]));
  const query = [...url.searchParams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
  const request = [method, url.pathname, query, names.map((name) => `${name}:${lower[name]}\n`).join(""), names.join(";"), payload].join("\n");
  const scope = `${day}/${STORE.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(request)].join("\n");
  const key = ["s3", "aws4_request"].reduce(hmac, hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), STORE.region));
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  const { host, ...rest } = all;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

/** A request for `key`: signed against the S3 API when this checkout has credentials, else (reads only)
 *  through the public URL. Resolves to the response, or null when the store can't be asked. */
async function ask(method, key, { body, headers } = {}) {
  if (credentials) {
    const url = new URL(`${STORE.endpoint}/${encode(STORE.bucket)}/${keyPath(key)}`);
    return fetch(url, { method, body, headers: signed(method, url, body, headers) });
  }
  if (method !== "GET" && method !== "HEAD") return null;
  if (!STORE.public) return null;
  return fetch(`${STORE.public}/${keyPath(key)}`, { method });
}

let warned = false;
/** Says once that the store failed, and why, then carries on: a store that's down costs time, not work. */
function warn(error) {
  if (warned) return;
  warned = true;
  console.warn(`  store: ${error.message ?? error} (carrying on without it)`);
}

/** Downloads `key` to `dest`, written whole or not at all. Resolves to whether it was there. */
export async function fetchObject(key, dest) {
  if (!STORE) return false;
  try {
    const response = await ask("GET", key);
    if (!response || response.status === 404 || response.status === 403) return false;
    if (!response.ok) throw new Error(`GET ${key}: ${response.status} ${response.statusText}`);
    mkdirSync(dirname(dest), { recursive: true });
    const partial = `${dest}.partial`;
    writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
    renameSync(partial, dest);
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

/** Whether the store holds `key`. */
export async function hasObject(key) {
  if (!STORE) return false;
  try {
    const response = await ask("HEAD", key);
    return Boolean(response?.ok);
  } catch (error) {
    warn(error);
    return false;
  }
}

/**
 * Uploads `file` to `key`. Content-addressed keys (the caches) skip the upload when the store already
 * has them; fixed keys (`replace`) are always written. Resolves to whether it was written.
 * @param {{ replace?: boolean, cacheControl?: string }} [options]
 */
export async function putObject(key, file, { replace = false, cacheControl } = {}) {
  if (!STORE || !credentials) return false;
  try {
    if (!replace && (await hasObject(key))) return false;
    const body = readFileSync(file);
    const headers = { "content-type": typeOf(key), ...(cacheControl ? { "cache-control": cacheControl } : {}) };
    const response = await ask("PUT", key, { body, headers });
    if (!response.ok) throw new Error(`PUT ${key}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

/** The keys under `prefix` (after the store's own prefix). Needs credentials. */
export async function listKeys(prefix = "") {
  if (!STORE || !credentials) return [];
  const keys = [];
  let token = null;
  do {
    const url = new URL(`${STORE.endpoint}/${encode(STORE.bucket)}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", `${STORE.prefix}${prefix}`);
    if (token) url.searchParams.set("continuation-token", token);
    const response = await fetch(url, { headers: signed("GET", url, null) });
    if (!response.ok) throw new Error(`list ${prefix}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    const xml = await response.text();
    for (const [, key] of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(key.slice(STORE.prefix.length));
    token = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? null;
  } while (token);
  return keys;
}

/** Deletes `key` (used to clean up after tests; nothing in the normal flow deletes). */
export async function deleteObject(key) {
  if (!STORE || !credentials) return false;
  const response = await ask("DELETE", key);
  return response.ok;
}

// Narration clips: what narrate caches under a clip's hash.
const narrationFiles = (hash, lufs) => [`${hash}.mp3`, `${hash}.json`, `${hash}.lufs${lufs}.mp3`];

/** Fills the local narration cache for `hash` from the store. Resolves to whether all of it was there. */
export async function fetchNarration(hash, lufs) {
  if (!STORE) return false;
  const files = narrationFiles(hash, lufs);
  const got = await Promise.all(files.map((file) => fetchObject(`cache/narration/${file}`, join(NARRATION, file))));
  if (got.every(Boolean)) return true;
  for (const [i, file] of files.entries()) if (got[i]) rmSync(join(NARRATION, file), { force: true }); // all or none
  return false;
}

/** Uploads the local narration cache for `hash`: the clip, its timings and each leveled copy. Resolves
 *  to whether anything was written. */
export async function pushNarration(hash) {
  if (!STORE || !credentials || !existsSync(NARRATION)) return false;
  const files = readdirSync(NARRATION).filter((file) => file === `${hash}.mp3` || file === `${hash}.json` || new RegExp(`^${hash}\\.lufs\\d+\\.mp3$`).test(file));
  const wrote = await Promise.all(files.map((file) => putObject(`cache/narration/${file}`, join(NARRATION, file))));
  return wrote.some(Boolean);
}

/** Fetches a rendered scene clip by its fingerprint to `dest`. */
export const fetchScene = (fingerprint, dest) => fetchObject(`cache/scenes/${fingerprint}.mp4`, dest);

/** Uploads a rendered scene clip under its fingerprint. */
export const pushScene = (fingerprint, file) => putObject(`cache/scenes/${fingerprint}.mp4`, file);

/** The public URL of `key`, or null without one. */
export const publicUrl = (key) => (STORE?.public ? `${STORE.public}/${keyPath(key)}` : null);

/** Fixed keys are rewritten on every publish, so caches in front of them (the CDN, GitHub's image
 *  proxy) may keep a copy only briefly. */
export const FIXED = "public, max-age=300";

/** Publishes `file` at a fixed key. */
export const putFixed = (key, file) => putObject(key, file, { replace: true, cacheControl: FIXED });

// `lyceum store push <video>…`: seed the store with a video's current clips and scene clips.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sub, ...videos] = process.argv.slice(2);
  if (sub !== "push" || videos.length === 0) {
    console.error("usage: lyceum store push <video>…");
    process.exit(2);
  }
  if (!STORE) {
    console.error("this project has no store: add `store` to lyceum.config.json");
    process.exit(2);
  }
  if (!credentials) {
    console.error("no store credentials: set LYCEUM_STORE_ACCESS_KEY_ID and LYCEUM_STORE_SECRET_ACCESS_KEY");
    process.exit(2);
  }
  const { videoDir, videoSlug, distDir } = await import("./paths.mjs");
  for (const video of videos) {
    const slug = videoSlug(video);
    const narration = JSON.parse(readFileSync(join(videoDir(video), "narration.json"), "utf8"));
    let clips = 0;
    let scenes = 0;
    for (const scene of narration.scenes) if (await pushNarration(scene.hash)) clips++;
    const out = join(distDir(slug), "scenes");
    for (const id of ["_title", ...narration.scenes.map((s) => s.id)]) {
      const stamp = join(out, `${id}.json`);
      const clip = join(out, `${id}.mp4`);
      if (existsSync(stamp) && existsSync(clip) && (await pushScene(readFileSync(stamp, "utf8").trim(), clip))) scenes++;
    }
    console.log(`${slug}: uploaded ${clips} narration clip${clips === 1 ? "" : "s"} and ${scenes} scene clip${scenes === 1 ? "" : "s"} the store didn't have`);
  }
}
