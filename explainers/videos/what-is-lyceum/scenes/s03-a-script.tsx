import React from "react";
import { Arrow, C, Line, Node, Svg, Text, prog, useScene } from "#kit";
import { ROLE, ScriptPage, useAppear, type ScriptLine } from "./shared";

// It starts as a script: one plain-text page that says what's on screen and what's said. No timeline,
// no keyframes; your coding agent takes it from there.

const LINES: ScriptLine[] = [
  { text: "## 02 · cache — Where reads go first", kind: "heading" },
  { text: "", kind: "blank" },
  { text: "> Visual: three boxes, request → cache →", kind: "visual" },
  { text: '> database. On "cache", the cache lights up.', kind: "visual" },
  { text: "", kind: "blank" },
  { text: "Every read checks the cache first. If the", kind: "narration" },
  { text: "value is there, the database never hears", kind: "narration" },
  { text: "about it.", kind: "narration" },
];

const PAGE = { x: 160, y: 230, w: 980, h: 560, size: 28 } as const;
const LH = PAGE.size * 1.6;
/** The vertical centre of script line `i` (the page's title bar is 54 px, its top padding 28). */
const lineY = (i: number) => PAGE.y + 54 + 28 + i * LH + LH / 2;
const RIGHT = PAGE.x + PAGE.w;

/** A ghosted animation timeline: tracks with keyframe diamonds and a playhead. */
const Timeline: React.FC<{ at: number; out: number }> = ({ at, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out);
  if (o <= 0) return null;
  const x0 = 1240;
  const x1 = 1780;
  const tracks = [420, 500, 580];
  const keys = [
    [1290, 1450, 1620],
    [1340, 1540, 1720],
    [1300, 1400, 1580, 1700],
  ];
  const drawn = prog(frame, at, 0.8, fps);
  const playhead = 1490;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o * 0.55 }}>
      <Svg>
        {tracks.map((y, i) => (
          <React.Fragment key={i}>
            <Line from={[x0, y]} to={[x1, y]} at={at + Math.round(i * 0.1 * fps)} dur={0.6} color={C.dim} width={3} />
            {keys[i].map((kx, k) => {
              const p = Math.max(0, Math.min(1, (drawn * (x1 - x0) - (kx - x0)) / 40));
              const s = 14 * p;
              return <polygon key={k} points={`${kx},${y - s} ${kx + s},${y} ${kx},${y + s} ${kx - s},${y}`} fill={C.text} opacity={p} />;
            })}
          </React.Fragment>
        ))}
        <Line from={[playhead, 370]} to={[playhead, 630]} at={at + Math.round(0.4 * fps)} dur={0.4} color={C.gold} width={3} />
        <polygon points={`${playhead - 12},362 ${playhead + 12},362 ${playhead},378`} fill={C.gold} opacity={prog(frame, at + Math.round(0.4 * fps), 0.3, fps)} />
      </Svg>
      <Text x={x0} y={680} size={30} color={C.dim} italic anchor="left" at={at} reveal="fade" dur={0.5}>
        timeline
      </Text>
    </div>
  );
};

export const AScript: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const page = cue("With Lyceum");
  const heading = cue("write it instead");
  const visual = cue("one script");
  const narration = cue("plain text");
  const onScreen = cue("what's on screen");
  const said = cue("what's said", { after: onScreen + 1 });
  const timeline = cue("no timeline");
  const labelsOut = cue("There's");
  const keyframes = cue("keyframes");
  const agent = cue("Your coding agent");

  const stagger = (n: number) => Math.round(n * 0.15 * fps);
  const lineAts = [
    heading,
    heading,
    visual,
    visual + stagger(1),
    narration,
    narration,
    narration + stagger(1),
    narration + stagger(2),
  ];

  const labelX = RIGHT + 110;
  const screenY = (lineY(2) + lineY(3)) / 2;
  const saidY = lineY(6);
  const agentY = 510;
  const agentO = useAppear(agent, undefined, 0.6);

  return (
    <>
      <ScriptPage
        x={PAGE.x}
        y={PAGE.y}
        w={PAGE.w}
        h={PAGE.h}
        size={PAGE.size}
        lines={LINES}
        at={page}
        lineAts={lineAts}
        highlight={[
          { lines: [2, 3], at: onScreen, color: C.blue },
          { lines: [5, 6, 7], at: said, color: C.yellow },
        ]}
      />
      <Text x={PAGE.x} y={PAGE.y + PAGE.h + 40} size={26} color={C.dim} italic anchor="left" at={page} reveal="fade" dur={0.6}>
        an example scene
      </Text>

      {/* The two things a scene says. */}
      <Svg>
        <Arrow from={[labelX - 20, screenY]} to={[RIGHT + 14, screenY]} at={onScreen} out={labelsOut} dur={0.4} color={C.blue} width={4} />
        <Arrow from={[labelX - 20, saidY]} to={[RIGHT + 14, saidY]} at={said} out={labelsOut} dur={0.4} color={C.yellow} width={4} />
      </Svg>
      <Text x={labelX} y={screenY} size={36} color={C.blue} anchor="left" at={onScreen} out={labelsOut} dur={0.6}>
        what's on screen
      </Text>
      <Text x={labelX} y={saidY} size={36} color={C.yellow} anchor="left" at={said} out={labelsOut} dur={0.5}>
        what's said
      </Text>

      {/* What it doesn't need. */}
      <Timeline at={timeline} out={agent} />
      <Svg>
        <Line from={[1210, 690]} to={[1810, 360]} at={keyframes} out={agent} dur={0.45} color={ROLE.wrong} width={6} />
      </Svg>

      {/* Who takes it from here. */}
      <Svg>
        <Arrow from={[RIGHT + 14, agentY]} to={[1325, agentY]} at={agent + Math.round(0.2 * fps)} dur={0.5} color={C.dim} width={4} />
      </Svg>
      <div style={{ position: "absolute", inset: 0, opacity: agentO }}>
        <Node x={1500} y={agentY} w={320} h={120} label="your coding agent" color={ROLE.agent} at={cue("coding agent")} size={34} />
      </div>
    </>
  );
};
