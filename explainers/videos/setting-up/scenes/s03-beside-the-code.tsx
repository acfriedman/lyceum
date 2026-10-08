import React from "react";
import { Arrow, C, FONT, Line, Pill, Svg, Text, prog, useScene } from "#kit";
import { Command, FileTree, Panel, ROLE, TREE, treeRowX, treeRowY, useAppear } from "./shared";

// One codebase, one team: put explainers/ in the same repository and treat it like documentation.
// The agent's ground truth sits next door at the same commit; staleness is a diff that `lyceum stale`
// reads from the history; the committed
// part is light; the cost is a little noise in pull requests.

const RIGHT = 900;
const MONO_W = TREE.size * 0.6;

/** The end of a tree row's name, for pointing at it. */
const nameEnd = (depth: number, name: string) => treeRowX(depth) + name.length * MONO_W;

/** One commit in `lyceum stale`'s output, indented under its video: a dim hash, then the subject. */
const LogLine: React.FC<{ y: number; hash: string; subject: string; at: number; out: number }> = ({ y, hash, subject, at, out }) => {
  const o = useAppear(at, out, 0.4);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: RIGHT + 34 + 2 * MONO_W,
        top: y,
        transform: "translate(0, -50%)",
        opacity: o,
        fontFamily: FONT.mono,
        fontSize: 30,
        whiteSpace: "pre",
        color: C.text,
      }}
    >
      <span style={{ color: C.yellow }}>{hash}</span>
      {"  "}
      {subject}
    </div>
  );
};

const BAR = { x: RIGHT, y: 380, w: 560, h: 56 } as const;

/** The committed size of a video: a track that appears, then a fill that grows in. */
const SizeBar: React.FC<{ at: number; grow: number; out: number }> = ({ at, grow, out }) => {
  const { frame, fps } = useScene();
  const o = useAppear(at, out);
  if (o <= 0) return null;
  const fill = frame < grow ? 0 : prog(frame, grow, 1.2, fps);
  return (
    <div style={{ position: "absolute", left: BAR.x, top: BAR.y, width: BAR.w, height: BAR.h, opacity: o }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 10, border: `2px solid ${C.faint}` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: BAR.w * fill,
          borderRadius: 10,
          background: ROLE.lyceum,
          opacity: 0.8,
        }}
      />
    </div>
  );
};

/** A greyed-out folder name, struck through: present on disk, never committed. */
const Ignored: React.FC<{ x: number; y: number; text: string; at: number; out: number }> = ({ x, y, text, at, out }) => {
  const o = useAppear(at, out);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(0, -50%)",
        opacity: o * 0.6,
        fontFamily: FONT.mono,
        fontSize: 34,
        fontWeight: 600,
        color: ROLE.ignored,
        textDecoration: "line-through",
        whiteSpace: "pre",
      }}
    >
      {text}
    </div>
  );
};

export const BesideTheCode: React.FC = () => {
  const { fps, cue } = useScene();
  const s = (n: number) => Math.round(n * fps);

  const codebase = cue("one codebase");
  const thatFolder = cue("that folder");
  const likeDocs = cue("like documentation");
  const ground = cue("ground truth");
  const nextDoor = cue("right next door");
  const commit = cue("same commit");
  const checkout = cue("any checkout");
  const spotting = cue("Spotting");
  const diff = cue("a diff");
  const lists = cue("each script lists");
  const history = cue("the history shows");
  const changed = cue("has changed");
  const since = cue("since the video");
  const light = cue("it's light");
  const committed = cue("gets committed");
  const scripts = cue("the scripts");
  const kb = cue("a little over");
  const cost = cue("The cost");
  const noise = cue("noise");

  const tree = [
    { name: "your-app/", depth: 0 },
    { name: "src/", depth: 1, color: ROLE.app, highlight: { at: codebase, out: thatFolder, color: ROLE.app } },
    {
      name: "explainers/",
      depth: 1,
      color: ROLE.lyceum,
      highlight: { at: thatFolder, out: ground, color: ROLE.lyceum },
      tag: "like docs/",
      tagAt: likeDocs,
      tagOut: ground,
    },
  ];

  const srcY = treeRowY(1);
  const expY = treeRowY(2);
  const bracketX = 600;
  const chipX = 720;
  const chipY = (srcY + expY) / 2;

  const PM = { y: 250, size: 30 };
  const pmBottom = PM.y + 54 + 52 + 3 * PM.size * 1.6;
  const SC = { y: 200, w: 620, size: 30 };
  const PR = { y: 300, w: 900, size: 28 };
  const prBottom = PR.y + 54 + 52 + 3 * PR.size * 1.6;

  return (
    <>
      <FileTree entries={tree} />

      {/* Beat 2: the agent's ground truth, right next door, at the same commit. */}
      <Panel
        x={RIGHT}
        y={PM.y}
        w={880}
        size={PM.size}
        title="explainers/project.md"
        at={ground}
        out={spotting}
        border={ROLE.lyceum}
        lines={[
          { text: "## Ground truth", color: C.gold, bold: true },
          { text: "The code in ..: this repository,", at: ground + s(0.3) },
          { text: "at the commit you have checked out.", at: ground + s(0.5) },
        ]}
        highlight={[
          { lines: [1], at: nextDoor, out: commit, color: ROLE.app },
          { lines: [2], at: commit, color: ROLE.you },
        ]}
      />
      <Text x={RIGHT + 880} y={pmBottom + 34} size={26} color={C.dim} italic anchor="right" at={ground + s(0.6)} out={spotting} reveal="fade" dur={0.5}>
        example
      </Text>
      <Svg>
        <Arrow
          from={[nameEnd(1, "explainers/") + 26, expY - 16]}
          to={[nameEnd(1, "src/") + 20, srcY]}
          bend={40}
          at={nextDoor}
          out={spotting}
          dur={0.6}
          color={ROLE.lyceum}
          width={4}
        />
        <Line from={[bracketX, srcY - 22]} to={[bracketX, expY + 22]} at={commit} out={light} dur={0.4} color={ROLE.you} width={3} />
        <Line from={[bracketX - 16, srcY - 22]} to={[bracketX, srcY - 22]} at={commit} out={light} dur={0.3} color={ROLE.you} width={3} />
        <Line from={[bracketX - 16, expY + 22]} to={[bracketX, expY + 22]} at={commit} out={light} dur={0.3} color={ROLE.you} width={3} />
        <Line from={[bracketX, chipY]} to={[chipX - 74, chipY]} at={commit + s(0.2)} out={light} dur={0.3} color={ROLE.you} width={3} />
      </Svg>
      <Pill x={chipX} y={chipY} text="a1b2c3d" color={ROLE.you} at={commit + s(0.2)} out={light} size={28} />
      <Text x={chipX} y={chipY + 74} size={26} color={C.dim} italic at={checkout} out={spotting} reveal="fade" dur={0.5}>
        any checkout or worktree
      </Text>

      {/* Beat 3: a stale video is a diff between the script's sources, since its verified commit, and the history. */}
      <Panel
        x={RIGHT}
        y={SC.y}
        w={SC.w}
        size={SC.size}
        title="videos/cache/script.md"
        at={diff}
        out={light}
        lines={[
          { text: "---", color: C.dim },
          { text: "sources:" },
          { text: "  - src/cache/", color: ROLE.app },
          { text: "verified: a1b2c3d" },
          { text: "---", color: C.dim },
        ]}
        highlight={[
          { lines: [2], at: lists, out: since, color: ROLE.app },
          { lines: [3], at: since, color: ROLE.you },
        ]}
      />
      <Pill x={RIGHT + SC.w + 140} y={SC.y + 27} text="may be stale" color={ROLE.you} at={since} out={light} size={28} />
      <Command x={RIGHT} y={600} text="npx lyceum stale cache" cps={40} at={history} out={light} />
      <Text x={RIGHT + 34} y={665} size={30} font="mono" color={C.text} anchor="left" at={changed} out={light} reveal="fade" dur={0.4}>
        cache  stale  2 commits since a1b2c3d
      </Text>
      <LogLine y={720} hash="e4f5a6b" subject="Evict by size, not by count" at={changed + s(0.3)} out={light} />
      <LogLine y={775} hash="9c8d7e6" subject="Rename CacheEntry to Slot" at={changed + s(0.6)} out={light} />
      <Text x={RIGHT + 34} y={838} size={26} color={C.dim} italic anchor="left" at={changed + s(0.9)} out={light} reveal="fade" dur={0.5}>
        illustrative, simplified
      </Text>

      {/* Beat 4: what gets committed is light. */}
      <Text x={RIGHT} y={BAR.y - 44} size={34} font="mono" weight={600} color={ROLE.lyceum} anchor="left" at={committed} out={cost} reveal="fade" dur={0.5}>
        what-is-lyceum
      </Text>
      <SizeBar at={committed} grow={kb} out={cost} />
      <Text x={BAR.x + BAR.w + 30} y={BAR.y + BAR.h / 2} size={36} color={C.text} anchor="left" at={kb + s(0.4)} out={cost} reveal="fade" dur={0.5}>
        132 KB committed
      </Text>
      <Text x={RIGHT} y={BAR.y + BAR.h + 46} size={28} color={C.dim} italic anchor="left" at={scripts} out={cost} reveal="fade" dur={0.5}>
        script, scenes, narration timings
      </Text>
      <Ignored x={RIGHT} y={620} text=".cache/" at={committed + s(1.0)} out={cost} />
      <Ignored x={RIGHT + 200} y={620} text="dist/" at={committed + s(1.2)} out={cost} />
      <Text x={RIGHT + 360} y={620} size={28} color={C.dim} italic anchor="left" at={committed + s(1.4)} out={cost} reveal="fade" dur={0.5}>
        gitignored
      </Text>

      {/* Beat 5: the cost, a little noise in pull requests. */}
      <Panel
        x={RIGHT}
        y={PR.y}
        w={PR.w}
        size={PR.size}
        title="Pull request: Fix cache eviction"
        at={cost}
        lines={[
          { text: "src/cache/evict.ts", color: ROLE.app },
          { text: "src/cache/evict.test.ts", color: ROLE.app, at: cost + s(0.2) },
          { text: "explainers/videos/cache/scenes/s04-eviction.tsx", color: `${ROLE.lyceum}80`, at: noise },
        ]}
      />
      <Text x={RIGHT} y={prBottom + 36} size={26} color={C.dim} italic anchor="left" at={cost + s(0.6)} reveal="fade" dur={0.5}>
        illustrative
      </Text>
      <Text x={RIGHT + PR.w} y={prBottom + 36} size={28} color={ROLE.lyceum} italic anchor="right" at={noise + s(0.3)} reveal="fade" dur={0.5}>
        noise
      </Text>
    </>
  );
};
