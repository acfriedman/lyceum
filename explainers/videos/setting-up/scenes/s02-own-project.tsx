import React from "react";
import { C, FONT, Line, Pill, Svg, Text, prog, useScene } from "#kit";
import { Command, FileTree, Panel, ROLE, TREE, panelLineY, treeRow, treeRowX, treeRowY, useAppear } from "./shared";

// The right shape: `npx lyceum init explainers` gives the videos a small project of their own, with
// its own dependencies, a guide for the agent and a folder for the videos. The app never sees it, and
// in a JavaScript monorepo it stays outside the workspace, the root type check, lint and CI.

const SIZE = 34;
const rowY = (i: number) => treeRowY(i, TREE.y, SIZE);
const rowX = (depth: number) => treeRowX(depth, TREE.x, SIZE);
/** Where a row's name ends, for placing tags after it. */
const nameEnd = (depth: number, name: string) => rowX(depth) + name.length * SIZE * 0.6;

/** init's files, in the order it prints them. */
const CREATED = ["lyceum.config.json", "project.md", "videos/index.ts", "package.json", "tsconfig.json", ".gitignore"] as const;
const FIRST = 4; // the explainers/ row

/** The dashed boundary around explainers/ and its six children. */
const BOUND = {
  left: 228,
  right: rowX(2) + "lyceum.config.json".length * SIZE * 0.6 + 50,
  top: TREE.y + FIRST * treeRow(SIZE) + 3,
  bottom: TREE.y + (FIRST + 7) * treeRow(SIZE) + 6,
};

const PANEL_X = 1080;

/** A dashed rounded rectangle whose outline draws on. (The kit's `Box` with `dashed` draws solid,
 *  since its dash lengths are measured against `pathLength={1}`, and it fades rather than draws.) */
const DashedBox: React.FC<{ left: number; top: number; right: number; bottom: number; at: number; dur: number; color: string }> = ({ left, top, right, bottom, at, dur, color }) => {
  const { frame, fps } = useScene();
  if (frame < at) return null;
  const p = prog(frame, at, dur, fps);
  const rect = { x: left, y: top, width: right - left, height: bottom - top, rx: 18, fill: "none" };
  return (
    <g>
      <defs>
        <mask id="own-project-bound" maskUnits="userSpaceOnUse" x={0} y={0} width={1920} height={1080}>
          <rect {...rect} stroke="#fff" strokeWidth={12} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
        </mask>
      </defs>
      <rect {...rect} stroke={color} strokeWidth={3} strokeDasharray="14 10" mask="url(#own-project-bound)" />
    </g>
  );
};

/** A dim label that glides in from the right and stops short of the boundary, with an "excluded" mark. */
const Excluded: React.FC<{ text: string; y: number; at: number; out: number }> = ({ text, y, at, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out, 0.4);
  if (o <= 0) return null;
  const stop = BOUND.right + 110;
  const x = stop + (1 - prog(frame, at, 1.1, fps)) * 700;
  const mark = frame < at + fps * 0.9 ? 0 : prog(frame, at + Math.round(fps * 0.9), 0.4, fps);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: "translate(0, -50%)",
          fontFamily: FONT.serif,
          fontSize: 34,
          fontStyle: "italic",
          color: ROLE.ignored,
          whiteSpace: "pre",
        }}
      >
        {text}
      </div>
      <div
        style={{
          position: "absolute",
          left: BOUND.right + 30,
          top: y,
          transform: `translate(0, -50%) scale(${0.6 + 0.4 * mark})`,
          opacity: mark * 0.85,
          fontFamily: FONT.serif,
          fontSize: 38,
          color: ROLE.wrong,
        }}
      >
        ✕
      </div>
    </div>
  );
};

export const OwnProject: React.FC = () => {
  const { fps, cue } = useScene();
  const s = (n: number) => Math.round(n * fps);

  const give = cue("give the videos");
  const creates = cue("creates a folder");
  const folder = cue("folder usually");
  const withIts = cue("with its own");
  const deps = cue("its own dependencies");
  const guide = cue("a guide for the agent");
  const videos = cue("folder for the videos");
  const never = cue("never sees");
  const monorepo = cue("JavaScript monorepo");
  const workspace = cue("workspace");
  const typeCheck = cue("root type check");
  const linting = cue("linting");
  const installs = cue("installs");
  const checks = cue("checks itself");

  const childAt = (i: number) => folder + s(0.3 * i);

  const tree = [
    { name: "your-app/", depth: 0 },
    { name: "src/", depth: 1, color: ROLE.app },
    { name: "tests/", depth: 1, color: ROLE.app },
    { name: "package.json", depth: 1 },
    { name: "explainers/", depth: 1, color: ROLE.lyceum, at: creates },
    ...CREATED.map((name, i) => ({
      name,
      depth: 2,
      at: childAt(i),
      highlight:
        name === "package.json"
          ? { at: deps, out: guide, color: ROLE.lyceum }
          : name === "project.md"
            ? { at: guide, out: videos, color: ROLE.lyceum }
            : name === "videos/index.ts"
              ? { at: videos, out: never, color: ROLE.lyceum }
              : undefined,
    })),
  ];

  const pkgRow = FIRST + 1 + CREATED.indexOf("package.json");
  const projectRow = FIRST + 1 + CREATED.indexOf("project.md");
  const videosRow = FIRST + 1 + CREATED.indexOf("videos/index.ts");

  return (
    <>
      <Command x={TREE.x} y={200} text="npx lyceum init explainers" at={give} out={monorepo} />
      <FileTree entries={tree} size={SIZE} at={0} />

      {/* init's real output, line by line as the rows arrive. */}
      <Panel
        x={PANEL_X}
        y={rowY(FIRST) - 40}
        w={600}
        title="terminal"
        size={28}
        at={creates}
        out={withIts}
        lines={CREATED.map((name, i) => ({ text: `  created  ${name}`, color: C.dim, at: childAt(i) }))}
      />

      {/* Its own dependencies. */}
      <Svg>
        <Line
          from={[nameEnd(2, "package.json") + 24, rowY(pkgRow)]}
          to={[PANEL_X - 16, rowY(pkgRow)]}
          at={deps}
          out={never}
          dur={0.5}
          color={ROLE.lyceum}
          width={2}
          dashed
          opacity={0.6}
        />
      </Svg>
      <Panel
        x={PANEL_X}
        y={rowY(pkgRow) - (panelLineY(2, 0, 28))}
        w={760}
        title="explainers/package.json"
        size={28}
        border={ROLE.lyceum}
        at={deps}
        out={never}
        lines={[
          { text: '"imports": { "#kit": "lyceum/kit" },' },
          { text: '"dependencies": {' },
          { text: '  "lyceum": "github:acfriedman/lyceum"', color: ROLE.lyceum },
          { text: "}" },
        ]}
        highlight={[{ lines: [2], at: deps + s(0.5), color: ROLE.lyceum }]}
      />

      {/* A guide for the agent, and a folder for the videos. */}
      <Text x={nameEnd(2, "project.md") + 30} y={rowY(projectRow)} size={30} color={ROLE.lyceum} italic anchor="left" at={guide} out={never} reveal="fade" dur={0.5}>
        audience, ground truth, house rules
      </Text>
      <Text x={nameEnd(2, "videos/index.ts") + 30} y={rowY(videosRow)} size={30} color={ROLE.lyceum} italic anchor="left" at={videos} out={never} reveal="fade" dur={0.5}>
        the videos' registry
      </Text>

      {/* The app never sees any of it. */}
      <Svg>
        <DashedBox left={BOUND.left} top={BOUND.top} right={BOUND.right} bottom={BOUND.bottom} at={never} dur={1.0} color={ROLE.lyceum} />
      </Svg>

      {/* In a JavaScript monorepo: kept out of the root's machinery. */}
      <Text x={nameEnd(0, "your-app/") + 30} y={rowY(0)} size={30} color={C.dim} italic anchor="left" at={monorepo} reveal="fade" dur={0.5}>
        a JavaScript monorepo
      </Text>
      <Excluded text="workspaces" y={rowY(5)} at={workspace} out={installs} />
      <Excluded text="root type check" y={rowY(7)} at={typeCheck} out={installs} />
      <Excluded text="lint and continuous integration" y={rowY(9)} at={linting} out={installs} />

      {/* It installs and checks itself. */}
      <Pill x={BOUND.right + 60} y={rowY(6)} text="npm install" color={ROLE.lyceum} at={installs + s(0.3)} size={30} anchor="left" />
      <Pill x={BOUND.right + 60} y={rowY(8)} text="npx lyceum typecheck" color={ROLE.lyceum} at={checks} size={30} anchor="left" />
    </>
  );
};
