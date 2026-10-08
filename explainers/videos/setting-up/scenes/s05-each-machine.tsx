import React from "react";
import { Arrow, Box, C, Line, Node, Pill, Svg, Text, prog, track, useScene } from "#kit";
import { Command, Panel, ROLE, panelLineY } from "./shared";

// Each author sets up their own machine: step 1 links the skill for the coding agent (per user by
// default, which breaks with two projects on different versions, so per repository instead), step 2
// keeps a voice key in an ignored file inside the project.

/** The laptop's screen: everything happens on it. */
const SCREEN = { x: 960, y: 510, w: 1720, h: 780 } as const;
const LEFT = 170;
const CMD_Y = 280;
const OUT_SIZE = 28;
const OUT_Y = [345, 395] as const;

/** The user-level picture. */
const USER = { x: 480, y: 530, w: 560, h: 110 } as const;
const APP = { x: 1380, y: 530, w: 520, h: 110 } as const;
const OTHER = { x: 1380, y: 730, w: 520, h: 110 } as const;

/** The per-repository picture. */
const REPO = { x: 960, y: 665, w: 1400, h: 330 } as const;
const LINK = { x: 600, y: 665, w: 500, h: 110 } as const;
const EXPL = { x: 1360, y: 665, w: 380, h: 110 } as const;

/** Step 2's files. */
const ENV = { x: 260, y: 450, w: 800, size: 36 } as const;
const IGNORE = { x: 1180, y: 450, w: 500, size: 36 } as const;

/** Linear blend of two #RRGGBB colours. */
function mixColour(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** One line of the command's real output: a coloured status word, then the rest. */
const OutLine: React.FC<{ y: number; status: string; rest: string; color: string; at: number; out?: number }> = ({ y, status, rest, color, at, out }) => (
  <>
    <Text x={LEFT} y={y} size={OUT_SIZE} font="mono" anchor="left" color={color} at={at} out={out} reveal="fade" dur={0.3}>
      {status}
    </Text>
    <Text x={LEFT + 9 * OUT_SIZE * 0.6} y={y} size={OUT_SIZE} font="mono" anchor="left" color={C.text} at={at} out={out} dur={0.7}>
      {rest}
    </Text>
  </>
);

/** A ✕ that pops in where the blocked link stops. */
const Cross: React.FC<{ x: number; y: number; at: number; out?: number }> = ({ x, y, at, out }) => (
  <Svg>
    <Line from={[x - 16, y - 16]} to={[x + 16, y + 16]} at={at} out={out} dur={0.2} color={ROLE.wrong} width={5} />
    <Line from={[x + 16, y - 16]} to={[x - 16, y + 16]} at={at + 4} out={out} dur={0.2} color={ROLE.wrong} width={5} />
  </Svg>
);

export const EachMachine: React.FC = () => {
  const { frame, fps, cue } = useScene();
  const s = (n: number) => Math.round(n * fps);

  const machine = cue("Each author");
  const own = cue("own machine");
  const first = cue("First");
  const give = cue("give the coding agent");
  const linked = cue("it's linked");
  const account = cue("whole user account");
  const project = cue("one project's copy");
  const two = cue("two projects");
  const versions = cue("different versions");
  const onlyFirst = cue("the agent only sees");
  const soLink = cue("So link it");
  const repo = cue("one repository");
  const instead = cue("instead");
  const outOf = cue("out of version control");
  const points = cue("points at your own");
  const second = cue("Second");
  const voiceKey = cue("voice key");
  const keyFile = cue("key file inside");
  const makeSure = cue("make sure");
  const ignores = cue("ignores it");

  const step1Dim = track(frame, fps, [[0, 1], [second, 0.35]]);
  const border = mixColour(C.faint, ROLE.lyceum, frame < keyFile ? 0 : prog(frame, keyFile, 0.6, fps));

  // Where the blocked link from the user's skill folder gives up, short of other-app.
  const blockFrom: [number, number] = [USER.x + USER.w / 2, USER.y + 40];
  const blockTo: [number, number] = [975, 650];

  return (
    <>
      {/* The author's laptop. */}
      <Svg>
        <Box x={SCREEN.x} y={SCREEN.y} w={SCREEN.w} h={SCREEN.h} r={26} at={machine} dur={1.2} color={C.faint} width={3} />
        <Box x={960} y={926} w={1760} h={24} r={10} at={machine + s(0.6)} dur={0.8} color={C.faint} width={3} />
        <Line from={[860, 914]} to={[1060, 914]} at={machine + s(1)} dur={0.5} color={C.faint} width={3} />
      </Svg>
      <Text x={1770} y={165} size={28} color={C.dim} italic anchor="right" at={own} reveal="fade" dur={0.6}>
        your machine
      </Text>

      {/* Step 1: the skill. */}
      <div style={{ position: "absolute", inset: 0, opacity: step1Dim }}>
        <Text x={LEFT} y={190} size={44} color={ROLE.agent} anchor="left" at={first} dur={0.6}>
          {"1   the skill"}
        </Text>
      </div>

      <Command x={LEFT} y={CMD_Y} text="npx lyceum skill link" at={give} out={soLink} />
      <OutLine
        y={OUT_Y[0]}
        status="linked"
        color={ROLE.agent}
        rest="~/.claude/skills/lyceum → …/explainers/node_modules/lyceum/skills/lyceum"
        at={linked}
        out={soLink}
      />

      {/* Linked for the whole user account, pointing at one project's copy. */}
      <Node x={USER.x} y={USER.y} w={USER.w} h={USER.h} label="~/.claude/skills/lyceum" mono size={32} color={ROLE.agent} at={account} out={soLink} />
      <Text x={USER.x} y={USER.y + USER.h / 2 + 34} size={28} color={C.dim} italic at={account + s(0.3)} out={soLink} reveal="fade" dur={0.5}>
        your user account
      </Text>
      <Node x={APP.x} y={APP.y} w={APP.w} h={APP.h} label="your-app/explainers" mono size={32} color={ROLE.lyceum} at={project} out={soLink} />
      <Svg>
        <Arrow from={[USER.x + USER.w / 2 + 12, USER.y]} to={[APP.x - APP.w / 2 - 12, APP.y]} at={project + s(0.2)} out={soLink} dur={0.6} color={ROLE.agent} width={4} />
      </Svg>

      {/* A second project, on a newer Lyceum: its link attempt is skipped. */}
      <Node x={OTHER.x} y={OTHER.y} w={OTHER.w} h={OTHER.h} label="other-app/explainers" mono size={32} color={ROLE.lyceum} at={two} out={soLink} />
      <Pill x={OTHER.x} y={OTHER.y + OTHER.h / 2 + 36} text="newer Lyceum" color={ROLE.lyceum} size={26} at={versions} out={soLink} />
      <OutLine
        y={OUT_Y[1]}
        status="skipped"
        color={ROLE.wrong}
        rest="~/.claude/skills/lyceum already exists (…); remove it to relink"
        at={onlyFirst}
        out={soLink}
      />
      <Text x={LEFT + 73 * OUT_SIZE * 0.6} y={OUT_Y[1]} size={28} color={C.dim} italic anchor="left" at={onlyFirst + s(0.6)} out={soLink} reveal="fade" dur={0.5}>
        in other-app
      </Text>
      <Svg>
        <Arrow from={blockFrom} to={blockTo} at={onlyFirst + s(0.3)} out={soLink} dur={0.6} color={ROLE.wrong} width={4} dashed head={false} />
      </Svg>
      <Cross x={blockTo[0] + 22} y={blockTo[1] + 11} at={onlyFirst + s(0.9)} out={soLink} />

      {/* Per repository instead. */}
      <Command x={LEFT} y={CMD_Y} text="npx lyceum skill link --project .." at={soLink + s(0.5)} out={second} />
      <OutLine
        y={OUT_Y[0]}
        status="linked"
        color={ROLE.agent}
        rest="…/your-app/.claude/skills/lyceum → …/explainers/node_modules/lyceum/skills/lyceum"
        at={instead}
        out={second}
      />

      <Svg>
        <Box x={REPO.x} y={REPO.y} w={REPO.w} h={REPO.h} r={22} at={repo} out={second} dur={0.9} color={C.dim} width={2} dashed />
      </Svg>
      <Text x={REPO.x - REPO.w / 2 + 34} y={REPO.y - REPO.h / 2 + 40} size={32} font="mono" weight={600} anchor="left" at={repo} out={second} dur={0.5}>
        your-app/
      </Text>
      <Node x={LINK.x} y={LINK.y} w={LINK.w} h={LINK.h} label=".claude/skills/lyceum" mono size={32} color={ROLE.agent} at={repo + s(0.3)} out={second} />
      <Node x={EXPL.x} y={EXPL.y} w={EXPL.w} h={EXPL.h} label="explainers/" mono size={32} color={ROLE.lyceum} at={repo + s(0.5)} out={second} />
      <Svg>
        <Arrow from={[LINK.x + LINK.w / 2 + 12, LINK.y]} to={[EXPL.x - EXPL.w / 2 - 12, EXPL.y]} at={instead + s(0.2)} out={second} dur={0.6} color={ROLE.agent} width={4} />
      </Svg>
      <Pill x={LINK.x} y={LINK.y + LINK.h / 2 + 40} text="gitignored" color={ROLE.ignored} size={26} at={outOf} out={second} />
      <Text x={1010} y={LINK.y + LINK.h / 2 + 40} size={28} color={C.dim} italic at={points} out={second} reveal="fade" dur={0.5}>
        absolute path into your install
      </Text>

      {/* Step 2: a voice key. */}
      <Text x={LEFT} y={CMD_Y} size={44} color={ROLE.command} anchor="left" at={second} dur={0.6}>
        {"2   a voice key"}
      </Text>
      <Panel
        x={ENV.x}
        y={ENV.y}
        w={ENV.w}
        size={ENV.size}
        title="explainers/.env"
        at={voiceKey}
        border={border}
        lines={[{ text: "OPENAI_KEY=sk-••••••••••••" }]}
      />
      <Text x={ENV.x + ENV.w / 2} y={ENV.y + 214} size={28} color={ROLE.lyceum} italic at={keyFile + s(0.3)} reveal="fade" dur={0.5}>
        inside the project
      </Text>
      <Panel
        x={IGNORE.x}
        y={IGNORE.y}
        w={IGNORE.w}
        size={IGNORE.size}
        title="explainers/.gitignore"
        at={makeSure}
        lines={[{ text: ".env", color: C.dim }]}
        highlight={[{ lines: [0], at: ignores, color: ROLE.ignored }]}
      />
      <Pill x={ENV.x + ENV.w / 2} y={ENV.y + 290} text="ignored" color={ROLE.ignored} size={30} at={ignores} />
    </>
  );
};
