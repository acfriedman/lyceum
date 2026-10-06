// Lyceum Studio: the project's videos in the browser, to scrub and play scenes with their narration.
// `lyceum studio` serves it (tools/studio.mjs) and reloads it when a scene, the kit or a narration
// changes; the position lives in the URL's hash, so a reload lands on the same frame. Scenes are drawn
// by the kit's Stage, laid out exactly as they render, and scaled to fit the window.

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClockProvider } from "../kit/clock";
import type { Word } from "../kit/cue";
import { loadFonts } from "../kit/fonts";
import { Stage } from "../kit/stage";
import { videos } from "@lyceum/videos";
import "./studio.css";

// MARK: - Timelines

/** A scene placed on a timeline, from frame `start`. */
type Span = { id: string; title: string; index: number; start: number; frames: number; leadIn: number; words: Word[]; audio: string };

/** What plays: one scene alone, or (`scene` null) a whole video's scenes back to back. */
type Timeline = { video: string; scene: string | null; fps: number; width: number; height: number; frames: number; spans: Span[] };

function timeline(video: string, scene: string | null): Timeline {
  const { narration } = videos.find((v) => v.narration.video === video)!;
  const all: Span[] = narration.scenes.map((s, index) => ({
    id: s.id,
    title: s.title,
    index,
    start: s.from,
    frames: s.frames,
    leadIn: s.leadInFrames,
    words: s.words,
    audio: s.audio,
  }));
  const spans = scene === null ? all : all.filter((s) => s.id === scene).map((s) => ({ ...s, start: 0 }));
  const frames = Math.max(...spans.map((s) => s.start + s.frames));
  return { video, scene, fps: narration.fps, width: narration.width, height: narration.height, frames, spans };
}

/** The scene showing at `frame`, and the frame within it. */
function locate(tl: Timeline, frame: number) {
  const span = tl.spans.findLast((s) => frame >= s.start) ?? tl.spans[0];
  return { span, local: frame - span.start };
}

/** A scene's narration clip: where to fetch it, and the timeline frame it starts on. */
const clip = (span: Span) => ({ url: `/public/${span.audio}`, at: span.start + span.leadIn });

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const two = (n: number) => String(n).padStart(2, "0");

/** m:ss.cc */
function timecode(frame: number, fps: number) {
  const seconds = frame / fps;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

// MARK: - Place: what's selected and where, kept in the URL's hash as #video/scene@frame (#video@frame
// for the whole video)

type Place = { video: string; scene: string | null; frame: number };

function readPlace(): Place | null {
  const [, video, scene, frame] = /^#([^/@]+)(?:\/([^@]+))?(?:@(\d+))?$/.exec(location.hash) ?? [];
  const entry = videos.find((v) => v.narration.video === video) ?? videos[0];
  if (!entry) return null;
  const scenes = entry.narration.scenes;
  if (entry.narration.video !== video) return { video: entry.narration.video, scene: scenes[0].id, frame: 0 };
  const id = scene === undefined ? null : scenes.some((s) => s.id === scene) ? scene : scenes[0].id;
  return { video, scene: id, frame: Number(frame ?? 0) };
}

function writePlace({ video, scene, frame }: Place) {
  history.replaceState(null, "", `#${video}${scene === null ? "" : `/${scene}`}@${frame}`);
}

/** Every entry in the sidebar, in order: each video whole, then its scenes. */
const ENTRIES = videos.flatMap(({ narration }) => [
  { video: narration.video, scene: null as string | null },
  ...narration.scenes.map((s) => ({ video: narration.video, scene: s.id as string | null })),
]);

// MARK: - Sound: the narration through Web Audio, each clip scheduled to the sample against the clock

class Sound {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private sources: AudioBufferSourceNode[] = [];
  private session = 0;
  private quiet = false;

  /** Starts loading `urls`, and forgets every other clip (decoded audio is large). */
  keep(urls: string[]) {
    for (const url of this.buffers.keys()) if (!urls.includes(url)) this.buffers.delete(url);
    for (const url of urls) this.load(url).catch(() => {});
  }

  /** Fetches and decodes a clip, once. */
  load(url: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`${url}: ${response.status}`);
          return response.arrayBuffer();
        })
        // Decoded offline, so nothing asks for the speakers before the first play.
        .then((data) => new OfflineAudioContext(1, 1, 48000).decodeAudioData(data));
      buffer.catch(() => this.buffers.delete(url));
      this.buffers.set(url, buffer);
    }
    return buffer;
  }

  set muted(quiet: boolean) {
    this.quiet = quiet;
    if (this.gain) this.gain.gain.value = quiet ? 0 : 1;
  }

  /**
   * Plays `clips` from `frame`, and resolves to the clock: the (fractional) frame being heard at any
   * moment. Called from a click or a key press, which is what lets a page make sound.
   */
  async start(clips: { url: string; at: number }[], frame: number, fps: number): Promise<() => number> {
    this.stop();
    const session = this.session;
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
      this.muted = this.quiet;
    }
    const context = this.context;
    await context.resume().catch(() => {});
    if (context.state !== "running") {
      const t0 = performance.now();
      return () => frame + ((performance.now() - t0) / 1000) * fps;
    }
    const t0 = context.currentTime;
    for (const { url, at } of clips) {
      const begin = t0 + (at - frame) / fps; // when the clip's first sample plays
      this.load(url).then(
        (buffer) => {
          if (session !== this.session) return;
          // A clip decoded late joins where it would be by now.
          const offset = Math.max(0, context.currentTime - begin);
          if (offset >= buffer.duration) return;
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(this.gain!);
          source.start(Math.max(begin, context.currentTime), offset);
          this.sources.push(source);
        },
        () => {},
      );
    }
    // What's heard lags what's scheduled by the output's latency (a lot, over Bluetooth): the picture
    // waits for it.
    const latency = context.outputLatency || context.baseLatency || 0;
    return () => frame + Math.max(0, context.currentTime - t0 - latency) * fps;
  }

  stop() {
    this.session++;
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources = [];
  }
}

// MARK: - The stage

/** The stage, scaled to fit the space it's given. */
function Viewer({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = box.current!;
    const fit = () => {
      const style = getComputedStyle(element);
      const w = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const h = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setScale(Math.max(0, Math.min(w / width, h / height)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);
  return (
    <div className="viewer" ref={box}>
      <div className="frame" style={{ width: width * scale, height: height * scale }}>
        <div className="canvas" style={{ width, height, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A scene that throws shows its error over the stage; moving to another frame tries again. */
class Catch extends React.Component<{ at: string; children: React.ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidUpdate(previous: { at: string }) {
    if (this.state.error !== null && previous.at !== this.props.at) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <div className="fault">
        {error instanceof Error ? error.message : String(error)}
        <small>{this.props.at}</small>
      </div>
    );
  }
}

// MARK: - Sidebar, transport, scrubber, transcript

/** Keeps a clicked button from taking the focus, so Space stays play and pause. */
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

const Sidebar = memo(function Sidebar({ video, scene, onSelect }: { video: string; scene: string | null; onSelect: (video: string, scene: string | null) => void }) {
  const nav = useRef<HTMLElement>(null);
  // Effects return nothing: scrollIntoView() can return a promise, which React would take for a cleanup.
  useEffect(() => {
    nav.current?.querySelector(".current")?.scrollIntoView({ block: "nearest" });
  }, [video, scene]);
  return (
    <nav className="sidebar" ref={nav}>
      <div className="brand">
        Lyceum <span>Studio</span>
      </div>
      {videos.map(({ narration }) => (
        <section className="video" key={narration.video}>
          <button
            className={`entry whole${narration.video === video && scene === null ? " current" : ""}`}
            onMouseDown={keepFocus}
            onClick={() => onSelect(narration.video, null)}
            title="The whole video"
          >
            <span className="label">{narration.video}</span>
            <span className="len mono">{timecode(narration.frames, narration.fps).replace(/\.\d+$/, "")}</span>
          </button>
          {narration.scenes.map((s, i) => (
            <button
              key={s.id}
              className={`entry${narration.video === video && scene === s.id ? " current" : ""}`}
              onMouseDown={keepFocus}
              onClick={() => onSelect(narration.video, s.id)}
              title={s.id}
            >
              <span className="num mono">{two(i + 1)}</span>
              <span className="label">{s.title}</span>
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
});

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PLAY = "M4.5 2.6v10.8L13.2 8z";
const PAUSE = "M3.8 2.5h3v11h-3zM9.2 2.5h3v11h-3z";
const SOUND = "M1.5 5.8h2.8L8 2.6v10.8L4.3 10.2H1.5zM10 5.2a3.6 3.6 0 0 1 0 5.6l-.9-1a2.3 2.3 0 0 0 0-3.6zM11.8 3.1a6.3 6.3 0 0 1 0 9.8l-.9-1a5 5 0 0 0 0-7.8z";
const MUTED = "M1.5 5.8h2.8L8 2.6v10.8L4.3 10.2H1.5zM9.6 5.6l.9-.9 1.8 1.8 1.8-1.8.9.9-1.8 1.8 1.8 1.8-.9.9-1.8-1.8-1.8 1.8-.9-.9 1.8-1.8z";

/** The scenes along the bar, and a tick where each word starts. Drawn once per timeline. */
const Spans = memo(function Spans({ tl }: { tl: Timeline }) {
  const at = (frame: number) => `${(frame / tl.frames) * 100}%`;
  return (
    <>
      {tl.spans.map((s) => (
        <div key={s.id} className="span" style={{ left: at(s.start), width: at(s.frames) }} title={`${two(s.index + 1)} ${s.title}`}>
          {tl.scene === null && <span className="tag mono">{two(s.index + 1)}</span>}
        </div>
      ))}
      {tl.spans.flatMap((s) =>
        s.words.map((w, i) => <div key={`${s.id}:${i}`} className="tick" style={{ left: at(s.start + s.leadIn + Math.round(w.s * tl.fps)) }} />),
      )}
    </>
  );
});

function Scrubber({ tl, frame, onSeek, onGrab }: { tl: Timeline; frame: number; onSeek: (frame: number) => void; onGrab: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const frameAt = (x: number) => {
    const box = bar.current!.getBoundingClientRect();
    return clamp(Math.floor(((x - box.left) / box.width) * tl.frames), 0, tl.frames - 1);
  };
  const at = `${(frame / tl.frames) * 100}%`;
  return (
    <div
      className="scrubber"
      ref={bar}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onGrab();
        onSeek(frameAt(event.clientX));
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onSeek(frameAt(event.clientX));
      }}
    >
      <Spans tl={tl} />
      <div className="played" style={{ width: at }} />
      <div className="playhead" style={{ left: at }} />
    </div>
  );
}

/** The scene's narration, word by word: the word being said lights up, and a click goes to a word. */
function Transcript({ span, local, fps, onSeek }: { span: Span; local: number; fps: number; onSeek: (frame: number) => void }) {
  // Each word's first frame, rounded the way cue() rounds it.
  const starts = useMemo(() => span.words.map((w) => span.leadIn + Math.round(w.s * fps)), [span, fps]);
  let current = -1;
  while (current + 1 < starts.length && starts[current + 1] <= local) current++;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector(".saying")?.scrollIntoView({ block: "nearest" });
  }, [current, span]);
  return (
    <div className="transcript" ref={box}>
      {span.words.map((w, i) => (
        <React.Fragment key={i}>
          <span
            className={`word${i === current ? " saying" : i < current ? " said" : ""}`}
            title={`frame ${starts[i]} of the scene (${(starts[i] / fps).toFixed(2)} s)`}
            onClick={() => onSeek(span.start + starts[i])}
          >
            {w.w}
          </span>{" "}
        </React.Fragment>
      ))}
    </div>
  );
}

// MARK: - The studio

function App({ initial }: { initial: Place }) {
  const [place, setPlace] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [restart, setRestart] = useState(0);
  const sound = useMemo(() => new Sound(), []);
  const tl = useMemo(() => timeline(place.video, place.scene), [place.video, place.scene]);
  const frame = clamp(place.frame, 0, tl.frames - 1);
  // The frame playback starts from, readable from effects that don't re-run on every frame.
  const latest = useRef(frame);
  latest.current = frame;

  useEffect(() => {
    sound.keep(tl.spans.map((span) => clip(span).url));
  }, [tl, sound]);
  useEffect(() => {
    sound.muted = muted;
  }, [sound, muted]);
  useEffect(() => {
    if (!playing) writePlace({ video: place.video, scene: place.scene, frame });
  }, [place.video, place.scene, frame, playing]);

  // Playback: the sound's clock moves the frame, until the end or a pause.
  useEffect(() => {
    if (!playing) return;
    let live = true;
    let request = 0;
    const from = latest.current >= tl.frames - 1 ? 0 : latest.current;
    sound.start(tl.spans.map(clip), from, tl.fps).then((clock) => {
      const tick = () => {
        if (!live) return;
        const next = Math.min(tl.frames - 1, Math.floor(clock()));
        setPlace((p) => (p.frame === next ? p : { ...p, frame: next }));
        if (next < tl.frames - 1) request = requestAnimationFrame(tick);
        else setPlaying(false);
      };
      tick();
    });
    return () => {
      live = false;
      cancelAnimationFrame(request);
      sound.stop();
    };
  }, [playing, restart, tl, sound]);

  const seek = useCallback(
    (target: number) => {
      const to = clamp(Math.round(target), 0, tl.frames - 1);
      latest.current = to;
      setPlace((p) => ({ ...p, frame: to }));
      setRestart((n) => n + 1); // brings the sound along, if playing
    },
    [tl],
  );
  const select = useCallback((video: string, scene: string | null, frame = 0) => {
    latest.current = frame;
    setPlace({ video, scene, frame });
    setRestart((n) => n + 1);
  }, []);

  // An edited URL is a place to go to. (The studio's own updates replace the hash without this event.)
  useEffect(() => {
    const onHash = () => {
      const next = readPlace();
      if (next) select(next.video, next.scene, next.frame);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [select]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const step = event.shiftKey ? tl.fps : 1;
      const entry = ENTRIES.findIndex((e) => e.video === place.video && e.scene === place.scene);
      const go = (delta: number) => {
        const next = ENTRIES[clamp(entry + delta, 0, ENTRIES.length - 1)];
        select(next.video, next.scene);
      };
      switch (event.key) {
        case " ":
          setPlaying((p) => !p);
          break;
        case "ArrowLeft":
          seek(latest.current - step);
          break;
        case "ArrowRight":
          seek(latest.current + step);
          break;
        case "Home":
          seek(0);
          break;
        case "End":
          seek(tl.frames - 1);
          break;
        case "ArrowUp":
          go(-1);
          break;
        case "ArrowDown":
          go(1);
          break;
        case "m":
        case "M":
          setMuted((m) => !m);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tl, place.video, place.scene, seek, select]);

  const { span, local } = locate(tl, frame);
  useEffect(() => {
    document.title = `${span.title} · Lyceum Studio`;
  }, [span.title]);
  return (
    <div className="studio">
      <Sidebar video={place.video} scene={place.scene} onSelect={select} />
      <main className="main">
        <Viewer width={tl.width} height={tl.height}>
          <Catch at={`${tl.video}/${span.id}, frame ${local}`}>
            <ClockProvider value={{ frame: local, fps: tl.fps, width: tl.width, height: tl.height }}>
              <Stage video={tl.video} id={span.id} />
            </ClockProvider>
          </Catch>
        </Viewer>
        <div className="dock">
          <div className="transport">
            <button className="button play" onMouseDown={keepFocus} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
              <Icon d={playing ? PAUSE : PLAY} />
            </button>
            <button className="button" onMouseDown={keepFocus} onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
              <Icon d={muted ? MUTED : SOUND} />
            </button>
            <div className="now">
              <span className="num mono">{two(span.index + 1)}</span>
              {span.title}
            </div>
            <div className="time mono">
              <b>{timecode(frame, tl.fps)}</b> / {timecode(tl.frames, tl.fps)} · {tl.scene === null ? "scene frame" : "frame"} <b>{local}</b>
            </div>
          </div>
          <Scrubber tl={tl} frame={frame} onSeek={seek} onGrab={() => setPlaying(false)} />
          <Transcript span={span} local={local} fps={tl.fps} onSeek={seek} />
          <div className="keys">
            <kbd>Space</kbd> play · <kbd>← →</kbd> frame · <kbd>⇧ ← →</kbd> second · <kbd>Home End</kbd> ends · <kbd>↑ ↓</kbd> scene · <kbd>M</kbd> mute ·
            hover a word for its frame, click to go there
          </div>
        </div>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
const initial = readPlace();
if (!initial) {
  root.render(<div className="empty">No videos in videos/index.ts yet: narrate a script and run `lyceum scenes` on it.</div>);
} else {
  loadFonts((file) => `/fonts/${file}`)
    .catch((error) => console.error(error))
    .finally(() => root.render(<App initial={initial} />));
}
