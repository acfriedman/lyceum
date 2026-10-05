// The building blocks scenes are drawn from. Positions are in the 1920×1080 frame; times are
// scene-relative frames (usually from `cue`), durations are seconds.

import React from "react";
import { useScene } from "./cue";
import { lin, mix, prog, visibility } from "./anim";
import { C, FONT, MONO_ADVANCE } from "./theme";
import { tokenize } from "./swift";

type Anchor = "center" | "left" | "right" | "top-left";

function anchorTransform(anchor: Anchor): string {
  switch (anchor) {
    case "center":
      return "translate(-50%, -50%)";
    case "left":
      return "translate(0, -50%)";
    case "right":
      return "translate(-100%, -50%)";
    case "top-left":
      return "none";
  }
}

// MARK: - Text

export type TextProps = {
  children: string;
  x: number;
  y: number;
  size?: number;
  color?: string;
  font?: "serif" | "mono";
  weight?: number;
  italic?: boolean;
  anchor?: Anchor;
  /** When it starts appearing. Omit to show from the start. */
  at?: number;
  /** When it fades out. */
  out?: number;
  /** Seconds the write-on takes. */
  dur?: number;
  /** `write` reveals left to right, as manim's Write; `fade` fades the whole line in. */
  reveal?: "write" | "fade";
  maxWidth?: number;
  align?: "left" | "center" | "right";
  style?: React.CSSProperties;
};

export const Text: React.FC<TextProps> = ({
  children,
  x,
  y,
  size = 44,
  color = C.text,
  font = "serif",
  weight = 400,
  italic = false,
  anchor = "center",
  at,
  out,
  dur = 1,
  reveal = "write",
  maxWidth,
  align = "center",
  style,
}) => {
  const { frame, fps } = useScene();
  const opacity = visibility(frame, fps, undefined, out);
  if (at !== undefined && frame < at) return null;
  const p = at === undefined ? 1 : lin(frame, at, dur, fps);
  const chars = Array.from(children);
  const soft = 8;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: anchorTransform(anchor),
        fontFamily: FONT[font],
        fontSize: size,
        fontWeight: weight,
        fontStyle: italic ? "italic" : "normal",
        color,
        opacity,
        whiteSpace: maxWidth ? "normal" : "pre",
        width: maxWidth,
        textAlign: align,
        lineHeight: 1.3,
        ...style,
      }}
    >
      {reveal === "fade"
        ? <span style={{ opacity: prog(frame, at ?? -1e9, dur, fps) }}>{children}</span>
        : chars.map((ch, i) => {
            const local = Math.min(1, Math.max(0, (p * (chars.length + soft) - i) / soft));
            return (
              <span key={i} style={{ opacity: local, display: "inline", filter: local < 1 ? `blur(${(1 - local) * 3}px)` : undefined }}>
                {ch}
              </span>
            );
          })}
    </div>
  );
};

// MARK: - Fade (any content)

export type FadeProps = {
  children: React.ReactNode;
  x?: number;
  y?: number;
  anchor?: Anchor;
  at?: number;
  out?: number;
  dur?: number;
  /** Pixels it rises from as it appears (manim's `shift=UP`). */
  rise?: number;
  scale?: number;
  style?: React.CSSProperties;
};

export const Fade: React.FC<FadeProps> = ({ children, x = 0, y = 0, anchor = "top-left", at, out, dur = 0.6, rise = 24, scale = 1, style }) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const p = at === undefined ? 1 : prog(frame, at, dur, fps);
  const opacity = p * visibility(frame, fps, undefined, out, dur);
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `${anchorTransform(anchor) === "none" ? "" : anchorTransform(anchor)} translateY(${(1 - p) * rise}px) scale(${scale})`,
        opacity,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// MARK: - Code

export type CodeHighlight = {
  line: number;
  /** First column (0-based); omit for the whole line. */
  from?: number;
  /** Column after the last; omit for the end of the line. */
  to?: number;
  at: number;
  out?: number;
  color?: string;
};

export type CodeProps = {
  code: string;
  x: number;
  y: number;
  size?: number;
  at?: number;
  out?: number;
  /** Characters typed per second; `Infinity` fades the block in at once. */
  cps?: number;
  highlights?: CodeHighlight[];
  /** Lines (0-based) dimmed from a frame on. */
  dim?: { lines: number[]; at: number; out?: number }[];
  /** Lines struck through from a frame on. */
  strike?: { lines: number[]; at: number }[];
};

export const LINE_HEIGHT = 1.55;

/** Where a column/line of a `Code` block sits, for placing arrows and labels against it. */
export function codePoint(x: number, y: number, size: number, line: number, column: number) {
  return { x: x + column * size * MONO_ADVANCE, y: y + (line + 0.5) * size * LINE_HEIGHT };
}

export const Code: React.FC<CodeProps> = ({ code, x, y, size = 30, at, out, cps = 90, highlights = [], dim = [], strike = [] }) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const lines = code.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n");
  const typed = at === undefined || !isFinite(cps) ? Infinity : ((frame - at) / fps) * cps;
  const fadeIn = at !== undefined && !isFinite(cps) ? prog(frame, at, 0.6, fps) : 1;
  const opacity = fadeIn * visibility(frame, fps, undefined, out);
  const lh = size * LINE_HEIGHT;
  const adv = size * MONO_ADVANCE;

  let budget = typed;
  return (
    <div style={{ position: "absolute", left: x, top: y, fontFamily: FONT.mono, fontSize: size, lineHeight: `${lh}px`, opacity, whiteSpace: "pre" }}>
      {highlights.map((h, i) => {
        if (frame < h.at) return null;
        const p = prog(frame, h.at, 0.4, fps) * visibility(frame, fps, undefined, h.out, 0.4);
        const from = h.from ?? 0;
        const to = h.to ?? lines[h.line].length;
        const color = h.color ?? C.yellow;
        return (
          <div
            key={`h${i}`}
            style={{
              position: "absolute",
              left: from * adv - 8,
              top: h.line * lh,
              width: (to - from) * adv + 16,
              height: lh,
              border: `2.5px solid ${color}`,
              background: `${color}22`,
              borderRadius: 6,
              opacity: p,
              transform: `scale(${mix(1.08, 1, p)})`,
            }}
          />
        );
      })}
      {lines.map((line, li) => {
        const dimmed = dim.some((d) => d.lines.includes(li) && frame >= d.at && (d.out === undefined || frame < d.out));
        const dimP = dim
          .filter((d) => d.lines.includes(li))
          .reduce((acc, d) => Math.max(acc, prog(frame, d.at, 0.4, fps) * (1 - (d.out === undefined ? 0 : prog(frame, d.out, 0.4, fps)))), 0);
        const struck = strike.find((s) => s.lines.includes(li) && frame >= s.at);
        const strikeP = struck ? prog(frame, struck.at, 0.5, fps) : 0;
        const tokens = tokenize(line);
        const visible = budget;
        budget -= line.length + 1;
        let remaining = visible;
        return (
          <div key={li} style={{ position: "relative", height: lh, opacity: dimmed || dimP > 0 ? mix(1, 0.28, dimP) : 1 }}>
            {tokens.map((t, ti) => {
              if (remaining <= 0) return null;
              const shown = t.text.slice(0, Math.max(0, Math.floor(remaining)));
              remaining -= t.text.length;
              return (
                <span key={ti} style={{ color: t.color }}>
                  {shown}
                </span>
              );
            })}
            {struck && (
              <div style={{ position: "absolute", left: -6, top: lh / 2, height: 3, width: `calc(${strikeP * 100}% + 12px)`, maxWidth: line.length * adv + 12, background: C.red }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

// MARK: - SVG layer and shapes

/** A full-frame SVG layer for shapes; children use frame coordinates. */
export const Svg: React.FC<{ children: React.ReactNode; opacity?: number }> = ({ children, opacity = 1 }) => (
  <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity }}>
    {children}
  </svg>
);

type Pt = [number, number];

function controlPoint(from: Pt, to: Pt, bend: number): Pt {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  return [mx - (dy / len) * bend, my + (dx / len) * bend];
}

/** A point `t` of the way along the (possibly bent) path from `from` to `to`. */
export function along(from: Pt, to: Pt, bend: number, t: number): Pt {
  const c = controlPoint(from, to, bend);
  const u = 1 - t;
  return [u * u * from[0] + 2 * u * t * c[0] + t * t * to[0], u * u * from[1] + 2 * u * t * c[1] + t * t * to[1]];
}

export type ArrowProps = {
  from: Pt;
  to: Pt;
  /** Pixels the midpoint bows out, perpendicular to the line; sign picks the side. */
  bend?: number;
  at: number;
  out?: number;
  dur?: number;
  color?: string;
  width?: number;
  head?: boolean;
  dashed?: boolean;
  opacity?: number;
};

export const Arrow: React.FC<ArrowProps> = ({ from, to, bend = 0, at, out, dur = 0.8, color = C.text, width = 4, head = true, dashed = false, opacity = 1 }) => {
  const { frame, fps } = useScene();
  if (frame < at) return null;
  const p = prog(frame, at, dur, fps);
  const o = opacity * visibility(frame, fps, undefined, out);
  const c = controlPoint(from, to, bend);
  const d = `M ${from[0]} ${from[1]} Q ${c[0]} ${c[1]} ${to[0]} ${to[1]}`;
  const tip = along(from, to, bend, p);
  const back = along(from, to, bend, Math.max(0, p - 0.02));
  const angle = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
  const hl = 18;
  return (
    <g opacity={o}>
      {dashed ? (
        <>
          <mask id={`m-${from.join("-")}-${to.join("-")}-${at}`} maskUnits="userSpaceOnUse" x={-1920} y={-1080} width={5760} height={3240}>
            <path d={d} stroke="white" strokeWidth={width + 4} fill="none" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
          </mask>
          <path d={d} stroke={color} strokeWidth={width} fill="none" strokeDasharray="14 12" strokeLinecap="round" mask={`url(#m-${from.join("-")}-${to.join("-")}-${at})`} />
        </>
      ) : (
        <path d={d} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
      )}
      {head && p > 0.05 && (
        <polygon
          points={`0,0 ${-hl},${-hl * 0.5} ${-hl * 0.75},0 ${-hl},${hl * 0.5}`}
          fill={color}
          transform={`translate(${tip[0]} ${tip[1]}) rotate(${(angle * 180) / Math.PI})`}
        />
      )}
    </g>
  );
};

export type BoxProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  at?: number;
  out?: number;
  dur?: number;
  color?: string;
  fill?: string;
  r?: number;
  width?: number;
  dashed?: boolean;
  opacity?: number;
};

/** A rectangle whose outline draws on, then fills. `x`/`y` are its centre. */
export const Box: React.FC<BoxProps> = ({ x, y, w, h, at, out, dur = 0.9, color = C.text, fill, r = 14, width = 3, dashed = false, opacity = 1 }) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const p = at === undefined ? 1 : prog(frame, at, dur, fps);
  const fillP = at === undefined ? 1 : prog(frame, at + dur * fps * 0.6, 0.5, fps);
  const o = opacity * visibility(frame, fps, undefined, out);
  return (
    <g opacity={o}>
      {fill && <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={r} fill={fill} opacity={fillP} />}
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={r}
        fill="none"
        stroke={color}
        strokeWidth={width}
        pathLength={1}
        strokeDasharray={dashed ? undefined : "1 1"}
        strokeDashoffset={dashed ? undefined : 1 - p}
        style={dashed ? { strokeDasharray: "10 9", opacity: p } : undefined}
      />
    </g>
  );
};

/** A straight rule that draws on. */
export const Line: React.FC<{ from: Pt; to: Pt; at?: number; out?: number; dur?: number; color?: string; width?: number; dashed?: boolean; opacity?: number }> = ({
  from,
  to,
  at,
  out,
  dur = 0.7,
  color = C.dim,
  width = 3,
  dashed = false,
  opacity = 1,
}) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const p = at === undefined ? 1 : prog(frame, at, dur, fps);
  const o = opacity * visibility(frame, fps, undefined, out);
  const x2 = mix(from[0], to[0], p);
  const y2 = mix(from[1], to[1], p);
  return <line x1={from[0]} y1={from[1]} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? "10 10" : undefined} opacity={o} />;
};

// MARK: - Cards and tapes (HTML)

export type CardProps = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
  title: string;
  tags?: string[];
  opacity?: number;
  /** Extra emphasis: a glow while this card is the one running. */
  active?: number;
  rotate?: number;
  scale?: number;
};

/** A unit of held work: a small card with a label and tags. `x`/`y` are its centre. */
export const Card: React.FC<CardProps> = ({ x, y, w = 300, h = 96, color = C.blue, title, tags = [], opacity = 1, active = 0, rotate = 0, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x - w / 2,
      top: y - h / 2,
      width: w,
      height: h,
      borderRadius: 12,
      border: `2.5px solid ${color}`,
      background: `linear-gradient(180deg, ${color}26, ${color}12)`,
      boxShadow: active > 0 ? `0 0 ${40 * active}px ${color}${Math.round(active * 160).toString(16).padStart(2, "0")}` : "none",
      opacity,
      transform: `rotate(${rotate}deg) scale(${scale})`,
      padding: "12px 16px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 8,
    }}
  >
    <div style={{ fontFamily: FONT.mono, fontSize: 24, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
    {tags.length > 0 && (
      <div style={{ display: "flex", gap: 8 }}>
        {tags.map((t) => (
          <span key={t} style={{ fontFamily: FONT.mono, fontSize: 15, color, border: `1.5px solid ${color}88`, borderRadius: 999, padding: "1px 9px" }}>
            {t}
          </span>
        ))}
      </div>
    )}
  </div>
);

export type TapeRow = { text: string; at: number; color?: string; out?: number; strong?: boolean; indent?: number };

/** A trace tape: event rows that print one by one. `x`/`y` are its top-left. */
export const Tape: React.FC<{ x: number; y: number; w: number; rows: TapeRow[]; at?: number; out?: number; title?: string; size?: number; color?: string }> = ({
  x,
  y,
  w,
  rows,
  at,
  out,
  title = "trace",
  size = 26,
  color = C.dim,
}) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const o = (at === undefined ? 1 : prog(frame, at, 0.5, fps)) * visibility(frame, fps, undefined, out);
  const rowH = size * 1.7;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, opacity: o }}>
      <div style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 26, color, marginBottom: 10 }}>{title}</div>
      <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 18, minHeight: rowH }}>
        {rows.map((row, i) => {
          if (frame < row.at) return null;
          const p = prog(frame, row.at, 0.35, fps);
          const ro = p * visibility(frame, fps, undefined, row.out, 0.35);
          return (
            <div
              key={i}
              style={{
                fontFamily: FONT.mono,
                fontSize: size,
                height: rowH,
                lineHeight: `${rowH}px`,
                color: row.color ?? C.text,
                fontWeight: row.strong ? 600 : 400,
                opacity: ro,
                transform: `translateX(${(1 - p) * -16}px)`,
                paddingLeft: (row.indent ?? 0) * size * 1.2,
                whiteSpace: "pre",
              }}
            >
              {row.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** A small label pill. */
export const Pill: React.FC<{ x: number; y: number; text: string; color?: string; at?: number; out?: number; size?: number; anchor?: Anchor }> = ({
  x,
  y,
  text,
  color = C.yellow,
  at,
  out,
  size = 24,
  anchor = "center",
}) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const p = at === undefined ? 1 : prog(frame, at, 0.45, fps);
  const o = p * visibility(frame, fps, undefined, out);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `${anchorTransform(anchor)} scale(${mix(0.85, 1, p)})`,
        fontFamily: FONT.mono,
        fontSize: size,
        color,
        border: `2px solid ${color}`,
        background: `${color}1A`,
        borderRadius: 999,
        padding: "4px 16px",
        whiteSpace: "nowrap",
        opacity: o,
      }}
    >
      {text}
    </div>
  );
};

// MARK: - Node (a labelled box)

export type NodeProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  color?: string;
  at?: number;
  out?: number;
  size?: number;
  mono?: boolean;
  opacity?: number;
  dashed?: boolean;
};

/** A box that draws on, with a label (and optional sub-label) that writes in. `x`/`y` are its centre. */
export const Node: React.FC<NodeProps> = ({ x, y, w, h, label, sub, color = C.blue, at, out, size = 38, mono = false, opacity = 1, dashed }) => {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return null;
  const textAt = at === undefined ? undefined : at + Math.round(0.35 * fps);
  const o = opacity * visibility(frame, fps, undefined, out);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <Svg>
        <Box x={x} y={y} w={w} h={h} at={at} color={color} fill={`${color}14`} dashed={dashed} />
      </Svg>
      <Text x={x} y={sub ? y - size * 0.32 : y} size={size} at={textAt} dur={0.6} font={mono ? "mono" : "serif"}>
        {label}
      </Text>
      {sub && (
        <Text x={x} y={y + size * 0.62} size={size * 0.58} color={C.dim} at={textAt} dur={0.6} font="mono">
          {sub}
        </Text>
      )}
    </div>
  );
};
