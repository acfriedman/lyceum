import React from "react";
import { Arrow, C, FONT, Node, Svg, mix, prog, useScene, visibility } from "#kit";
import { ROLE, useAppear } from "./shared";

// Your agent builds it: you ask for a video, and the agent walks a row of stations, from research to
// render, stopping at the one station that's yours: your review of the script.

const ROW_Y = 560;
const NODE_W = 200;
const NODE_H = 96;
const XS = [180, 440, 700, 960, 1220, 1480, 1740];
const LABELS = ["research", "script", "your review", "voice", "scenes", "check", "render"];
const REVIEW = 2;
/** The bead runs along the stations' top edges. */
const BEAD_Y = ROW_Y - NODE_H / 2 - 12;

/** The ask: a chat input with a request in it, whose topic swaps. `x`/`y` are its centre. */
const AskBox: React.FC<{ y: number; at: number; textAt: number; topics: [string, number][]; dimAt: number }> = ({ y, at, textAt, topics, dimAt }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, undefined, 0.5);
  if (o <= 0) return null;
  const w = 1000;
  const h = 100;
  const dim = mix(1, 0.35, frame < dimAt ? 0 : prog(frame, dimAt, 0.6, fps));
  const textO = frame < textAt ? 0 : prog(frame, textAt, 0.5, fps);
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: 50,
        border: `2px solid ${C.faint}`,
        background: "#16161A",
        opacity: o * dim,
        transform: `translateY(${(1 - o) * 16}px)`,
        fontFamily: FONT.serif,
        fontSize: 38,
        color: C.text,
      }}
    >
      <div style={{ position: "absolute", left: 48, top: 0, bottom: 0, display: "flex", alignItems: "center", whiteSpace: "nowrap", opacity: textO }}>
        <span style={{ color: C.dim }}>make a video about&nbsp;</span>
        <span style={{ position: "relative", display: "inline-block", width: 420, height: 50 }}>
          {topics.map(([topic, t], i) => {
            const next = topics[i + 1]?.[1];
            const tin = i === 0 ? 1 : frame < t ? 0 : prog(frame, t, 0.4, fps);
            const tout = next === undefined || frame < next ? 1 : 1 - prog(frame, next, 0.4, fps);
            return (
              <span key={topic} style={{ position: "absolute", left: 0, top: 0, lineHeight: "50px", opacity: tin * tout }}>
                {topic}
              </span>
            );
          })}
        </span>
      </div>
      {/* the send mark */}
      <div style={{ position: "absolute", right: 22, top: 22, width: 56, height: 56, borderRadius: 28, background: `${ROLE.agent}33`, border: `2px solid ${ROLE.agent}88` }}>
        <svg width={56} height={56} style={{ position: "absolute", left: -2, top: -2 }}>
          <path d="M28 40 L28 17 M19 25 L28 16 L37 25" stroke={ROLE.agent} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};

/** A small source pill, left-anchored at `x`, centred on `y`. */
const Source: React.FC<{ x: number; y: number; text: string; at: number; out: number }> = ({ x, y, text, at, out }) => {
  const o = useAppear(at, out, 0.45);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y - 22,
        height: 44,
        padding: "0 18px",
        borderRadius: 22,
        border: `2px solid ${C.faint}`,
        background: "#1A1A1F",
        display: "flex",
        alignItems: "center",
        fontFamily: FONT.mono,
        fontSize: 26,
        color: C.dim,
        whiteSpace: "nowrap",
        opacity: o,
        transform: `translateX(${(1 - o) * -14}px)`,
      }}
    >
      {text}
    </div>
  );
};

/** A tiny still of the running example: some of request → cache → database, as a frame of a video. */
const Thumb: React.FC<{ parts: number; w: number; h: number }> = ({ parts, w, h }) => {
  const colours = [ROLE.request, ROLE.cache, ROLE.database];
  const xs = [w * 0.2, w * 0.5, w * 0.8];
  return (
    <svg width={w} height={h} style={{ display: "block", borderRadius: 4, background: "#0B0B0D", border: `1px solid ${C.faint}` }}>
      {[0, 1].map((i) => (i + 1 < parts ? <line key={i} x1={xs[i] + 6} y1={h / 2} x2={xs[i + 1] - 6} y2={h / 2} stroke={C.dim} strokeWidth={1.5} /> : null))}
      {colours.slice(0, parts).map((c, i) => (
        <rect key={i} x={xs[i] - 6} y={h / 2 - 5} width={12} height={10} rx={2} fill="none" stroke={c} strokeWidth={1.8} />
      ))}
    </svg>
  );
};

/** A contact sheet: a 3×2 grid of stills that pop in one by one. `x`/`y` are its centre. */
const ContactSheet: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, undefined, 0.4);
  if (o <= 0) return null;
  const tw = 60;
  const th = 40;
  const gap = 8;
  const pad = 10;
  const w = 3 * tw + 2 * gap + 2 * pad;
  const h = 2 * th + gap + 2 * pad;
  const parts = [1, 2, 3, 3, 3, 3];
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, opacity: o }}>
      <div
        style={{
          width: w,
          height: h,
          padding: pad,
          borderRadius: 8,
          background: "#18181C",
          border: `2px solid ${C.faint}`,
          display: "grid",
          gridTemplateColumns: `repeat(3, ${tw}px)`,
          gap,
          transform: `scale(${mix(0.9, 1, o)})`,
        }}
      >
        {parts.map((p, i) => {
          const t = at + Math.round((0.15 + i * 0.12) * fps);
          const s = frame < t ? 0 : prog(frame, t, 0.3, fps);
          return (
            <div key={i} style={{ opacity: s, transform: `scale(${mix(0.6, 1, s)})` }}>
              <Thumb parts={p} w={tw} h={th} />
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6, textAlign: "center", fontFamily: FONT.serif, fontStyle: "italic", fontSize: 28, color: C.dim }}>stills</div>
    </div>
  );
};

/** The finished video: a card with a play button. `x`/`y` are its centre. */
const VideoCard: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const o = useAppear(at, undefined, 0.5);
  if (o <= 0) return null;
  const w = 200;
  const h = 116;
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, opacity: o, transform: `scale(${mix(0.85, 1, o)})` }}>
      <div
        style={{
          position: "relative",
          width: w,
          height: h,
          borderRadius: 10,
          background: "#16161A",
          border: `2px solid ${ROLE.agent}`,
          boxShadow: `0 0 ${24 * o}px ${ROLE.agent}55`,
        }}
      >
        <svg width={w} height={h} style={{ position: "absolute", left: -2, top: -2 }}>
          <circle cx={w / 2} cy={h / 2 - 6} r={28} fill={`${ROLE.agent}2A`} stroke={ROLE.agent} strokeWidth={2.5} />
          <path d={`M${w / 2 - 9} ${h / 2 - 20} L${w / 2 + 15} ${h / 2 - 6} L${w / 2 - 9} ${h / 2 + 8} Z`} fill={ROLE.agent} />
          <line x1={14} y1={h - 14} x2={w - 14} y2={h - 14} stroke={C.faint} strokeWidth={4} strokeLinecap="round" />
          <line x1={14} y1={h - 14} x2={w * 0.38} y2={h - 14} stroke={ROLE.agent} strokeWidth={4} strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ marginTop: 6, textAlign: "center", fontFamily: FONT.serif, fontStyle: "italic", fontSize: 28, color: C.dim }}>the video</div>
    </div>
  );
};

/** A small person mark (head and shoulders), centred on `x`, its feet at `y`. */
const Person: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const o = useAppear(at, undefined, 0.5);
  if (o <= 0) return null;
  return (
    <Svg opacity={o}>
      <circle cx={x} cy={y - 34} r={11} fill={ROLE.you} />
      <path d={`M${x - 20} ${y} Q${x - 20} ${y - 19} ${x} ${y - 19} Q${x + 20} ${y - 19} ${x + 20} ${y} Z`} fill={ROLE.you} />
    </Svg>
  );
};

export const TheLoop: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const ask = cue("Ask");
  const askText = cue("a video");
  const caching = cue("caching layer");
  const onboarding = cue("onboarding flow");
  const pricing = cue("new pricing");
  const row = cue("It reads");
  const code = cue("the code");
  const docs = cue("design documents");
  const notes = cue("the notes");
  const reviewIt = cue("review it");
  const happy = cue("Once you're happy");

  const lit = [
    cue("reads the real sources"),
    cue("drafts the script"),
    cue("stops"),
    cue("a voice"),
    cue("builds every scene"),
    cue("checks every scene"),
    cue("renders the video"),
  ];
  const colourOf = (i: number) => (i === REVIEW ? ROLE.you : ROLE.agent);

  // The bead: arrives at each station as it lights; waits at your review until you're happy.
  const beadX = (() => {
    if (frame <= lit[0]) return XS[0];
    for (let i = 0; i < XS.length - 1; i++) {
      const arrive = lit[i + 1];
      if (frame >= arrive) continue;
      const leave = i === REVIEW ? happy : Math.max(lit[i], arrive - Math.round(0.6 * fps));
      if (frame < leave) return XS[i];
      return mix(XS[i], XS[i + 1], prog(frame, leave, (arrive - leave) / fps, fps));
    }
    return XS[XS.length - 1];
  })();
  const beadO = frame < lit[0] ? 0 : prog(frame, lit[0], 0.4, fps);
  const atStation = XS.findIndex((x) => Math.abs(x - beadX) < 1);
  const beadColour = atStation === REVIEW ? ROLE.you : ROLE.agent;

  // Your review glows while the bead waits there.
  const waiting = frame < lit[REVIEW] ? 0 : prog(frame, lit[REVIEW], 0.5, fps) * visibility(frame, fps, undefined, happy, 0.6);
  const pulse = 0.75 + 0.25 * Math.sin(((frame - lit[REVIEW]) / fps) * Math.PI * 1.6);

  const edge = NODE_W / 2 + 8;

  return (
    <>
      <AskBox
        y={220}
        at={ask}
        textAt={askText}
        topics={[
          ["your caching layer", caching],
          ["your onboarding flow", onboarding],
          ["your new pricing", pricing],
        ]}
        dimAt={happy}
      />

      {/* The glow behind your review. */}
      {waiting > 0 && (
        <div
          style={{
            position: "absolute",
            left: XS[REVIEW] - NODE_W / 2 - 6,
            top: ROW_Y - NODE_H / 2 - 6,
            width: NODE_W + 12,
            height: NODE_H + 12,
            borderRadius: 14,
            boxShadow: `0 0 ${46 * pulse}px ${14 * pulse}px ${ROLE.you}66`,
            background: `${ROLE.you}14`,
            opacity: waiting,
          }}
        />
      )}

      {/* The path, faint, then each station lit in turn. */}
      {XS.map((x, i) => (
        <Node key={`faint-${i}`} x={x} y={ROW_Y} w={NODE_W} h={NODE_H} label={LABELS[i]} size={32} color={C.dim} dashed opacity={0.45} at={row} out={lit[i] + Math.round(0.5 * fps)} />
      ))}
      {XS.map((x, i) => (
        <Node key={`lit-${i}`} x={x} y={ROW_Y} w={NODE_W} h={NODE_H} label={LABELS[i]} size={32} color={colourOf(i)} at={lit[i]} />
      ))}
      <Svg>
        {XS.slice(0, -1).map((x, i) => (
          <Arrow key={`fa-${i}`} from={[x + edge, ROW_Y]} to={[XS[i + 1] - edge, ROW_Y]} at={row + Math.round(i * 0.08 * fps)} color={C.faint} width={3} dur={0.4} />
        ))}
        {XS.slice(0, -1).map((x, i) => (
          <Arrow key={`la-${i}`} from={[x + edge, ROW_Y]} to={[XS[i + 1] - edge, ROW_Y]} at={lit[i + 1]} color={C.dim} width={3} dur={0.4} />
        ))}
        {beadO > 0 && (
          <g opacity={beadO}>
            <circle cx={beadX} cy={BEAD_Y} r={22} fill={beadColour} opacity={0.18} />
            <circle cx={beadX} cy={BEAD_Y} r={14} fill={beadColour} opacity={0.3} />
            <circle cx={beadX} cy={BEAD_Y} r={9} fill={beadColour} />
          </g>
        )}
      </Svg>

      <Person x={XS[REVIEW]} y={ROW_Y - NODE_H / 2 - 40} at={lit[REVIEW]} />
      <div
        style={{
          position: "absolute",
          left: XS[REVIEW] - 150,
          top: ROW_Y + NODE_H / 2 + 22,
          width: 300,
          textAlign: "center",
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 30,
          color: ROLE.you,
          opacity: frame < reviewIt ? 0 : prog(frame, reviewIt, 0.5, fps),
        }}
      >
        you approve
      </div>

      <Source x={90} y={650} text="code" at={code} out={happy} />
      <Source x={90} y={710} text="design documents" at={docs} out={happy} />
      <Source x={90} y={770} text="notes" at={notes} out={happy} />

      <ContactSheet x={XS[5]} y={370} at={lit[5]} />
      <VideoCard x={1720} y={370} at={lit[6]} />
    </>
  );
};
