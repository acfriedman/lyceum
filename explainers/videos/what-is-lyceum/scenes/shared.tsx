// The visual vocabulary this video reuses across scenes, so the same idea always looks the same:
// role colours, standard positions, and recurring props.

import React from "react";
import { Arrow, C, FONT, Node, Svg, mix, prog, useScene, visibility } from "#kit";

/** Role colours. The running example's three parts are blue, teal and purple. You (the person
 *  reviewing) are gold, the agent green, the script plain text; things that fail are red. */
export const ROLE = {
  request: C.blue,
  cache: C.teal,
  database: C.purple,
  you: C.gold,
  agent: C.green,
  script: C.text,
  wrong: C.red,
  muted: C.dim,
} as const;

/** The running example: request → cache → database, centred on the frame at `DIAGRAM.y`. */
export const DIAGRAM = { y: 440, gap: 420, w: 280, h: 130 } as const;
const PARTS = ["request", "cache", "database"] as const;
export type Part = (typeof PARTS)[number];

/** Fade-in progress times fade-out, for props that take `at` / `out`. */
export function useAppear(at?: number, out?: number, dur = 0.6) {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return 0;
  const p = at === undefined ? 1 : prog(frame, at, dur, fps);
  return p * visibility(frame, fps, undefined, out);
}

/**
 * The running example diagram. Each part appears at its own frame (`ats`); each arrow at its frame
 * in `arrowAts` (request→cache, cache→database). `sketch` draws it as a whiteboard sketch: all one
 * marker colour, dashed. `dot` (0…2) places a travelling dot along the arrows. `wipe` (0…1) erases
 * it from the left, as an eraser would. `x` is the centre part's centre.
 */
export const SystemDiagram: React.FC<{
  x?: number;
  y?: number;
  scale?: number;
  ats?: Partial<Record<Part, number>>;
  arrowAts?: [number?, number?];
  out?: number;
  sketch?: boolean;
  dot?: number;
  wipe?: number;
  opacity?: number;
  /** Per-part opacity, to dim parts. */
  dim?: Partial<Record<Part, number>>;
}> = ({ x = 960, y = DIAGRAM.y, scale = 1, ats = {}, arrowAts = [], out, sketch = false, dot, wipe = 0, opacity = 1, dim = {} }) => {
  const { frame, fps } = useScene();
  const o = opacity * visibility(frame, fps, undefined, out);
  if (o <= 0 || wipe >= 1) return null;
  const cx = (i: number) => x + (i - 1) * DIAGRAM.gap;
  const colour = (part: Part) => (sketch ? C.text : ROLE[part]);
  const ink = sketch ? C.text : C.dim;
  const edge = DIAGRAM.w / 2 + 14;
  const dotPt = dot === undefined ? undefined : (() => {
    const i = Math.min(1, Math.floor(dot));
    const t = dot - i;
    return [mix(cx(i) + edge, cx(i + 1) - edge, Math.min(1, t)), y] as const;
  })();
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: o,
        transform: `scale(${scale})`,
        transformOrigin: `${x}px ${y}px`,
        clipPath: wipe > 0 ? `inset(0 0 0 ${(cx(0) - DIAGRAM.w / 2 - 40 + wipe * (cx(2) - cx(0) + DIAGRAM.w + 80)) / 19.2}%)` : undefined,
      }}
    >
      {PARTS.map((part, i) => (
        <div key={part} style={{ position: "absolute", inset: 0, opacity: dim[part] ?? 1 }}>
          <Node x={cx(i)} y={y} w={DIAGRAM.w} h={DIAGRAM.h} label={part} color={colour(part)} at={ats[part]} dashed={sketch} size={42} />
        </div>
      ))}
      <Svg>
        {[0, 1].map((i) =>
          arrowAts[i] === undefined ? null : (
            <Arrow key={i} from={[cx(i) + edge, y]} to={[cx(i + 1) - edge, y]} at={arrowAts[i]!} color={ink} width={4} dur={0.5} />
          ),
        )}
        {dotPt && <circle cx={dotPt[0]} cy={dotPt[1]} r={12} fill={sketch ? C.text : C.yellow} />}
      </Svg>
    </div>
  );
};

/** The eraser's leading edge for a `wipe` of the diagram at `x`, so a scene can draw the eraser. */
export function wipeEdge(wipe: number, x = 960) {
  const left = x - DIAGRAM.gap - DIAGRAM.w / 2 - 40;
  return left + wipe * (2 * DIAGRAM.gap + DIAGRAM.w + 80);
}

export type ScriptLine = { text: string; kind?: "heading" | "visual" | "narration" | "meta" | "blank" };

/**
 * A script.md page: a panel with a title bar, lines coloured as Markdown reads (headings gold, the
 * visual brief dim italic, narration plain). `lineAts` writes lines on one by one (else all at
 * `at`). `highlight` bands lines from a frame on. `scroll` shifts the text up by that many pixels.
 * `x`/`y` are its top-left.
 */
export const ScriptPage: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  lines: ScriptLine[];
  at?: number;
  out?: number;
  lineAts?: number[];
  size?: number;
  highlight?: { lines: number[]; at: number; out?: number; color?: string }[];
  scroll?: number;
  title?: string;
  opacity?: number;
}> = ({ x, y, w, h, lines, at, out, lineAts, size = 26, highlight = [], scroll = 0, title = "script.md", opacity = 1 }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out) * opacity;
  if (o <= 0) return null;
  const lh = size * 1.6;
  const bar = 54;
  const pad = 28;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity: o,
        borderRadius: 16,
        border: `2px solid ${C.faint}`,
        background: "#16161A",
        overflow: "hidden",
        transform: `translateY(${(1 - Math.min(1, o)) * 16}px)`,
      }}
    >
      <div style={{ height: bar, borderBottom: `2px solid ${C.faint}`, display: "flex", alignItems: "center", padding: "0 22px", gap: 10 }}>
        {[C.red, C.gold, C.green].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: `${c}AA` }} />
        ))}
        <div style={{ marginLeft: 14, fontFamily: FONT.mono, fontSize: 22, color: C.dim }}>{title}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: bar, bottom: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: pad - scroll }}>
          {lines.map((line, i) => {
            const t = lineAts?.[i];
            const p = t === undefined ? 1 : prog(frame, t, 0.5, fps);
            const band = highlight
              .filter((hl) => hl.lines.includes(i))
              .reduce((m, hl) => Math.max(m, frame < hl.at ? 0 : prog(frame, hl.at, 0.4, fps) * visibility(frame, fps, undefined, hl.out)), 0);
            const bandColour = highlight.find((hl) => hl.lines.includes(i) && frame >= hl.at)?.color ?? C.yellow;
            const kind = line.kind ?? "narration";
            const style: React.CSSProperties =
              kind === "heading"
                ? { color: C.gold, fontWeight: 600 }
                : kind === "visual"
                  ? { color: C.dim, fontStyle: "italic" }
                  : kind === "meta"
                    ? { color: C.faint }
                    : { color: C.text };
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  height: lh,
                  padding: `0 ${pad}px`,
                  fontFamily: FONT.mono,
                  fontSize: size,
                  lineHeight: `${lh}px`,
                  whiteSpace: "pre",
                  opacity: p,
                  ...style,
                }}
              >
                <div style={{ position: "absolute", inset: 0, background: bandColour, opacity: 0.16 * band }} />
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: bandColour, opacity: band }} />
                <span style={{ position: "relative" }}>{line.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Frames each word of `sentence` is spoken, in order, starting at or after `from`. */
export function useWordFrames(sentence: string, from = 0) {
  const { cue } = useScene();
  const words = sentence.split(/\s+/).filter(Boolean);
  const frames: number[] = [];
  let after = from;
  for (const word of words) {
    after = cue(word, { after });
    frames.push(after);
  }
  return { words, frames };
}

/**
 * A caption strip: `sentence` centred at `y`, each word faint until spoken, the word being spoken
 * yellow, spoken words plain. `from` is a frame at or before the sentence's first word.
 */
export const WordStrip: React.FC<{ sentence: string; from?: number; y: number; x?: number; size?: number; at?: number; out?: number }> = ({
  sentence,
  from = 0,
  y,
  x = 960,
  size = 34,
  at,
  out,
}) => {
  const { frame, fps } = useScene();
  const { words, frames } = useWordFrames(sentence, from);
  const o = useAppear(at, out);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        opacity: o,
        fontFamily: FONT.serif,
        fontSize: size,
        whiteSpace: "nowrap",
        display: "flex",
        gap: size * 0.28,
      }}
    >
      {words.map((word, i) => {
        const spoken = frame >= frames[i];
        const next = frames[i + 1] ?? frames[i] + Math.round(0.4 * fps);
        const current = spoken && frame < next;
        return (
          <span key={i} style={{ color: current ? C.yellow : spoken ? C.text : C.faint }}>
            {word}
          </span>
        );
      })}
    </div>
  );
};
