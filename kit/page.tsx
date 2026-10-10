// The page Lyceum's renderer opens in headless Chrome (see tools/chrome.mjs): one scene of one video,
// `?video=<slug>&scene=<id>&theme=<name>`, or its title card, drawn at whichever frame the renderer asks
// for. A frame is a pure function of the clock, so `seek` renders synchronously and the next screenshot
// shows exactly that frame.

// Before anything else: scenes read the theme as their modules load.
import "./boot";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ClockProvider, type Clock } from "./clock";
import { loadFonts } from "./fonts";
import { type Caption, Screen, Stage, SoundReminder, Subtitle, TitleCard, lookup } from "./stage";

/** What the renderer tells the page beyond the URL: the title card to draw instead of a scene, and the
 *  captions to burn in (none when they're a subtitle track). */
export type PageOptions = { title?: { text: string; frames: number }; captions: Caption[] };

declare global {
  interface Window {
    lyceum: {
      /** Loads the fonts and sizes the stage; resolves to the clip's rate, size and length. */
      open(options: PageOptions): Promise<{ fps: number; width: number; height: number; frames: number }>;
      /** Draws `frame` (scene-relative) before returning, or throws what the scene threw. */
      seek(frame: number): void;
    };
  }
}

const query = new URLSearchParams(location.search);
const video = query.get("video") ?? "";
const id = query.get("scene") ?? "";

const container = document.getElementById("stage")!;
// A scene that throws (a cue the narration doesn't contain, say) must fail the render, not leave a
// blank frame, so the error is kept and rethrown from `seek`.
let failure: unknown = null;
const root = createRoot(container, { onUncaughtError: (error) => (failure ??= error) });
let clock: Omit<Clock, "frame"> | null = null;
let options: PageOptions = { captions: [] };

window.lyceum = {
  async open(given) {
    options = given;
    const { narration } = lookup(video);
    const scene = narration.scenes.find((s) => s.id === id);
    if (!scene && !options.title) throw new Error(`${video}: no scene "${id}"`);
    const { fps, width, height } = narration;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    await loadFonts((file) => `/fonts/${file}`);
    clock = { fps, width, height };
    return { fps, width, height, frames: options.title?.frames ?? scene!.frames };
  },
  seek(frame) {
    if (!clock) throw new Error("seek() before open()");
    const now = { ...clock, frame };
    flushSync(() =>
      root.render(
        <ClockProvider value={now}>
          {options.title ? (
            <Screen band={<SoundReminder frames={options.title.frames} />}>
              <TitleCard title={options.title.text} frames={options.title.frames} />
            </Screen>
          ) : (
            <Screen band={<Subtitle captions={options.captions} />}>
              <Stage video={video} id={id} />
            </Screen>
          )}
        </ClockProvider>,
      ),
    );
    if (failure) throw failure;
  },
};
