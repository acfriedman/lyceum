import React from "react";
import { C, FONT, Svg, lin, mix, prog, track, useScene, visibility } from "#kit";
import { ROLE, STRIP, TALK, Waveform } from "./shared";

// One take, cut into scenes: the whole talk's real waveform writes on, ticks fall onto it as its words
// are matched, a cut drops halfway through each pause, the pauses open up (one holds a "next slide"
// aside, which is dropped), everything outside the five scenes' words dims away, and the five clips
// level to the same loudness.

const SCENES = TALK.scenes;
const TOP = STRIP.y - STRIP.h / 2;
const BOTTOM = STRIP.y + STRIP.h / 2;

// The talk as segments: the lead-in, each scene, each pause between two scenes, and the tail.
type Seg = { from: number; to: number; kind: "scene" | "gap" | "edge"; index: number };
const SEGS: Seg[] = [{ from: 0, to: SCENES[0].from, kind: "edge", index: -1 }];
SCENES.forEach((s, i) => {
  SEGS.push({ from: s.from, to: s.to, kind: "scene", index: i });
  if (i < SCENES.length - 1) SEGS.push({ from: s.to, to: SCENES[i + 1].from, kind: "gap", index: i });
});
SEGS.push({ from: SCENES[SCENES.length - 1].to, to: TALK.duration, kind: "edge", index: SCENES.length });

const GAPS = SEGS.filter((s) => s.kind === "gap");
/** The pause that holds the "next slide" aside: the widest one. */
const WIDE = GAPS.reduce((best, g) => (g.to - g.from > best.to - best.from ? g : best)).index;
/** How wide a pause is drawn once the pauses open up, and the wide one while it holds the aside. */
const GAP_W = 56;
const WIDE_W = 230;
const PITCH = 5;
const K0 = STRIP.w / TALK.duration;
/** Bars per non-pause segment, fixed at the true scale so its bars squeeze rather than resample. */
const BARS = SEGS.map((s) => Math.max(1, Math.floor(((s.to - s.from) * K0) / PITCH)));

/** Each segment's left edge and width: true time at `spread` 0, the pauses opened up at 1. */
function layout(spread: number, wide: number) {
  const targets = GAPS.map((g) => (g.index === WIDE ? wide : GAP_W));
  const gapTime = GAPS.reduce((sum, g) => sum + g.to - g.from, 0);
  const k1 = (STRIP.w - targets.reduce((a, b) => a + b, 0)) / (TALK.duration - gapTime);
  let x = STRIP.x;
  return SEGS.map((s) => {
    const d = s.to - s.from;
    const w = s.kind === "gap" ? mix(d * K0, targets[s.index], spread) : d * mix(K0, k1, spread);
    const box = { x, w };
    x += w;
    return box;
  });
}

type Layout = ReturnType<typeof layout>;

/** The x of second `t` of the talk in a layout. */
function xAt(t: number, lay: Layout): number {
  for (let i = SEGS.length - 1; i >= 0; i--) {
    const s = SEGS[i];
    if (t >= s.from) return lay[i].x + (Math.min(t, s.to) - s.from) / (s.to - s.from) * lay[i].w;
  }
  return STRIP.x;
}

// Each scene's average peak, and the gain that brings it to the average of all five: the loudness
// levelling, drawn.
const SCENE_SEG = SEGS.map((s, i) => i).filter((i) => SEGS[i].kind === "scene");
const MEAN = SCENES.map((s) => {
  const a = Math.floor(s.from * TALK.perSecond);
  const b = Math.ceil(s.to * TALK.perSecond);
  let sum = 0;
  for (let i = a; i < b; i++) sum += TALK.peaks[i];
  return sum / (b - a);
});
const TARGET = MEAN.reduce((a, b) => a + b, 0) / MEAN.length;
const LEVEL = MEAN.map((m) => TARGET / m);

const TICKS_PER_SCENE = 5;
const TICK_LEN = 40;
const TICK_REST = TOP - 4;
const NUMBER_Y = 330;

export const OneTake: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const record = cue("record");
  const listens = cue("listens");
  const matches = cue("matches every word");
  const cuts = cue("cuts the take");
  const pauses = cue("pauses between them");
  const anything = cue("Anything");
  const nextSlide = cue("next slide");
  const dropped = cue("dropped");
  const trimmed = cue("trimmed");
  const same = cue("same volume");

  const upTo = TALK.duration * prog(frame, record, 1.5, fps);
  const spread = prog(frame, pauses, 0.8, fps);
  const wide = track(frame, fps, [[0, WIDE_W], [dropped + Math.round(0.45 * fps), GAP_W]], 0.7);
  const lay = layout(spread, wide);
  const drop = prog(frame, dropped, 0.45, fps);
  const trim = prog(frame, trimmed, 0.6, fps);
  const level = prog(frame, same, 1.0, fps);

  const segOpacity = (s: Seg) => {
    if (s.kind === "scene") return 1;
    const dim = 1 - 0.94 * trim;
    return s.kind === "gap" && s.index === WIDE ? Math.min(dim, 1 - 0.94 * drop) : dim;
  };
  const segGain = (s: Seg) => (s.kind === "scene" ? mix(1, LEVEL[s.index], level) : 1);

  // The playhead that listens through the take.
  const listen = lin(frame, listens, 1.6, fps);

  // Ticks: a handful of matched words per scene, falling left to right.
  const stagger = 0.07 * fps;
  const ticksOut = 1 - prog(frame, anything, 0.45, fps);
  const tickAt = (n: number) => matches + Math.round(n * stagger);
  const landed = (i: number) => tickAt(i * TICKS_PER_SCENE + TICKS_PER_SCENE - 1) + Math.round(0.35 * fps);

  const gapMid = (g: Seg) => xAt((g.from + g.to) / 2, lay);
  const wideGap = GAPS.find((g) => g.index === WIDE)!;

  return (
    <>
      <Svg>
        <line x1={STRIP.x} x2={STRIP.x + STRIP.w} y1={STRIP.y} y2={STRIP.y} stroke={C.faint} strokeWidth={2} opacity={1 - trim} />

        {/* The pauses glow, once they're named. */}
        {GAPS.map((g) => {
          const i = SEGS.indexOf(g);
          const o = 0.16 * prog(frame, pauses, 0.5, fps) * (1 - trim) * (g.index === WIDE ? 1 - drop : 1);
          if (o <= 0) return null;
          return <rect key={g.index} x={lay[i].x} y={TOP - 10} width={lay[i].w} height={STRIP.h + 20} rx={8} fill={ROLE.cut} opacity={o} />;
        })}

        {/* The five clips, once trimmed. */}
        {SCENE_SEG.map((i) =>
          trim > 0 ? (
            <rect key={i} x={lay[i].x - 8} y={TOP - 12} width={lay[i].w + 16} height={STRIP.h + 24} rx={10} fill={`${C.text}06`} stroke={C.faint} strokeWidth={2} opacity={trim} />
          ) : null,
        )}

        {SEGS.map((s, i) => {
          const count = s.kind === "gap" ? Math.floor(lay[i].w / PITCH) : BARS[i];
          if (count < 1 || lay[i].w < 1) return null;
          return (
            <Waveform
              key={i}
              x={lay[i].x}
              w={lay[i].w}
              from={s.from}
              to={s.to}
              upTo={upTo}
              pitch={s.kind === "gap" ? PITCH : lay[i].w / (count + 0.5)}
              opacity={() => segOpacity(s)}
              gain={() => segGain(s)}
            />
          );
        })}

        {listen > 0 && listen < 1 && (
          <line
            x1={STRIP.x + STRIP.w * listen}
            x2={STRIP.x + STRIP.w * listen}
            y1={TOP - 20}
            y2={BOTTOM + 20}
            stroke={C.text}
            strokeWidth={3}
            opacity={0.7 * Math.sin(Math.PI * listen)}
          />
        )}

        {/* Matched words: ticks fall onto the waveform. */}
        {ticksOut > 0 &&
          SCENES.flatMap((s, i) =>
            Array.from({ length: TICKS_PER_SCENE }, (_, k) => {
              const n = i * TICKS_PER_SCENE + k;
              const start = tickAt(n);
              if (frame < start) return null;
              const fall = prog(frame, start, 0.35, fps);
              const px = xAt(s.from + ((k + 0.5) / TICKS_PER_SCENE) * (s.to - s.from), lay);
              const bottom = mix(TICK_REST - 220, TICK_REST, fall);
              return (
                <line key={n} x1={px} x2={px} y1={bottom - TICK_LEN} y2={bottom} stroke={C.text} strokeWidth={3} strokeLinecap="round" opacity={0.5 * Math.min(1, fall * 2) * ticksOut} />
              );
            }),
          )}

        {/* A cut drops halfway through each pause. */}
        {GAPS.map((g, j) => {
          const start = cuts + Math.round(j * 0.15 * fps);
          if (frame < start) return null;
          const p = prog(frame, start, 0.45, fps);
          const x = gapMid(g);
          const dy = -(1 - p) * 140;
          return <line key={g.index} x1={x} x2={x} y1={TOP - 30 + dy} y2={BOTTOM + 16 + dy} stroke={ROLE.cut} strokeWidth={4} strokeLinecap="round" opacity={p * (1 - trim)} />;
        })}

      </Svg>

      {frame >= nextSlide && drop < 1 && (
        <div
          style={{
            position: "absolute",
            left: gapMid(wideGap),
            top: STRIP.y,
            transform: "translate(-50%, -50%)",
            padding: "12px 20px",
            border: `2px dashed ${ROLE.muted}`,
            borderRadius: 10,
            background: C.bg,
            fontFamily: FONT.mono,
            fontSize: 26,
            color: ROLE.muted,
            whiteSpace: "nowrap",
            opacity: visibility(frame, fps, nextSlide, dropped),
          }}
        >
          next slide
        </div>
      )}

      {SCENES.map((s, i) => {
        const appear = landed(i);
        if (frame < appear) return null;
        return (
          <div
            key={s.id}
            style={{
              position: "absolute",
              left: xAt((s.from + s.to) / 2, lay),
              top: NUMBER_Y,
              transform: `translate(-50%, -50%) translateY(${(1 - prog(frame, appear, 0.4, fps)) * 12}px)`,
              fontFamily: FONT.mono,
              fontSize: 30,
              color: C.text,
              opacity: prog(frame, appear, 0.4, fps),
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: STRIP.x,
          top: BOTTOM + 40,
          fontFamily: FONT.mono,
          fontSize: 26,
          color: ROLE.muted,
          opacity: prog(frame, record, 0.5, fps),
        }}
      >
        recordings/_talk.m4a
      </div>
    </>
  );
};
