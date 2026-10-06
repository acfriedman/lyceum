// The page Lyceum's renderer opens in headless Chrome (see tools/chrome.mjs): one scene of one video,
// `?video=<slug>&scene=<id>`, drawn at whichever frame the renderer asks for. A frame is a pure function
// of the clock, so `seek` renders synchronously and the next screenshot shows exactly that frame.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ClockProvider, type Clock } from "./clock";
import { loadFonts } from "./fonts";
import { Stage, lookup } from "./stage";

declare global {
  interface Window {
    lyceum: {
      /** Loads the fonts and sizes the stage; resolves to the scene's rate, size and length. */
      open(): Promise<{ fps: number; width: number; height: number; frames: number }>;
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

window.lyceum = {
  async open() {
    const { narration } = lookup(video);
    const scene = narration.scenes.find((s) => s.id === id);
    if (!scene) throw new Error(`${video}: no scene "${id}"`);
    const { fps, width, height } = narration;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    await loadFonts((file) => `/fonts/${file}`);
    clock = { fps, width, height };
    return { fps, width, height, frames: scene.frames };
  },
  seek(frame) {
    if (!clock) throw new Error("seek() before open()");
    const now = { ...clock, frame };
    flushSync(() =>
      root.render(
        <ClockProvider value={now}>
          <Stage video={video} id={id} />
        </ClockProvider>,
      ),
    );
    if (failure) throw failure;
  },
};
