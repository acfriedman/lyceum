import React from "react";
import { Arrow, C, FONT, Line, Pill, Svg, Text, prog, track, useScene } from "#kit";
import { FileTree, ROLE, treeRowY, useAppear } from "./shared";

// What travels with the project: the script, scenes, word timings and captions are committed; the
// voice clips (.cache/) and the rendered videos (dist/) stay on the machine that voiced them. So a
// teammate can build scenes and contact sheets, but not render, and re-voicing gives a new take.

/** Where the two columns sit in the opening, and where they land inside "your" laptop. */
const A = { size: 40, headSize: 44, left: 340, right: 1140, head: 330, tree: 380 } as const;
const B = { size: 28, x: 190, repoHead: 196, repoTree: 222, machineHead: 446, machineTree: 472 } as const;

/** The two laptops of the second half: screens' centres and sizes. */
const YOU = { cx: 380, cy: 380, w: 440, h: 440 } as const;
const MATE = { cx: 1100, cy: 380, w: 440, h: 440 } as const;
const MATE_X = MATE.cx - MATE.w / 2 + 30;

/** The contact sheet grid by the teammate. */
const GRID = { x: 1400, y: 250, tw: 120, th: 68, gap: 16 } as const;

/** The waveforms and timeline under the laptops. */
const WAVE = { label: 900, x0: 1040, take1: 762, take2: 842, line: 932 } as const;
const REVIEWED_X = 1300;
const DRIFT_X = 1450;

/** A simple laptop: a rounded screen, a thin base, a label below. `cx`/`cy` are the screen's centre. */
const Laptop: React.FC<{
  cx: number;
  cy: number;
  w: number;
  h: number;
  color: string;
  label: string;
  labelSize?: number;
  at: number;
  out?: number;
  opacity?: number;
}> = ({ cx, cy, w, h, color, label, labelSize = 34, at, out, opacity = 1 }) => {
  const o = useAppear(at, out, 0.7) * opacity;
  if (o <= 0) return null;
  const top = cy - h / 2;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <div
        style={{
          position: "absolute",
          left: cx - w / 2,
          top,
          width: w,
          height: h,
          borderRadius: Math.min(18, h * 0.12),
          border: `3px solid ${color}`,
          background: "#141418",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: cx - w / 2 - w * 0.08,
          top: top + h + 10,
          width: w * 1.16,
          height: 6,
          borderRadius: 3,
          background: color,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: cx,
          top: top + h + 24,
          transform: "translate(-50%, 0)",
          fontFamily: FONT.serif,
          fontSize: labelSize,
          color,
          whiteSpace: "pre",
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** A 3×2 grid of scene stills that appear one by one. */
const ContactSheet: React.FC<{ at: number; out: number }> = ({ at, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out, 0.4);
  if (o <= 0) return null;
  const tones = [C.blue, ROLE.lyceum, C.gold, C.purple, C.green, C.pink];
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      {tones.map((tone, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const p = frame < at ? 0 : prog(frame, at + Math.round(i * 0.12 * fps), 0.4, fps);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: GRID.x + col * (GRID.tw + GRID.gap),
              top: GRID.y + row * (GRID.th + GRID.gap),
              width: GRID.tw,
              height: GRID.th,
              borderRadius: 6,
              border: `2px solid ${C.faint}`,
              background: "#16161A",
              opacity: p,
              transform: `scale(${0.85 + 0.15 * p})`,
            }}
          >
            <div style={{ position: "absolute", left: 14, top: 14, width: 44, height: 22, borderRadius: 4, border: `2px solid ${tone}` }} />
            <div style={{ position: "absolute", left: 66, top: 24, width: 36, height: 3, background: tone, opacity: 0.8 }} />
            <div style={{ position: "absolute", left: 14, top: 46, width: 70, height: 6, borderRadius: 3, background: C.faint }} />
          </div>
        );
      })}
    </div>
  );
};

/** A green check mark in a circle. */
const Check: React.FC<{ x: number; y: number; at: number; out: number }> = ({ x, y, at, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out, 0.3);
  if (o <= 0) return null;
  const p = prog(frame, at, 0.5, fps);
  return (
    <svg style={{ position: "absolute", left: x - 26, top: y - 26, opacity: o }} width={52} height={52} viewBox="0 0 52 52">
      <circle cx={26} cy={26} r={23} fill={`${C.green}22`} stroke={C.green} strokeWidth={3} />
      <path d="M15 27 L23 35 L38 18" fill="none" stroke={C.green} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  );
};

/** A "render" button that greys out from `off`. */
const RenderButton: React.FC<{ x: number; y: number; at: number; off: number; out: number }> = ({ x, y, at, off, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out, 0.4);
  if (o <= 0) return null;
  const g = frame < off ? 0 : prog(frame, off, 0.5, fps);
  const mixHex = (a: string, b: string) => (g < 0.5 ? a : b);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        width: 220,
        height: 62,
        borderRadius: 12,
        border: `3px solid ${mixHex(ROLE.command, C.faint)}`,
        background: g < 0.5 ? `${ROLE.command}22` : "#1A1A1E",
        fontFamily: FONT.mono,
        fontSize: 30,
        lineHeight: "56px",
        textAlign: "center",
        color: mixHex(ROLE.command, C.dim),
        opacity: o * (1 - 0.45 * g),
      }}
    >
      ▶ render
    </div>
  );
};

/** A waveform of `n` bars that draws on left to right from `at`. */
const Waveform: React.FC<{ x: number; y: number; n: number; seed: number; color: string; at: number; out: number }> = ({ x, y, n, seed, color, at, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out, 0.3);
  if (o <= 0) return null;
  const p = prog(frame, at, 1.0, fps);
  const step = 14;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      {Array.from({ length: n }, (_, i) => {
        if (i / n > p) return null;
        const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.23 + seed));
        const h = 8 + 48 * env * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + seed * 3.1)));
        return (
          <div key={i} style={{ position: "absolute", left: x + i * step, top: y - h / 2, width: 8, height: h, borderRadius: 4, background: color }} />
        );
      })}
    </div>
  );
};

/** A vertical marker on the timeline. */
const Marker: React.FC<{ x: number; y: number; color: string; at: number; out: number; hollow?: boolean }> = ({ x, y, color, at, out, hollow }) => {
  const o = useAppear(at, out, 0.4);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 7,
        top: y - 24,
        width: 14,
        height: 48,
        borderRadius: 7,
        border: `3px solid ${color}`,
        background: hollow ? "transparent" : color,
        opacity: o,
      }}
    />
  );
};

export const Sharing: React.FC = () => {
  const { frame, fps, cue } = useScene();
  const s = (n: number) => Math.round(n * fps);

  // State A: what's committed, and what isn't.
  const team = cue("share with a team");
  const scripts = cue("The scripts");
  const scenes = cue("the scenes");
  const timings = cue("word timings");
  const travel = cue("travel with the repository");
  const audio = cue("The narration audio");
  const doesnt = cue("doesn't");
  const stays = cue("It stays");
  const machine = cue("machine that voiced");

  // State B: a teammate.
  const mate = cue("A teammate");
  const mateWord = cue("teammate");
  const clones = cue("clones the project");
  const build = cue("build scenes");
  const sheets = cue("check them on contact sheets");
  const because = cue("because those only need the timings");
  const but = cue("But rendering");
  const rendering = cue("rendering the video");
  const needs = cue("needs the audio");
  const voicing = cue("Voicing it again");
  const take = cue("different take");
  const shifts = cue("The timing shifts");
  const drift = cue("drift away");
  const reviewed = cue("what was reviewed");

  // State C: one owner.
  const soFor = cue("So for now");
  const own = cue("one person own");
  const narr = cue("narration", { after: own });
  const finalRender = cue("final render");
  const sends = cue("sends changes");
  const pulls = cue("pull requests");

  // The columns glide into "your" laptop when the teammate arrives.
  const move = (a: number, b: number, at = mate, dur = 0.8) => track(frame, fps, [[0, a], [at, b]], dur);
  const late = mate + s(0.3);
  const size = move(A.size, B.size);
  const leftHeadX = move(A.left, B.x);
  const leftHeadY = move(A.head, B.repoHead);
  const leftTreeY = move(A.tree, B.repoTree);
  const headSize = move(A.headSize, B.size);
  const rightX = move(A.right, B.x, late, 0.8);
  const rightHeadY = move(A.head, B.machineHead, mate, 0.5);
  const rightTreeY = move(A.tree, B.machineTree, mate, 0.5);

  const repoRows = (side: "you" | "mate") => [
    { name: "script.md", depth: 0, color: C.text, at: side === "you" ? scripts : undefined },
    { name: "scenes/", depth: 0, color: C.text, at: side === "you" ? scenes : undefined },
    {
      name: "narration.json",
      depth: 0,
      color: C.text,
      at: side === "you" ? timings : undefined,
      tag: side === "you" ? "word timings" : undefined,
      tagOut: mate,
      highlight: side === "mate" ? { at: because, out: but, color: ROLE.lyceum } : undefined,
    },
    { name: "captions.srt", depth: 0, color: C.text, at: side === "you" ? travel : undefined },
  ];
  const machineRows = [
    {
      name: ".cache/",
      depth: 0,
      color: ROLE.ignored,
      at: audio + s(0.3),
      tag: "voice clips",
      tagOut: mate,
      highlight: { at: narr, color: ROLE.you },
    },
    { name: "dist/", depth: 0, color: ROLE.ignored, at: doesnt, tag: "videos", tagOut: mate, highlight: { at: finalRender, color: ROLE.you } },
  ];

  // The small "your machine" laptop under the right column, in the opening.
  const smallTop = A.tree + 2 * A.size * 1.7 + 70;

  // Teammate's tree rows, and the row narration.json sits on.
  const mateTreeY = B.repoTree;
  const mateJsonY = treeRowY(2, mateTreeY, B.size);
  const youRepoMidY = treeRowY(1.5, B.repoTree, B.size);

  const take1Len = 36;
  const take2Len = 50;
  const lineEnd = WAVE.x0 + take2Len * 14;
  const driftX = track(frame, fps, [[0, REVIEWED_X], [drift, DRIFT_X]], 1.2);

  return (
    <>
      {/* The laptops of state B, drawn first so the columns land on top of your screen. */}
      <Laptop cx={YOU.cx} cy={YOU.cy} w={YOU.w} h={YOU.h} color={ROLE.you} label="you" at={mate + s(0.5)} />
      <Laptop cx={MATE.cx} cy={MATE.cy} w={MATE.w} h={MATE.h} color={ROLE.teammate} label="teammate" at={mateWord} />

      {/* State A: two columns. */}
      <Text x={leftHeadX} y={leftHeadY} size={headSize} color={ROLE.lyceum} anchor="left" at={team} dur={0.8}>
        in the repository
      </Text>
      <FileTree entries={repoRows("you")} x={leftHeadX} y={leftTreeY} size={size} />

      <Text x={rightX} y={rightHeadY} size={headSize} color={ROLE.ignored} anchor="left" at={audio} dur={0.8}>
        only on your machine
      </Text>
      <FileTree entries={machineRows} x={rightX} y={rightTreeY} size={size} />

      <Laptop cx={A.right + 150} cy={smallTop + 45} w={130} h={84} color={ROLE.you} label="your machine" labelSize={30} at={stays} out={mate} />
      <Svg>
        <Line from={[A.right + 150, smallTop - 12]} to={[A.right + 150, smallTop - 52]} at={machine} out={mate} dur={0.4} color={ROLE.you} width={3} dashed />
      </Svg>

      {/* State B: the clone, from you to the teammate. */}
      <Svg>
        <Arrow from={[YOU.cx + YOU.w / 2 + 16, youRepoMidY]} to={[MATE.cx - MATE.w / 2 - 16, youRepoMidY]} at={clones} out={soFor} dur={0.6} color={ROLE.lyceum} width={4} />
      </Svg>
      <Text x={(YOU.cx + MATE.cx) / 2} y={youRepoMidY - 44} size={30} color={ROLE.lyceum} font="mono" at={clones + s(0.2)} out={soFor} reveal="fade" dur={0.4}>
        clone
      </Text>
      <Text x={MATE_X} y={B.repoHead} size={B.size} color={ROLE.lyceum} anchor="left" at={clones + s(0.5)} reveal="fade" dur={0.5}>
        in the repository
      </Text>
      <FileTree entries={repoRows("mate")} x={MATE_X} y={mateTreeY} size={B.size} at={clones + s(0.6)} />
      <Text x={MATE_X} y={B.machineHead} size={B.size} color={C.dim} anchor="left" italic at={build} out={soFor} reveal="fade" dur={0.5}>
        no voice clips
      </Text>

      {/* Contact sheets need only the timings. */}
      <Text x={GRID.x} y={GRID.y - 36} size={30} color={C.text} anchor="left" at={sheets} out={but} reveal="fade" dur={0.4}>
        contact sheets
      </Text>
      <ContactSheet at={sheets + s(0.3)} out={but} />
      <Check x={GRID.x + 3 * GRID.tw + 2 * GRID.gap + 6} y={GRID.y - 36} at={cue("sheets", { after: sheets })} out={but} />
      <Svg>
        <Line from={[MATE_X + 14 * B.size * 0.6 + 26, mateJsonY]} to={[GRID.x - 14, GRID.y + GRID.th + GRID.gap / 2]} at={because} out={but} dur={0.5} color={ROLE.lyceum} width={3} dashed />
      </Svg>

      {/* Rendering needs the audio. */}
      <RenderButton x={MATE.cx} y={546} at={rendering} off={needs} out={soFor} />
      <Text x={MATE.cx + MATE.w / 2 + 50} y={546} size={32} color={ROLE.wrong} italic anchor="left" at={needs + s(0.2)} out={soFor} reveal="fade" dur={0.4}>
        needs the voice clips
      </Text>

      {/* Voicing again: a different take, and the timing drifts. */}
      <Text x={WAVE.label} y={WAVE.take1} size={28} color={C.dim} anchor="left" at={voicing} out={soFor} reveal="fade" dur={0.4}>
        take 1
      </Text>
      <Waveform x={WAVE.x0} y={WAVE.take1} n={take1Len} seed={0.4} color={ROLE.lyceum} at={voicing + s(0.2)} out={soFor} />
      <Text x={WAVE.label} y={WAVE.take2} size={28} color={C.dim} anchor="left" at={take} out={soFor} reveal="fade" dur={0.4}>
        take 2
      </Text>
      <Waveform x={WAVE.x0} y={WAVE.take2} n={take2Len} seed={2.1} color={C.pink} at={take + s(0.1)} out={soFor} />

      <Text x={WAVE.label} y={WAVE.line} size={28} color={C.dim} anchor="left" at={shifts} out={soFor} reveal="fade" dur={0.4}>
        scene
      </Text>
      <Svg>
        <Line from={[WAVE.x0, WAVE.line]} to={[lineEnd, WAVE.line]} at={shifts} out={soFor} dur={0.6} color={C.dim} width={3} />
        <Line from={[REVIEWED_X, WAVE.line]} to={[driftX, WAVE.line]} at={drift} out={soFor} dur={0.2} color={ROLE.wrong} width={5} opacity={frame > drift + s(0.1) ? 1 : 0} />
      </Svg>
      <Marker x={REVIEWED_X} y={WAVE.line} color={ROLE.lyceum} at={shifts + s(0.3)} out={soFor} hollow />
      <Marker x={driftX} y={WAVE.line} color={ROLE.wrong} at={cue("animations")} out={soFor} />
      <Text x={REVIEWED_X} y={WAVE.line + 50} size={26} color={ROLE.lyceum} at={shifts + s(0.3)} out={soFor} reveal="fade" dur={0.4}>
        reviewed
      </Text>
      <Text x={DRIFT_X} y={WAVE.line + 50} size={26} color={ROLE.wrong} at={reviewed} out={soFor} reveal="fade" dur={0.4}>
        animation
      </Text>

      {/* State C: one person owns narration and the final render; everyone else sends pull requests. */}
      <Pill x={YOU.cx} y={YOU.cy + YOU.h / 2 + 108} text="narration and final render" color={ROLE.you} at={own} size={28} />
      <Svg>
        <Arrow
          from={[MATE.cx - MATE.w / 2 - 16, youRepoMidY + 30]}
          to={[YOU.cx + YOU.w / 2 + 16, youRepoMidY + 30]}
          bend={50}
          at={sends}
          dur={0.7}
          color={ROLE.teammate}
          width={4}
        />
      </Svg>
      <Text x={(YOU.cx + MATE.cx) / 2} y={youRepoMidY - 40} size={30} color={ROLE.teammate} at={pulls} reveal="fade" dur={0.5}>
        pull request
      </Text>
    </>
  );
};
