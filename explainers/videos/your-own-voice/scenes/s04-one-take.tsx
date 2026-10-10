import React from "react";
import { C, FONT, Svg, mix, prog, track, useScene, visibility } from "#kit";
import { ROLE, STRIP, TALK, Waveform } from "./shared";

// One take, cut into scenes: the whole talk's real waveform writes on, dims while three separately
// recorded clips show their seams (stitched together, in red), then comes back. A cut drops halfway
// through each pause between scenes, the pauses open up (one holds a "next slide" aside, which is
// dropped), everything outside the scenes dims away, the room's faint noise between words fades, and
// the clips level to the same loudness.

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

const NUMBER_Y = 330;

/** The loudest peak between two seconds of the talk (as the waveform draws a bar). */
function peakBetween(from: number, to: number): number {
  const a = Math.max(0, Math.floor(from * TALK.perSecond));
  const b = Math.min(TALK.peaks.length, Math.max(a + 1, Math.ceil(to * TALK.perSecond)));
  let peak = 0;
  for (let i = a; i < b; i++) peak = Math.max(peak, TALK.peaks[i]);
  return peak;
}

/** A repeatable pseudo-random number in 0–1, for the noise's strands. */
function noise(n: number): number {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** The room's noise: in each scene's quiet bars (the pauses between its words), a few faint strands
 *  either side of the centre line, a little taller than the bar so they show around it. */
const QUIET = 0.6;
const STRANDS = 4;
const FUZZ = SEGS.map((s, i) => {
  if (s.kind !== "scene") return [];
  const step = (s.to - s.from) / BARS[i];
  const bars: { bar: number; height: number }[] = [];
  for (let b = 0; b < BARS[i]; b++) {
    const peak = peakBetween(s.from + b * step, s.from + (b + 1) * step);
    if (peak < QUIET) bars.push({ bar: b, height: Math.max(3, Math.pow(peak, 0.6) * STRIP.h) });
  }
  return bars;
});

/** The aside: three clips recorded scene by scene, side by side with seams and mismatched loudness. */
const ASIDE = { x: 560, w: 800, y: STRIP.y, seam: 44, h: 170 } as const;
const ASIDE_W = (ASIDE.w - 2 * ASIDE.seam) / 3;
const ASIDE_CLIPS = [0.7, 1.15, 0.85].map((scale, k) => {
  const scene = SCENES[k % SCENES.length];
  return { x: ASIDE.x + k * (ASIDE_W + ASIDE.seam), scale, from: scene.from + 1, to: scene.from + 7 };
});

export const OneTake: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const record = cue("I record");
  const byScene = cue("scene by scene");
  const stitched = cue("stitched together");
  const lyceum = cue("Lyceum");
  const cuts = cue("cuts the take");
  const pauses = cue("pauses between them");
  const nextSlide = cue("next slide");
  const dropped = cue("dropped");
  const each = cue("Each scene");
  const trimmed = cue("trimmed");
  const room = cue("room noise");
  const cleaned = cue("cleaned out", { end: true });
  const same = cue("same volume");

  const upTo = TALK.duration * prog(frame, record, 2.6, fps);
  // The whole take steps back while the aside plays over it.
  const back = track(frame, fps, [[0, 1], [byScene, 0.1], [lyceum, 1]], 0.5);
  const aside = prog(frame, byScene, 0.5, fps) * visibility(frame, fps, undefined, lyceum);
  const spread = prog(frame, pauses, 0.8, fps);
  const wide = track(frame, fps, [[0, WIDE_W], [dropped + Math.round(0.45 * fps), GAP_W]], 0.7);
  const lay = layout(spread, wide);
  const drop = prog(frame, dropped, 0.45, fps);
  const trim = prog(frame, trimmed, 0.6, fps);
  const fuzz = 0.6 * prog(frame, each, 0.5, fps) * (1 - prog(frame, room, (cleaned - room) / fps, fps));
  const level = prog(frame, same, 1.0, fps);

  const segOpacity = (s: Seg) => {
    if (s.kind === "scene") return back;
    const dim = back * (1 - 0.94 * trim);
    return s.kind === "gap" && s.index === WIDE ? Math.min(dim, 1 - 0.94 * drop) : dim;
  };
  const segGain = (s: Seg) => (s.kind === "scene" ? mix(1, LEVEL[s.index], level) : 1);

  const gapMid = (g: Seg) => xAt((g.from + g.to) / 2, lay);
  const wideGap = GAPS.find((g) => g.index === WIDE)!;

  return (
    <>
      <Svg>
        <line x1={STRIP.x} x2={STRIP.x + STRIP.w} y1={STRIP.y} y2={STRIP.y} stroke={C.faint} strokeWidth={2} opacity={back * (1 - trim)} />

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

        {/* The room's noise, in the pauses between words: it fades as it's cleaned out. */}
        {fuzz > 0 &&
          SEGS.flatMap((s, i) => {
            if (s.kind !== "scene") return [];
            const pitch = lay[i].w / (BARS[i] + 0.5);
            return FUZZ[i].flatMap(({ bar, height }) =>
              Array.from({ length: STRANDS }, (_, k) => {
                const n = i * 1000 + bar * STRANDS + k;
                const h = height + 16 + noise(n) * 40;
                const x = lay[i].x + (bar + (k - 0.5) / STRANDS) * pitch;
                return <line key={n} x1={x} x2={x} y1={STRIP.y - h / 2} y2={STRIP.y + h / 2} stroke={ROLE.muted} strokeWidth={1.5} opacity={fuzz * (0.5 + 0.5 * noise(n + 0.5))} />;
              }),
            );
          })}

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

        {/* A cut drops halfway through each pause. */}
        {GAPS.map((g, j) => {
          const start = cuts + Math.round(j * 0.15 * fps);
          if (frame < start) return null;
          const p = prog(frame, start, 0.45, fps);
          const x = gapMid(g);
          const dy = -(1 - p) * 140;
          return <line key={g.index} x1={x} x2={x} y1={TOP - 30 + dy} y2={BOTTOM + 16 + dy} stroke={ROLE.cut} strokeWidth={4} strokeLinecap="round" opacity={p * (1 - trim)} />;
        })}

        {/* The aside: three clips recorded scene by scene, with seams, stitched together in red. */}
        {aside > 0 && (
          <g opacity={aside}>
            {ASIDE_CLIPS.map((clip, k) => {
              const h = ASIDE.h * clip.scale;
              return (
                <g key={k}>
                  <rect x={clip.x} y={ASIDE.y - h / 2 - 14} width={ASIDE_W} height={h + 28} rx={10} fill={C.surface} stroke={C.faint} strokeWidth={2} />
                  <Waveform x={clip.x + 14} w={ASIDE_W - 28} y={ASIDE.y} h={h} from={clip.from} to={clip.to} />
                </g>
              );
            })}
            {[0, 1].map((k) => {
              const cx = ASIDE.x + (k + 1) * ASIDE_W + (k + 0.5) * ASIDE.seam;
              return [-44, 0, 44].map((dy, m) => {
                const p = prog(frame, stitched + Math.round((k * 3 + m) * 0.08 * fps), 0.3, fps);
                if (p <= 0) return null;
                const half = (ASIDE.seam / 2 + 14) * p;
                return <line key={`${k}-${m}`} x1={cx - half} x2={cx + half} y1={ASIDE.y + dy - 10 * p} y2={ASIDE.y + dy + 10 * p} stroke={ROLE.problem} strokeWidth={4} strokeLinecap="round" />;
              });
            })}
          </g>
        )}
      </Svg>

      {aside > 0 && (
        <div
          style={{
            position: "absolute",
            left: ASIDE.x + ASIDE.w / 2,
            top: 380,
            transform: "translate(-50%, -50%)",
            fontFamily: FONT.serif,
            fontSize: 34,
            color: ROLE.muted,
            whiteSpace: "nowrap",
            opacity: aside,
          }}
        >
          recorded scene by scene
        </div>
      )}

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
        const appear = cuts + Math.round((0.3 + i * 0.12) * fps);
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
          opacity: prog(frame, record, 0.5, fps) * back,
        }}
      >
        recordings/_talk.m4a
      </div>
    </>
  );
};
