import React from "react";
import { Arrow, C, FONT, Node, Svg, Text, lin, mix, prog, useScene } from "#kit";
import { FileTree, Panel, ROLE, useAppear } from "./shared";

// Last: where viewers find the videos, since dist/ isn't committed. Then the recap: the opening
// repository tree returns, set up properly, and the four decisions tick on beside it.

/** The render folder, on the left. */
const DIST = { x: 440, y: 470, w: 440, h: 100 } as const;
/** The three destinations, fanned out to the right. */
const DEST = { x: 1280, w: 460, h: 90, ys: [290, 470, 650] } as const;
/** The pull request card the third destination grows into. Top-left. */
const CARD = { x: 900, y: 180, w: 860, h: 490 } as const;
const PLAYER = { x: CARD.x + 26, y: CARD.y + 170, w: 512, h: 288 } as const;
/** The project guide, under the render folder. Top-left. */
const GUIDE = { x: 160, y: 650, w: 700, size: 28 } as const;

/** The checklist beside the tree. */
const CHECK = { x: 1100, y0: 360, gap: 100, size: 40 } as const;

/** An embedded video player: a dark 16:9 box, a play triangle and a thin progress bar. */
const Player: React.FC<{ opacity: number; from: number }> = ({ opacity, from }) => {
  const { frame, fps } = useScene();
  if (opacity <= 0) return null;
  const played = 0.08 + 0.3 * lin(frame, from, 4, fps);
  return (
    <div
      style={{
        position: "absolute",
        left: PLAYER.x,
        top: PLAYER.y,
        width: PLAYER.w,
        height: PLAYER.h,
        opacity,
        borderRadius: 10,
        border: `2px solid ${C.faint}`,
        background: "#050507",
        overflow: "hidden",
      }}
    >
      <svg width={PLAYER.w} height={PLAYER.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <circle cx={PLAYER.w / 2} cy={PLAYER.h / 2 - 10} r={44} fill="none" stroke={ROLE.lyceum} strokeWidth={3} opacity={0.7} />
        <path
          d={`M ${PLAYER.w / 2 - 14} ${PLAYER.h / 2 - 34} L ${PLAYER.w / 2 + 24} ${PLAYER.h / 2 - 10} L ${PLAYER.w / 2 - 14} ${PLAYER.h / 2 + 14} Z`}
          fill={ROLE.lyceum}
        />
        <rect x={20} y={PLAYER.h - 26} width={PLAYER.w - 40} height={6} rx={3} fill={C.faint} />
        <rect x={20} y={PLAYER.h - 26} width={(PLAYER.w - 40) * played} height={6} rx={3} fill={ROLE.lyceum} />
      </svg>
    </div>
  );
};

/** The pull request description, zooming out of its destination label. */
const PullRequest: React.FC<{ at: number; out: number }> = ({ at, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out);
  if (frame < at) return null;
  const grow = mix(0.3, 1, prog(frame, at, 0.8, fps));
  const originX = DEST.x;
  const originY = DEST.ys[2];
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${grow})`, transformOrigin: `${originX}px ${originY}px` }}>
      <Panel
        x={CARD.x}
        y={CARD.y}
        w={CARD.w}
        h={CARD.h}
        size={26}
        title="Pull request: Rework the cache"
        at={at}
        out={out}
        border={ROLE.app}
        lines={[
          { text: "Evict by size, not by count.", color: C.dim },
          { text: "The explainer for this change:", color: C.dim },
        ]}
      />
      <Player opacity={o} from={at + Math.round(0.8 * fps)} />
      {/* A few more lines of description beside the player. */}
      <div style={{ position: "absolute", left: PLAYER.x + PLAYER.w + 34, top: PLAYER.y + 14, opacity: o }}>
        {[240, 200, 260, 180, 230, 150].map((w, i) => (
          <div key={i} style={{ width: w, height: 8, borderRadius: 4, background: C.faint, marginBottom: 30 }} />
        ))}
      </div>
    </div>
  );
};

/** One checklist item: a drawn tick, then its label. */
const Tick: React.FC<{ y: number; label: string; at: number }> = ({ y, label, at }) => {
  const { frame, fps } = useScene();
  if (frame < at) return null;
  const draw = prog(frame, at, 0.45, fps);
  const o = prog(frame, at, 0.3, fps);
  const lo = prog(frame, at + Math.round(0.15 * fps), 0.5, fps);
  const pop = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, (frame - at) / (0.5 * fps)));
  const x = CHECK.x;
  return (
    <>
      <svg
        width={60}
        height={60}
        style={{ position: "absolute", left: x - 30, top: y - 30, opacity: o, transform: `scale(${pop})` }}
      >
        <path
          d="M 12 31 L 25 44 L 49 16"
          fill="none"
          stroke={ROLE.agent}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: x + 50,
          top: y,
          transform: `translate(${(1 - lo) * 16}px, -50%)`,
          opacity: lo,
          fontFamily: FONT.serif,
          fontSize: CHECK.size,
          color: C.text,
          whiteSpace: "pre",
        }}
      >
        {label}
      </div>
    </>
  );
};

export const Recap: React.FC = () => {
  const { fps, cue } = useScene();
  const s = (n: number) => Math.round(n * fps);

  const start = cue("decide where");
  const notCommitted = cue("aren't committed");
  const release = cue("Release assets");
  const docs = cue("a documentation site");
  const attached = cue("attached");
  const grow = cue("changes what");
  const write = cue("Write the answer");
  const so = cue("So");
  const own = cue("own small project");
  const beside = cue("beside the code");
  const perRepo = cue("per repository");
  const voice = cue("owns the voice");

  const destinations = [
    { label: "release assets", at: release },
    { label: "a documentation site", at: docs },
    { label: "the pull request", at: attached },
  ];
  const fromPt: [number, number] = [DIST.x + DIST.w / 2 + 16, DIST.y];

  const rowAt = (i: number) => so + s(0.4 + i * 0.18);
  const tree = [
    { name: "your-app/", depth: 0, at: rowAt(0) },
    { name: "src/", depth: 1, color: ROLE.app, at: rowAt(1) },
    { name: "tests/", depth: 1, color: ROLE.app, at: rowAt(2) },
    { name: "package.json", depth: 1, at: rowAt(3) },
    {
      name: "explainers/",
      depth: 1,
      color: ROLE.lyceum,
      at: rowAt(4),
      highlight: { at: own, out: beside + s(1.4), color: ROLE.lyceum },
    },
    {
      name: ".claude/skills/lyceum",
      depth: 1,
      color: ROLE.agent,
      at: rowAt(5),
      tag: "gitignored link",
      highlight: { at: perRepo, out: perRepo + s(1.6), color: ROLE.agent },
    },
  ];

  const checks = [
    { label: "its own project", at: own },
    { label: "beside the code", at: beside },
    { label: "skill linked per repository", at: perRepo },
    { label: "one owner for the voice", at: voice },
  ];

  return (
    <>
      {/* Where the finished renders land: not committed. */}
      <Node x={DIST.x} y={DIST.y} w={DIST.w} h={DIST.h} label="videos/<slug>/dist/" mono size={32} color={ROLE.lyceum} at={start} out={so} />
      <Text x={DIST.x} y={DIST.y + 82} size={30} color={C.dim} italic at={notCommitted} out={so} reveal="fade" dur={0.5}>
        gitignored
      </Text>

      {/* Three places viewers could find them. */}
      <Svg>
        {destinations.map((d, i) => (
          <Arrow
            key={d.label}
            from={fromPt}
            to={[DEST.x - DEST.w / 2 - 14, DEST.ys[i]]}
            bend={i === 0 ? -30 : i === 2 ? 30 : 0}
            at={d.at}
            out={grow}
            dur={0.5}
            color={C.dim}
            width={3}
          />
        ))}
        <Arrow from={fromPt} to={[CARD.x - 14, DIST.y]} at={grow + s(0.5)} out={so} dur={0.4} color={C.dim} width={3} />
      </Svg>
      {destinations.map((d, i) => (
        <Node
          key={d.label}
          x={DEST.x}
          y={DEST.ys[i]}
          w={DEST.w}
          h={DEST.h}
          label={d.label}
          size={34}
          color={i === 2 ? ROLE.app : C.dim}
          at={d.at + s(0.3)}
          out={grow}
        />
      ))}

      {/* The pull request it explains, with the video embedded. */}
      <PullRequest at={grow} out={so} />
      <Text x={CARD.x + CARD.w / 2} y={CARD.y + CARD.h + 36} size={28} color={C.dim} italic at={grow + s(0.6)} out={so} reveal="fade" dur={0.5}>
        illustrative
      </Text>

      {/* The answer, written down in the project guide. */}
      <Panel
        x={GUIDE.x}
        y={GUIDE.y}
        w={GUIDE.w}
        size={GUIDE.size}
        title="explainers/project.md"
        at={write}
        out={so}
        border={ROLE.lyceum}
        lines={[
          { text: "## Delivery", color: C.gold, bold: true },
          { text: "Attach the video to the pull request.", at: write + s(0.5) },
        ]}
      />
      <Text x={GUIDE.x + GUIDE.w / 2} y={GUIDE.y + 54 + 52 + 2 * GUIDE.size * 1.6 + 36} size={28} color={C.dim} italic at={write + s(0.6)} out={so} reveal="fade" dur={0.5}>
        example
      </Text>

      {/* So: the opening tree, set up properly, and the four decisions. */}
      <FileTree entries={tree} at={so + s(0.3)} />
      {checks.map((c, i) => (
        <Tick key={c.label} y={CHECK.y0 + i * CHECK.gap} label={c.label} at={c.at} />
      ))}
    </>
  );
};
