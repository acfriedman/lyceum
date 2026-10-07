import React from "react";
import { Box, C, FONT, Svg, Text, mix, prog, useScene, visibility } from "#kit";
import { SystemDiagram, WordStrip, useAppear } from "./shared";

// What the best explanations do: the diagram rebuilds cleanly inside a video, each piece on its word,
// captions underneath. Then the cost: four days of work. So almost nobody makes them.

const VIDEO = { x: 960, y: 560, w: 1320, h: 620 } as const;
const DIAGRAM_Y = 470;
const CAPTION_Y = 760;

/** A calendar page for one day of work. `x`/`y` are its centre. */
const DayTile: React.FC<{ x: number; y: number; day: number; label: string; at: number; out?: number }> = ({ x, y, day, label, at, out }) => {
  const o = useAppear(at, out, 0.5);
  if (o <= 0) return null;
  const w = 220;
  const h = 200;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: 14,
        overflow: "hidden",
        background: "#18181C",
        border: `2px solid ${C.faint}`,
        opacity: o,
        transform: `translateY(${(1 - o) * 24}px)`,
      }}
    >
      <div
        style={{
          height: 52,
          background: `${C.red}33`,
          borderBottom: `2px solid ${C.red}88`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT.mono,
          fontSize: 26,
          color: C.text,
        }}
      >
        day {day}
      </div>
      <div
        style={{
          height: h - 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT.serif,
          fontSize: 36,
          color: C.text,
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const GoodExplanations: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const watched = cue("watched");
  const sentence1 = cue("A diagram");
  const request = cue("diagram builds");
  const sentence2 = cue("Each piece");
  const database = cue("moment");
  const arrow1 = cue("so you always");
  const arrow2 = cue("where to look");
  const those = cue("Those videos");
  const days = cue("days");
  const animate = cue("animation software");
  const record = cue("microphone");
  const edit = cue("patience");
  const nobody = cue("almost nobody");

  // Just before "days" the video steps back (smaller, higher, dimmed) so the first day lands in clear
  // space. On "almost nobody" it leaves.
  const back = prog(frame, cue("days", { offset: -0.9 }), 0.8, fps);
  const videoO = mix(1, 0.25, back) * visibility(frame, fps, undefined, nobody);
  const videoScale = mix(1, 0.7, back);
  const videoShift = mix(0, -160, back);

  // A thin progress bar along the video's bottom edge, as a player shows.
  const played = Math.min(1, frame / Math.max(1, nobody));
  const barO = prog(frame, watched + Math.round(0.4 * fps), 0.5, fps);
  const left = VIDEO.x - VIDEO.w / 2;
  const top = VIDEO.y - VIDEO.h / 2;
  const barY = top + VIDEO.h - 30;

  const tiles = [
    { label: "storyboard", at: days },
    { label: "animate", at: animate },
    { label: "record", at: record },
    { label: "edit", at: edit },
  ];

  return (
    <>
      {videoO > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: videoO,
            transform: `translateY(${videoShift}px) scale(${videoScale})`,
            transformOrigin: `${VIDEO.x}px ${VIDEO.y}px`,
          }}
        >
          <Svg>
            <Box x={VIDEO.x} y={VIDEO.y} w={VIDEO.w} h={VIDEO.h} r={24} at={watched} dur={0.9} color={C.faint} width={3} fill="#FFFFFF05" />
            <g opacity={barO}>
              <line x1={left + 40} y1={barY} x2={left + VIDEO.w - 40} y2={barY} stroke={C.faint} strokeWidth={4} strokeLinecap="round" />
              <line x1={left + 40} y1={barY} x2={left + 40 + played * (VIDEO.w - 80)} y2={barY} stroke={C.dim} strokeWidth={4} strokeLinecap="round" />
              {/* A small play mark in the top-left corner. */}
              <polygon points={`${left + 40},${top + 34} ${left + 40},${top + 66} ${left + 66},${top + 50}`} fill={C.dim} />
            </g>
          </Svg>

          <SystemDiagram
            y={DIAGRAM_Y}
            scale={0.85}
            ats={{ request, cache: sentence2, database }}
            arrowAts={[arrow1, arrow2]}
          />

          <WordStrip sentence="A diagram builds on screen while a voice explains it." from={sentence1} y={CAPTION_Y} size={30} at={sentence1} out={sentence2} />
          <WordStrip
            sentence="Each piece appears the moment it's mentioned, so you always know where to look."
            from={sentence2}
            y={CAPTION_Y}
            size={30}
            at={sentence2}
            out={those}
          />
        </div>
      )}

      {tiles.map((t, i) => (
        <DayTile key={t.label} x={960 + (i - 1.5) * 260} y={800} day={i + 1} label={t.label} at={t.at} out={nobody} />
      ))}

      <Text x={960} y={540} size={56} italic color={C.text} at={nobody + Math.round(0.4 * fps)} dur={1.2}>
        so it stays in your head
      </Text>
    </>
  );
};
