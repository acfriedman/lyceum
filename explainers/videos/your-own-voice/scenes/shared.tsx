// The visual vocabulary this video reuses across scenes, so the same idea always looks the same:
// role colours, standard positions, and recurring props. The waveform is the real one: waveform.json is
// written from recordings/_talk.m4a and narration.json by ../waveform.mjs.

import React from "react";
import { C, FONT, prog, useScene, visibility } from "#kit";
import waveform from "./waveform.json";

/** Role colours. Andrew's voice (the take, its waveform) is gold; a synthetic voice blue; a cut, where
 *  the take is split into scenes, teal; a fix (a scene recorded again) green; a problem red. */
export const ROLE = {
  you: C.gold,
  synthetic: C.blue,
  cut: C.teal,
  fix: C.green,
  problem: C.red,
  muted: C.dim,
} as const;

/** The talk: its length in seconds, peaks (0–1, `perSecond` of them a second), and where each scene was
 *  cut from it (`from`–`to`, seconds of the talk), with `retake` naming the take a scene recorded again
 *  on its own is narrated from instead (null for the rest). */
export const TALK = waveform;
export type TalkScene = (typeof TALK.scenes)[number];

/** Where the waveform strip sits when it spans the frame: its left edge, width, centre line and height. */
export const STRIP = { x: 160, w: 1600, y: 560, h: 220 } as const;

/** A scene's own clip, as it plays (cut from its take, cleaned and levelled): its length and peaks, at
 *  the talk's `perSecond`. A scene drawing its own audio uses this, so a retake draws right too. */
export function clipOf(id: string): { duration: number; peaks: number[] } {
  const clip = (TALK.clips as Record<string, { duration: number; peaks: number[] }>)[id];
  if (!clip) throw new Error(`waveform.json has no clip "${id}": re-run waveform.mjs`);
  return clip;
}

/** The average peak between two seconds of some audio. (The loudest would do for a short span, but over
 *  a long one nearly every bar holds a loud moment, and the waveform turns into a wall.) */
function peakBetween(peaks: number[], from: number, to: number): number {
  const a = Math.max(0, Math.floor(from * TALK.perSecond));
  const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil(to * TALK.perSecond)));
  let sum = 0;
  for (let i = a; i < b; i++) sum += peaks[i];
  return sum / Math.max(1, b - a);
}

/** The x of second `t` of the talk, for a waveform showing seconds `from`–`to` in `x`…`x + w`. */
export function talkX(
  t: number,
  { x = STRIP.x, w = STRIP.w, from = 0, to = TALK.duration }: { x?: number; w?: number; from?: number; to?: number } = {},
): number {
  return x + ((t - from) / (to - from)) * w;
}

export type WaveformProps = {
  /** Left edge, width, centre line and full height (a peak of 1 spans it). */
  x?: number;
  w?: number;
  y?: number;
  h?: number;
  /** Draw this scene's own clip instead of the talk; `from`, `to` and `upTo` are then its seconds. */
  scene?: string;
  /** Seconds of the talk (or clip) shown. */
  from?: number;
  to?: number;
  /** Only bars before this second of the talk are drawn: the strip writes on as the talk plays. */
  upTo?: number;
  /** Pixels per bar (bar plus gap). */
  pitch?: number;
  /** A bar's colour and opacity by its second of the talk (to colour or dim stretches). */
  color?: (t: number) => string;
  opacity?: (t: number) => number;
  /** A bar's height multiplier by its second of the talk (to level or exaggerate stretches). */
  gain?: (t: number) => number;
};

/** The real waveform of the talk (or of one scene's clip), as vertical bars about a centre line. Draw it
 *  inside `<Svg>`. */
export const Waveform: React.FC<WaveformProps> = ({
  x = STRIP.x,
  w = STRIP.w,
  y = STRIP.y,
  h = STRIP.h,
  scene,
  from = 0,
  to = scene ? clipOf(scene).duration : TALK.duration,
  upTo = Infinity,
  pitch = 5,
  color = () => ROLE.you,
  opacity = () => 1,
  gain = () => 1,
}) => {
  const peaks = scene ? clipOf(scene).peaks : TALK.peaks;
  const count = Math.floor(w / pitch);
  const step = (to - from) / count;
  const bars = [];
  for (let i = 0; i < count; i++) {
    const t = from + i * step;
    if (t >= upTo) break;
    // Speech sits well below the loudest peak; a gentle curve lifts it so the shape reads.
    const height = Math.max(3, Math.min(1, 1.3 * Math.pow(peakBetween(peaks, t, t + step), 0.7)) * gain(t) * h);
    bars.push(
      <rect key={i} x={x + i * pitch} y={y - height / 2} width={pitch * 0.6} height={height} rx={1.5} fill={color(t)} opacity={opacity(t)} />,
    );
  }
  return <g>{bars}</g>;
};

export type TerminalLine = { text: string; at: number; color?: string };

/** A terminal panel whose lines type on at their frames. `x`/`y` are its top-left. */
export const Terminal: React.FC<{ x: number; y: number; w: number; lines: TerminalLine[]; at?: number; out?: number; size?: number }> = ({
  x,
  y,
  w,
  lines,
  at,
  out,
  size = 26,
}) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const o = (at === undefined ? 1 : prog(frame, at, 0.5, fps)) * visibility(frame, fps, undefined, out);
  const cps = 70;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        opacity: o,
        borderRadius: 12,
        border: `2px solid ${C.faint}`,
        background: C.surface,
        padding: "18px 26px 22px",
        fontFamily: FONT.mono,
        fontSize: size,
        lineHeight: 1.55,
      }}
    >
      <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 13, height: 13, borderRadius: 7, background: C.faint }} />
        ))}
      </div>
      {lines.map((line, i) => {
        if (frame < line.at) return null;
        const shown = Math.floor(((frame - line.at) / fps) * cps);
        return (
          <div key={i} style={{ color: line.color ?? C.text, whiteSpace: "pre-wrap" }}>
            {line.text.slice(0, shown)}
          </div>
        );
      })}
    </div>
  );
};
