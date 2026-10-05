// Lays a video's scenes out on the narration's timeline: each scene in its own sequence, its clip
// starting after the lead-in, with a fade through black between scenes.

import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
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

const SceneFrame: React.FC<{ scene: Narration["scenes"][number]; index: number; children: React.ReactNode }> = ({ scene, index, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = prog(frame, 0, 0.35, fps);
  const fadeOut = prog(frame, scene.frames - Math.round(0.45 * fps), 0.45, fps);
  const tag = prog(frame, Math.round(0.2 * fps), 0.6, fps) * (1 - fadeOut);
  return (
    <AbsoluteFill style={{ opacity: fadeIn * (1 - fadeOut) }}>
      {children}
      <div style={{ position: "absolute", left: 56, top: 40, fontFamily: FONT.serif, fontSize: 28, color: C.dim, opacity: tag * 0.8, letterSpacing: 0.3 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 21, marginRight: 14 }}>{String(index + 1).padStart(2, "0")}</span>
        {scene.title}
      </div>
    </AbsoluteFill>
  );
};

// Props are serialized by Remotion, so compositions name their video and the components are looked
// up here rather than passed in.
function lookup(video: string) {
  const entry = videos.find((v) => v.narration.video === video);
  if (!entry) throw new Error(`no video "${video}" in videos/index.ts`);
  return entry;
}

export const Video: React.FC<{ video: string }> = ({ video }) => {
  const { narration, scenes } = lookup(video);
  for (const scene of narration.scenes) {
    if (!scenes[scene.id]) throw new Error(`${narration.video}: no component for scene "${scene.id}"`);
  }
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {narration.scenes.map((scene, index) => {
        const Scene = scenes[scene.id];
        return (
          <Sequence key={scene.id} name={scene.id} from={scene.from} durationInFrames={scene.frames}>
            <SceneProvider value={scene}>
              <SceneFrame scene={scene} index={index}>
                <Scene />
              </SceneFrame>
            </SceneProvider>
            <Sequence from={scene.leadInFrames} name={`${scene.id} voice`}>
              <Audio src={staticFile(scene.audio)} />
            </Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** One scene alone, for iterating on it in the studio. */
export const SingleScene: React.FC<{ video: string; id: string }> = ({ video, id }) => {
  const { narration, scenes } = lookup(video);
  const index = narration.scenes.findIndex((s) => s.id === id);
  const scene = narration.scenes[index];
  const Scene = scenes[id];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <SceneProvider value={scene}>
        <SceneFrame scene={scene} index={index}>
          <Scene />
        </SceneFrame>
      </SceneProvider>
      <Sequence from={scene.leadInFrames}>
        <Audio src={staticFile(scene.audio)} />
      </Sequence>
    </AbsoluteFill>
  );
};
