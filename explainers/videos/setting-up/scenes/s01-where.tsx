import React from "react";
import { Arrow, C, FONT, Line, Pill, Svg, Text, prog, useScene } from "#kit";
import { FileTree, Panel, ROLE, TREE, panelLineY, treeRowX, treeRowY, useAppear } from "./shared";

// Where do the videos go? The tempting answer, adding Lyceum to the app's own dependencies, drags in
// a whole toolchain whose versions can collide with the app's, and a Go or Swift app has no
// dependencies file at all.

const PANEL = { x: 820, y: 240, w: 940, size: 30 } as const;
const lineY = (i: number) => panelLineY(i, PANEL.y, PANEL.size);
const PANEL_BOTTOM = PANEL.y + 54 + 52 + 6 * PANEL.size * 1.6;

/** Lyceum's real dependencies (package.json), in the order the narration names them. */
const CHIPS = [
  { text: "puppeteer-core", x: 950, phrase: "browser driver" },
  { text: "esbuild", x: 1215, phrase: "bundler" },
  { text: "typescript 7", x: 1435, phrase: "type checker" },
  { text: "react 19", x: 1650, phrase: "interface library" },
] as const;
const CHIP_Y = 760;

/** A small script.md page with a question mark: the videos, looking for a home. */
const LooseScript: React.FC<{ at: number; out: number }> = ({ at, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out, 0.8);
  if (o <= 0) return null;
  const drift = (1 - prog(frame, at, 1.2, fps)) * 120;
  const bob = Math.sin((frame - at) / fps * 1.6) * 6;
  return (
    <div style={{ position: "absolute", left: 1250 + drift, top: 380 + bob, opacity: o }}>
      <div style={{ width: 220, height: 280, borderRadius: 12, border: `2px solid ${C.dim}`, background: C.surface, padding: "22px 24px" }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 22, color: C.gold, marginBottom: 18 }}>script.md</div>
        {[150, 170, 120, 165, 140, 90].map((w, i) => (
          <div key={i} style={{ width: w, height: 8, borderRadius: 4, background: C.faint, marginBottom: 16 }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 250, top: 60, fontFamily: FONT.serif, fontSize: 120, color: C.yellow }}>?</div>
    </div>
  );
};

export const Where: React.FC = () => {
  const { fps, cue } = useScene();

  const start = cue("You want");
  const live = cue("where they live");
  const deps = cue("app's dependencies");
  const tool = cue("like any other tool");
  const toolchain = cue("whole toolchain");
  const collide = cue("can collide");
  const go = cue("Go or Swift");
  const noFile = cue("no dependencies file");
  const s = (n: number) => Math.round(n * fps);

  const appTree = [
    { name: "your-app/", depth: 0 },
    { name: "src/", depth: 1, color: ROLE.app },
    { name: "tests/", depth: 1, color: ROLE.app },
    { name: "package.json", depth: 1, highlight: { at: deps, out: go } },
  ];
  const goTree = [
    { name: "your-service/", depth: 0 },
    { name: "cmd/", depth: 1, color: ROLE.app },
    { name: "internal/", depth: 1, color: ROLE.app },
    { name: "go.mod", depth: 1 },
    { name: "main.go", depth: 1 },
  ];

  const chipAts = CHIPS.map((c) => cue(c.phrase));
  const lyceumLine = lineY(4);
  const reactLine = lineY(3);
  const react = CHIPS[3];

  return (
    <>
      <FileTree entries={appTree} at={start} out={go} />
      <FileTree entries={goTree} at={go + s(0.4)} />

      <LooseScript at={start + s(0.3)} out={deps} />

      {/* The tempting answer: one more line in the app's package.json. */}
      <Svg>
        <Arrow
          from={[treeRowX(1) + 12 * TREE.size * 0.6 + 30, treeRowY(3)]}
          to={[PANEL.x - 14, treeRowY(3)]}
          at={deps}
          out={go}
          dur={0.5}
          color={C.dim}
          width={3}
        />
      </Svg>
      <Panel
        x={PANEL.x}
        y={PANEL.y}
        w={PANEL.w}
        size={PANEL.size}
        title="your-app/package.json"
        at={deps}
        out={go}
        lines={[
          { text: "{" },
          { text: '  "name": "your-app",', color: C.dim },
          { text: '  "dependencies": {' },
          { text: '    "react": "^18.3.1",', color: ROLE.app },
          { text: '    "lyceum": "github:acfriedman/lyceum"', color: ROLE.lyceum, at: tool - s(0.6) },
          { text: "  }" },
        ]}
        highlight={[
          { lines: [4], at: tool - s(0.3), out: toolchain, color: ROLE.lyceum },
          { lines: [3], at: collide, color: ROLE.wrong },
        ]}
      />

      {/* What that one line brings with it. */}
      <Svg>
        {CHIPS.map((c, i) => (
          <Line
            key={c.text}
            from={[1080, PANEL_BOTTOM + 8]}
            to={[c.x, CHIP_Y - 26]}
            at={chipAts[i]}
            out={go}
            dur={0.4}
            color={ROLE.lyceum}
            width={2}
            dashed
            opacity={0.6}
          />
        ))}
      </Svg>
      {CHIPS.map((c, i) => (
        <Pill key={c.text} x={c.x} y={CHIP_Y} text={c.text} color={ROLE.lyceum} at={chipAts[i]} out={go} size={26} />
      ))}
      <Text x={1080} y={CHIP_Y + 80} size={30} color={C.dim} italic at={toolchain} out={collide} reveal="fade" dur={0.5}>
        all of Lyceum's dependencies, in your app's tree
      </Text>

      {/* Where the app already has its own version. */}
      <Svg>
        <Arrow from={[PANEL.x + PANEL.w + 8, reactLine]} to={[react.x + 40, CHIP_Y - 28]} bend={-70} at={collide} out={go} dur={0.5} color={ROLE.wrong} width={4} head={false} />
      </Svg>
      <Pill x={react.x} y={CHIP_Y} text={react.text} color={ROLE.wrong} at={collide} out={go} size={26} />
      <Text x={1300} y={CHIP_Y + 90} size={32} color={ROLE.wrong} italic at={collide + s(0.3)} out={go} reveal="fade" dur={0.5}>
        the kit runs on your app's version
      </Text>

      {/* A Go service: nowhere to put the line at all. */}
      <Pill x={1250} y={540} text={'"lyceum": …'} color={ROLE.lyceum} at={go + s(0.6)} out={noFile + s(2.2)} size={30} />
      <Svg>
        <Arrow from={[1090, 540]} to={[760, 540]} at={go + s(0.9)} out={noFile + s(2.2)} dur={0.5} color={C.dim} width={3} dashed />
      </Svg>
      <Text x={1250} y={640} size={34} color={ROLE.wrong} italic at={noFile} reveal="fade" dur={0.5}>
        no package.json to add it to
      </Text>
    </>
  );
};
