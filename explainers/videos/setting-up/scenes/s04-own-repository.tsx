import React from "react";
import { Arrow, C, Line, Node, Pill, Svg, Text, prog, track, useScene } from "#kit";
import { FileTree, Panel, ROLE, TREE, panelLineY, treeRowX, treeRowY } from "./shared";

// Or a repository of its own: when the videos span several repositories, a whole product, or an
// audience beyond the contributors. Its project guide then points at the other repositories by path,
// so every author checks them out side by side, and the guide says so.

const PANEL = { x: 1040, y: 300, w: 800, size: 28 } as const;
const lineY = (i: number) => panelLineY(i, PANEL.y, PANEL.size);
/** Panel height for `n` lines (title bar, padding, lines), as shared.tsx computes it. */
const panelHeight = (n: number) => 54 + 26 * 2 + n * PANEL.size * 1.6;

/** The tree's row text width, for sliding a box onto its row. */
const nameWidth = (name: string) => name.length * TREE.size * 0.6;

type Pos = { x: number; y: number; w: number; h: number };

/** The repositories: where each sits in the row, after shifting left, and on its tree row. */
const REPOS: { name: string; color: string; size: number; row: number; wide: Pos; left: Pos }[] = [
  { name: "api/", color: ROLE.app, size: 38, row: 1, wide: { x: 560, y: 760, w: 300, h: 120 }, left: { x: 240, y: 680, w: 200, h: 100 } },
  { name: "web/", color: ROLE.app, size: 38, row: 2, wide: { x: 960, y: 760, w: 300, h: 120 }, left: { x: 480, y: 680, w: 200, h: 100 } },
  { name: "mobile/", color: ROLE.app, size: 38, row: 3, wide: { x: 1360, y: 760, w: 300, h: 120 }, left: { x: 720, y: 680, w: 200, h: 100 } },
  {
    name: "product-explainers/",
    color: ROLE.lyceum,
    size: 34,
    row: 4,
    wide: { x: 960, y: 400, w: 460, h: 120 },
    left: { x: 480, y: 420, w: 420, h: 100 },
  },
];
const onRow = (r: (typeof REPOS)[number]): Pos => ({
  x: treeRowX(1) + nameWidth(r.name) / 2,
  y: treeRowY(r.row),
  w: nameWidth(r.name) + 32,
  h: 58,
});

const AUDIENCE = [
  { text: "new hires", phrase: "someone other than", color: C.text },
  { text: "customers", phrase: "code's contributors", color: C.text },
  { text: "you, learning", phrase: "your own learning", color: ROLE.you },
] as const;

export const OwnRepository: React.FC = () => {
  const { frame, fps, cue } = useScene();
  const s = (n: number) => Math.round(n * fps);

  const own = cue("repository of their own");
  const span = cue("span several repositories");
  const product = cue("or a whole product");
  const then = cue("Then the project");
  const guide = cue("project guide");
  const others = cue("other repositories");
  const byPath = cue("by path");
  const checked = cue("checked out");
  const layout = cue("same layout");
  const write = cue("Write that down");

  // Where each repository box is: the row, shifted left for the panel, then slid onto its tree row.
  const pos = (r: (typeof REPOS)[number]): Pos => {
    const row = onRow(r);
    const k = (f: (p: Pos) => number) => track(frame, fps, [[0, f(r.wide)], [guide, f(r.left)], [checked, f(row)]], 0.8);
    return { x: k((p) => p.x), y: k((p) => p.y), w: k((p) => p.w), h: k((p) => p.h) };
  };
  const boxes = REPOS.map(pos);
  const hub = boxes[3];
  const boxAt = [0, s(0.2), s(0.4), own];
  // Boxes fade as they land on their rows, and the rows take over.
  const boxFade = 1 - prog(frame, checked + s(0.5), 0.45, fps);
  const rowAt = (i: number) => checked + s(0.55 + i * 0.12);

  // The arrows leave the hub's bottom edge, spread across it.
  const spread = track(frame, fps, [[0, 150], [guide, 120]], 0.8);

  const illustrative = {
    x: track(frame, fps, [[0, 1540], [guide, 850], [checked, TREE.x]], 0.8),
    y: track(frame, fps, [[0, 760], [guide, 680], [checked, treeRowY(5) + 10]], 0.8),
  };

  const tree = [
    { name: "~/code/", depth: 0, at: checked + s(0.3) },
    ...REPOS.slice(0, 3).map((r, i) => ({ name: r.name, depth: 1, color: r.color, at: rowAt(i) })),
    { name: "product-explainers/", depth: 1, color: ROLE.lyceum, at: rowAt(3) },
  ];

  const writeLine = write + s(0.35);
  const panelH = track(frame, fps, [[0, panelHeight(4)], [write, panelHeight(6)]], 0.5);

  return (
    <>
      {/* The repositories: three for the code, and one for the videos. */}
      {REPOS.map((r, i) => (
        <Node
          key={r.name}
          x={boxes[i].x}
          y={boxes[i].y}
          w={boxes[i].w}
          h={boxes[i].h}
          label={r.name}
          mono
          size={r.size}
          color={r.color}
          at={boxAt[i]}
          opacity={boxFade}
        />
      ))}
      <Text x={illustrative.x} y={illustrative.y} size={26} color={C.dim} italic anchor="left" at={s(0.6)} reveal="fade" dur={0.5}>
        illustrative
      </Text>

      {/* One set of videos spanning all three. */}
      <Svg>
        {REPOS.slice(0, 3).map((r, i) => (
          <Arrow
            key={r.name}
            from={[hub.x + (i - 1) * spread, hub.y + hub.h / 2 + 8]}
            to={[boxes[i].x, boxes[i].y - boxes[i].h / 2 - 10]}
            at={span + s(i * 0.25)}
            out={checked}
            dur={0.5}
            color={ROLE.lyceum}
            width={3}
          />
        ))}
      </Svg>

      {/* Or a whole product. */}
      <Svg>
        <Line from={[410, 830]} to={[410, 850]} at={product} out={then} dur={0.2} color={C.dim} width={2} />
        <Line from={[410, 850]} to={[1510, 850]} at={product + s(0.15)} out={then} dur={0.5} color={C.dim} width={2} />
        <Line from={[1510, 830]} to={[1510, 850]} at={product + s(0.6)} out={then} dur={0.2} color={C.dim} width={2} />
      </Svg>
      <Text x={960} y={895} size={32} color={C.dim} italic at={product + s(0.4)} out={then} reveal="fade" dur={0.5}>
        one product
      </Text>

      {/* Or for someone beyond the code's contributors. */}
      {AUDIENCE.map((a, i) => (
        <Pill key={a.text} x={1290} y={330 + i * 80} text={a.text} color={a.color} anchor="left" at={cue(a.phrase)} out={then} size={30} />
      ))}

      {/* The hub's guide, pointing at the others by path. */}
      <Svg>
        <Line from={[hub.x + hub.w / 2 + 12, 420]} to={[PANEL.x - 14, 420]} at={guide + s(0.5)} out={checked} dur={0.4} color={ROLE.lyceum} width={2} dashed opacity={0.6} />
      </Svg>
      <Panel
        x={PANEL.x}
        y={PANEL.y}
        w={PANEL.w}
        h={panelH}
        size={PANEL.size}
        title="product-explainers/project.md"
        border={ROLE.lyceum}
        at={guide + s(0.3)}
        lines={[
          { text: "## Ground truth", color: C.gold, bold: true },
          { text: "- ../api/", at: others },
          { text: "- ../web/", at: others + s(0.3) },
          { text: "- ../mobile/", at: others + s(0.6) },
          { text: "", at: writeLine },
          { text: "Check these out side by side in ~/code/.", at: writeLine },
        ]}
        highlight={[
          { lines: [1, 2, 3], at: byPath, out: cue("So every"), color: ROLE.lyceum },
          { lines: [1, 2, 3], at: layout, out: write, color: ROLE.lyceum },
          { lines: [5], at: writeLine + s(0.3) },
        ]}
      />

      {/* Checked out side by side: siblings in one folder. */}
      <FileTree entries={tree} at={checked + s(0.3)} />
      <Svg>
        {REPOS.slice(0, 3).map((r, i) => (
          <Arrow
            key={r.name}
            from={[PANEL.x - 16, lineY(i + 1)]}
            to={[treeRowX(1) + nameWidth(r.name) + 26, treeRowY(r.row)]}
            at={layout + s(0.15 + i * 0.2)}
            out={write}
            dur={0.5}
            color={ROLE.lyceum}
            width={2}
            dashed
            opacity={0.7}
          />
        ))}
      </Svg>
    </>
  );
};
