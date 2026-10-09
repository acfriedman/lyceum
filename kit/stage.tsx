// One scene on its stage: the background, the fade in and out, and the scene's number and title, at the
// clock's frame; or the video's title card. The renderer draws a stage per frame (page.tsx), inside a
// screen that keeps a band below it for subtitles.

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

/** A layer covering the whole frame, laid out as a flex column: the box scenes were written against
 *  (Remotion's AbsoluteFill, when Lyceum rendered with Remotion). */
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

/** The stage's size on screen: scenes are laid out at the video's full size and drawn at this scale,
 *  centred at the top, so the band below them is free for subtitles whether or not they're burned in. */
export const STAGE_SCALE = 0.875;

/** A burned-in subtitle: its text, from its first frame up to (not including) its last. */
export type Caption = { from: number; to: number; text: string };

/** The whole frame: the stage drawn smaller at the top, and below it the subtitle band, holding `band`
 *  (a burned-in caption, the title card's reminder, or nothing). */
export const Screen: React.FC<{ band?: React.ReactNode; children: React.ReactNode }> = ({ band, children }) => {
  const { width, height } = useClock();
  const left = (width * (1 - STAGE_SCALE)) / 2;
  const bandTop = height * STAGE_SCALE;
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left, top: 0, width, height, overflow: "hidden", transform: `scale(${STAGE_SCALE})`, transformOrigin: "0 0" }}>
        {children}
      </div>
      <div style={{ position: "absolute", left, top: bandTop, width: width * STAGE_SCALE, height: height - bandTop, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {band}
      </div>
    </Fill>
  );
};

/** The burned-in caption due at the clock's frame, if any. */
export const Subtitle: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const { frame } = useClock();
  const caption = captions.find((c) => frame >= c.from && frame < c.to);
  if (!caption) return null;
  return (
    <div style={{ textAlign: "center", textWrap: "balance", fontFamily: FONT.serif, fontSize: 38, lineHeight: 1.3, color: C.text }}>
      {caption.text}
    </div>
  );
};

/** The title card the video opens on: its title, already showing on the first frame (a player shows
 *  that frame before the video starts), fading out at the end. */
export const TitleCard: React.FC<{ title: string; frames: number }> = ({ title, frames }) => {
  const { frame, fps } = useClock();
  const fadeOut = prog(frame, frames - Math.round(0.5 * fps), 0.5, fps);
  return (
    <Fill style={{ background: C.bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: 1500, textAlign: "center", textWrap: "balance", fontFamily: FONT.serif, fontSize: 96, lineHeight: 1.2, color: C.text, opacity: 1 - fadeOut }}>
        {title}
      </div>
    </Fill>
  );
};

/** Below the title card, in the band: a quiet reminder to turn the sound on, since the video is
 *  narrated. It rises in just after the first frame, so the frame a player shows before starting is the
 *  title alone, and fades with the title. */
export const SoundReminder: React.FC<{ frames: number }> = ({ frames }) => {
  const { frame, fps } = useClock();
  const start = Math.round(0.5 * fps);
  const shown = prog(frame, start, 0.6, fps) * (1 - prog(frame, frames - Math.round(0.5 * fps), 0.5, fps));
  // The speaker's waves come in one after the other once the reminder is up.
  const wave = (n: number) => prog(frame, start + Math.round((0.4 + 0.2 * n) * fps), 0.3, fps);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.dim, fontFamily: FONT.serif, fontSize: 26, opacity: shown * 0.8, transform: `translateY(${(1 - shown) * 10}px)` }}>
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill={C.dim} />
        <path d="M15.5 9a4.2 4.2 0 0 1 0 6" opacity={wave(0)} />
        <path d="M18.5 6.5a8 8 0 0 1 0 11" opacity={wave(1)} />
      </svg>
      Sound on
    </div>
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
