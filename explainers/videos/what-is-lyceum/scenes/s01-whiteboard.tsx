import React from "react";
import { C, FONT, Svg, lin, mix, prog, track, useScene } from "#kit";
import { DIAGRAM, ROLE, SystemDiagram, useAppear, wipeEdge } from "./shared";

// The picture in your head: the diagram sketched, set moving, erased, flattened into a document, and
// explained again in a meeting that recurs.

const DOC = [
  "When a request arrives, the service first",
  "checks the cache. If the cache holds a",
  "fresh value, it returns it at once.",
  "Otherwise it reads from the database, then",
  "writes the result back into the cache, so",
  "the next request is fast. Entries expire",
  "after a while, and a write to the database",
  "invalidates the matching cache entry …",
];
const NAMES: Record<string, string> = { request: ROLE.request, cache: ROLE.cache, database: ROLE.database };

/** A page of prose. `x`/`y` are its centre. */
const DocPage: React.FC<{ x: number; y: number; at: number; scale?: number }> = ({ x, y, at, scale = 1 }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at);
  if (o <= 0) return null;
  const w = 700;
  const h = 470;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        padding: "40px 44px",
        borderRadius: 14,
        background: "#18181C",
        border: `2px solid ${C.faint}`,
        opacity: o,
        transform: `scale(${scale * mix(0.94, 1, o)})`,
      }}
    >
      {DOC.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: FONT.serif,
            fontSize: 28,
            lineHeight: "48px",
            color: C.dim,
            whiteSpace: "nowrap",
            opacity: prog(frame, at + Math.round(i * 0.12 * fps), 0.4, fps),
          }}
        >
          {line.split(/(request|cache|database)/).map((part, k) => (
            <span key={k} style={NAMES[part] ? { color: NAMES[part], opacity: 0.75 } : undefined}>
              {part}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

/** A calendar event. `x`/`y` are its centre. */
const Meeting: React.FC<{ x: number; y: number; at: number; when: string; again?: boolean }> = ({ x, y, at, when, again }) => {
  const o = useAppear(at, undefined, 0.5);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 310,
        top: y - 70,
        width: 620,
        height: 140,
        borderRadius: 12,
        borderLeft: `10px solid ${ROLE.request}`,
        background: `${ROLE.request}22`,
        padding: "20px 28px",
        opacity: o,
        transform: `translateY(${(1 - o) * 24}px)`,
      }}
    >
      <div style={{ fontFamily: FONT.serif, fontSize: 36, color: C.text }}>Architecture walkthrough{again ? " (again)" : ""}</div>
      <div style={{ fontFamily: FONT.mono, fontSize: 24, color: C.dim, marginTop: 10 }}>{when}</div>
    </div>
  );
};

export const Whiteboard: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const request = cue("understand");
  const cache = cue("system");
  const database = cue("design");
  const arrow1 = cue("went");
  const arrow2 = cue("did");
  const moves = cue("the picture moves");
  const board = cue("whiteboard");
  const erased = cue("erased");
  const doc = cue("document");
  const flattens = cue("flattens");
  const meeting = cue("meeting");
  const again = cue("next month");

  // The dot loops through the diagram until it's erased.
  const loop = 2.4 * fps;
  const dot = frame >= moves && frame < erased ? (((frame - moves) % loop) / loop) * 2 : undefined;
  const wipe = lin(frame, erased, 0.9, fps);

  // The board: a frame drawn around the sketch.
  const boardO = useAppear(board, erased + Math.round(1 * fps), 0.5);
  const bw = 2 * DIAGRAM.gap + DIAGRAM.w + 160;
  const bh = 340;

  // The document flattens: the sketch's place is taken by prose, then moves aside for the meeting.
  const docX = track(frame, fps, [[0, 960], [meeting, 620]]);
  const docScale = track(frame, fps, [[0, 1], [meeting, 0.82]]);

  return (
    <>
      <div style={{ position: "absolute", inset: 0, opacity: boardO }}>
        <div
          style={{
            position: "absolute",
            left: 960 - bw / 2,
            top: DIAGRAM.y - bh / 2,
            width: bw,
            height: bh,
            borderRadius: 18,
            border: `3px solid ${C.faint}`,
            background: "#FFFFFF06",
          }}
        />
        <div style={{ position: "absolute", left: 960 - bw / 2, top: DIAGRAM.y + bh / 2 + 16, fontFamily: FONT.serif, fontStyle: "italic", fontSize: 28, color: C.dim }}>
          whiteboard
        </div>
      </div>

      <SystemDiagram sketch ats={{ request, cache, database }} arrowAts={[arrow1, arrow2]} dot={dot} wipe={wipe} />

      {wipe > 0 && wipe < 1 && (
        <Svg>
          <rect x={wipeEdge(wipe) - 40} y={DIAGRAM.y - 110} width={80} height={220} rx={14} fill={C.dim} opacity={0.85} />
          <rect x={wipeEdge(wipe) - 40} y={DIAGRAM.y + 70} width={80} height={40} rx={8} fill={C.faint} />
        </Svg>
      )}

      <DocPage x={docX} y={500} at={doc} scale={docScale} />
      <div
        style={{
          position: "absolute",
          left: docX - 300,
          top: 790,
          width: 600,
          textAlign: "center",
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 28,
          color: C.dim,
          opacity: prog(frame, flattens, 0.5, fps) * (1 - prog(frame, meeting, 0.4, fps)),
        }}
      >
        the picture, in paragraphs
      </div>

      <Meeting x={1360} y={420} at={meeting} when="Tuesday · 2:00 – 3:00" />
      <Meeting x={1360} y={600} at={again} when="a month later · 2:00 – 3:00" again />
    </>
  );
};
