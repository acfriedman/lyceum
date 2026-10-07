// One scene on its stage: the background, the fade in and out, and the scene's number and title, at the
// clock's frame. Lyceum's renderer draws a stage per frame (page.tsx); the Remotion compositions in
// Video.tsx lay stages on the narration's timeline.

import React from "react";
import { useClock } from "./clock";
import { SceneProvider, type SceneTiming } from "./cue";
import { prog } from "./anim";
import { C, FONT } from "./theme";
import { videos } from "@lyceum/videos";

export type Narration = {
  video: string;
  fps: number;
  width: number;
  height: number;
  frames: number;
  scenes: (SceneTiming & { audio: string; from: number })[];
};

export type SceneMap = Record<string, React.FC>;

/** A layer covering the whole frame: the box Remotion's AbsoluteFill draws, so scenes lay out the same
 *  under either renderer. */
export const Fill: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", ...style }}>
    {children}
  </div>
);

const SceneFrame: React.FC<{ scene: Narration["scenes"][number]; index: number; children: React.ReactNode }> = ({ scene, index, children }) => {
  const { frame, fps } = useClock();
  const fadeIn = prog(frame, 0, 0.35, fps);
  const fadeOut = prog(frame, scene.frames - Math.round(0.45 * fps), 0.45, fps);
  const tag = prog(frame, Math.round(0.2 * fps), 0.6, fps) * (1 - fadeOut);
  return (
    <Fill style={{ opacity: fadeIn * (1 - fadeOut) }}>
      {children}
      <div style={{ position: "absolute", left: 56, top: 40, fontFamily: FONT.serif, fontSize: 28, color: C.dim, opacity: tag * 0.8, letterSpacing: 0.3 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 21, marginRight: 14 }}>{String(index + 1).padStart(2, "0")}</span>
        {scene.title}
      </div>
    </Fill>
  );
};

/** A video's narration and scene components, from the project's registry. */
export function lookup(video: string) {
  const entry = videos.find((v) => v.narration.video === video);
  if (!entry) throw new Error(`no video "${video}" in videos/index.ts`);
  for (const scene of entry.narration.scenes) {
    if (!entry.scenes[scene.id]) throw new Error(`${video}: no component for scene "${scene.id}"`);
  }
  return entry;
}

/** One scene of a video, drawn at the clock's (scene-relative) frame. */
export const Stage: React.FC<{ video: string; id: string }> = ({ video, id }) => {
  const { narration, scenes } = lookup(video);
  const index = narration.scenes.findIndex((s) => s.id === id);
  if (index < 0) throw new Error(`${video}: no scene "${id}"`);
  const Scene = scenes[id];
  return (
    <Fill style={{ background: C.bg }}>
      <SceneProvider value={narration.scenes[index]}>
        <SceneFrame scene={narration.scenes[index]} index={index}>
          <Scene />
        </SceneFrame>
      </SceneProvider>
    </Fill>
  );
};
