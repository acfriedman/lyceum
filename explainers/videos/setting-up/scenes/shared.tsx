// The visual vocabulary this video reuses across scenes, so the same idea always looks the same:
// role colours, standard positions, and recurring props.

import React from "react";
import { C, FONT, prog, useScene, visibility } from "#kit";

/** Role colours. Your app's code is blue, the Lyceum project (explainers/) teal, you gold, a
 *  teammate purple, the coding agent green, commands yellow. Ignored or excluded things are dim;
 *  conflicts and failures red. */
export const ROLE = {
  app: C.blue,
  lyceum: C.teal,
  you: C.gold,
  teammate: C.purple,
  agent: C.green,
  command: C.yellow,
  ignored: C.dim,
  wrong: C.red,
} as const;

/** Where the running repository tree sits: its top-left, and its text size. */
export const TREE = { x: 200, y: 300, size: 40 } as const;

/** Fade-in progress times fade-out, for props that take `at` / `out`. */
export function useAppear(at?: number, out?: number, dur = 0.6) {
  const { frame, fps } = useScene();
  if (at !== undefined && frame < at) return 0;
  const p = at === undefined ? 1 : prog(frame, at, dur, fps);
  return p * visibility(frame, fps, undefined, out);
}

export type TreeEntry = {
  /** The file or folder name; folders end in "/". */
  name: string;
  /** Nesting level: 0 is the root, 1 its children. */
  depth: number;
  color?: string;
  /** When the row appears (omit to show with the tree). */
  at?: number;
  out?: number;
  /** A small label after the name, from `tagAt` (or the row's `at`). */
  tag?: string;
  tagAt?: number;
  tagOut?: number;
  tagColor?: string;
  /** A highlight band behind the row. */
  highlight?: { at: number; out?: number; color?: string };
  /** Opacity multiplier, for dimmed rows. */
  dim?: number;
};

/** Row height of a `FileTree` with text `size`. */
export const treeRow = (size: number = TREE.size) => size * 1.7;
/** The vertical centre of row `i` of a tree at `y`. */
export const treeRowY = (i: number, y: number = TREE.y, size: number = TREE.size) => y + i * treeRow(size) + treeRow(size) / 2;
/** Where row `i`'s name starts. */
export const treeRowX = (depth: number, x: number = TREE.x, size: number = TREE.size) => x + depth * size * 1.4;

/**
 * A repository tree: one row per file or folder, indented by depth, with a faint guide line under
 * each folder's children. Folders are bold. `x`/`y` are its top-left. Rows keep their slots whether
 * or not they've appeared, so a row arriving later doesn't push others around.
 */
export const FileTree: React.FC<{
  entries: TreeEntry[];
  x?: number;
  y?: number;
  size?: number;
  at?: number;
  out?: number;
  opacity?: number;
}> = ({ entries, x = TREE.x, y = TREE.y, size = TREE.size, at, out, opacity = 1 }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out) * opacity;
  if (o <= 0) return null;
  const rh = treeRow(size);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      {entries.map((e, i) => {
        const ro = (e.at === undefined ? 1 : frame < e.at ? 0 : prog(frame, e.at, 0.5, fps)) * visibility(frame, fps, undefined, e.out) * (e.dim ?? 1);
        if (ro <= 0) return null;
        const left = treeRowX(e.depth, x, size);
        const top = y + i * rh;
        const folder = e.name.endsWith("/");
        const colour = e.color ?? (e.depth === 0 ? C.text : folder ? C.text : C.dim);
        const hl = e.highlight;
        const band = hl && frame >= hl.at ? prog(frame, hl.at, 0.4, fps) * visibility(frame, fps, undefined, hl.out) : 0;
        const tagAt = e.tagAt ?? e.at;
        const tagO = e.tag ? (tagAt === undefined ? 1 : frame < tagAt ? 0 : prog(frame, tagAt, 0.45, fps)) * visibility(frame, fps, undefined, e.tagOut) : 0;
        return (
          <div key={i} style={{ position: "absolute", left: 0, top, height: rh, width: 1920, opacity: ro }}>
            {band > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: left - 18,
                  top: rh * 0.08,
                  height: rh * 0.84,
                  width: e.name.length * size * 0.6 + 36,
                  borderRadius: 8,
                  background: hl!.color ?? C.yellow,
                  opacity: 0.18 * band,
                }}
              />
            )}
            {e.depth > 0 && (
              <div style={{ position: "absolute", left: left - size * 1.0, top: 0, height: rh, width: 2, background: C.faint }} />
            )}
            {e.depth > 0 && (
              <div style={{ position: "absolute", left: left - size * 1.0, top: rh / 2, width: size * 0.7, height: 2, background: C.faint }} />
            )}
            <div
              style={{
                position: "absolute",
                left,
                top: 0,
                height: rh,
                lineHeight: `${rh}px`,
                fontFamily: FONT.mono,
                fontSize: size,
                fontWeight: folder || e.depth === 0 ? 600 : 400,
                color: colour,
                whiteSpace: "pre",
              }}
            >
              {e.name}
              {e.tag && (
                <span
                  style={{
                    marginLeft: size * 0.6,
                    fontFamily: FONT.serif,
                    fontStyle: "italic",
                    fontWeight: 400,
                    fontSize: size * 0.7,
                    color: e.tagColor ?? C.dim,
                    opacity: tagO,
                  }}
                >
                  {e.tag}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export type PanelLine = {
  text: string;
  color?: string;
  /** When the line writes on (else with the panel). */
  at?: number;
  out?: number;
  italic?: boolean;
  bold?: boolean;
};

/** Line height of a `Panel` with text `size`. */
export const panelLine = (size: number) => size * 1.6;
const BAR = 54;
const PAD = 26;
/** The vertical centre of line `i` of a panel at `y` with text `size`. */
export const panelLineY = (i: number, y: number, size: number) => y + BAR + PAD + i * panelLine(size) + panelLine(size) / 2;

/**
 * A window onto a file (or a terminal): a title bar with the file name, then monospace lines.
 * `highlight` bands lines from a frame on. `x`/`y` are its top-left; `h` defaults to fit the lines.
 */
export const Panel: React.FC<{
  x: number;
  y: number;
  w: number;
  h?: number;
  title: string;
  lines: PanelLine[];
  size?: number;
  at?: number;
  out?: number;
  highlight?: { lines: number[]; at: number; out?: number; color?: string }[];
  /** Outline colour (e.g. the project's role colour). */
  border?: string;
  opacity?: number;
}> = ({ x, y, w, h, title, lines, size = 28, at, out, highlight = [], border = C.faint, opacity = 1 }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out) * opacity;
  if (o <= 0) return null;
  const lh = panelLine(size);
  const height = h ?? BAR + PAD * 2 + lines.length * lh;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height,
        opacity: o,
        borderRadius: 16,
        border: `2px solid ${border}`,
        background: "#16161A",
        overflow: "hidden",
        transform: `translateY(${(1 - Math.min(1, o)) * 16}px)`,
      }}
    >
      <div style={{ height: BAR, borderBottom: `2px solid ${C.faint}`, display: "flex", alignItems: "center", padding: "0 22px", gap: 10 }}>
        {[C.red, C.gold, C.green].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: `${c}AA` }} />
        ))}
        <div style={{ marginLeft: 14, fontFamily: FONT.mono, fontSize: 22, color: C.dim }}>{title}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: BAR + PAD }}>
        {lines.map((line, i) => {
          const p = (line.at === undefined ? 1 : frame < line.at ? 0 : prog(frame, line.at, 0.5, fps)) * visibility(frame, fps, undefined, line.out);
          const band = highlight
            .filter((hl) => hl.lines.includes(i))
            .reduce((m, hl) => Math.max(m, frame < hl.at ? 0 : prog(frame, hl.at, 0.4, fps) * visibility(frame, fps, undefined, hl.out)), 0);
          const bandColour = highlight.find((hl) => hl.lines.includes(i) && frame >= hl.at)?.color ?? C.yellow;
          return (
            <div
              key={i}
              style={{
                position: "relative",
                height: lh,
                padding: `0 ${PAD}px`,
                fontFamily: FONT.mono,
                fontSize: size,
                lineHeight: `${lh}px`,
                whiteSpace: "pre",
                color: line.color ?? C.text,
                fontStyle: line.italic ? "italic" : undefined,
                fontWeight: line.bold ? 600 : undefined,
                opacity: p,
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
  );
};

/**
 * A command typed at a prompt, character by character from `at`, as a single line with a "$ "
 * prompt. `x`/`y` are the line's left end and vertical centre.
 */
export const Command: React.FC<{ x: number; y: number; text: string; at: number; out?: number; size?: number; cps?: number; color?: string }> = ({
  x,
  y,
  text,
  at,
  out,
  size = 34,
  cps = 30,
  color = ROLE.command,
}) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out, 0.3);
  if (o <= 0) return null;
  const shown = Math.min(text.length, Math.max(0, Math.floor(((frame - at) / fps) * cps)));
  const typing = shown < text.length;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(0, -50%)",
        opacity: o,
        fontFamily: FONT.mono,
        fontSize: size,
        whiteSpace: "pre",
        color,
      }}
    >
      <span style={{ color: C.dim }}>$ </span>
      {text.slice(0, shown)}
      <span style={{ opacity: typing || Math.floor(frame / (fps * 0.5)) % 2 === 0 ? 1 : 0, color: C.dim }}>▍</span>
    </div>
  );
};
