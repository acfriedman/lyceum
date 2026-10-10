import React from "react";
import { C, FONT, Fade, Line, Svg, mix, prog, useScene } from "#kit";
import { ROLE, STRIP, TALK, Terminal, Waveform, talkX } from "./shared";

// Three steps, then the callback: a line in the frontmatter, the take in the recordings folder, and
// `lyceum narrate`; then the steps clear and the whole talk returns, cut into this video's five scenes,
// each of which lights up in turn.

const LEFT = 160;
const COL = 740;
const RIGHT = 1920 - LEFT - COL;
const HEAD = 120; // top of the steps' numbers, top row
const HEAD3 = 548; // and of step 3
const PANEL = 250; // top of the top row's panels
const MONO = 28;
const PANEL_H = Math.round(MONO * 1.55 * 5 + 44);

const FRONTMATTER = ["---", 'title: "Narrate it yourself"', "captions: burned", "voice: { provider: recorded }", "---"];
const VOICE_LINE = 3;

// The pauses where the take was cut: midway between one scene's end and the next one's start.
const CUTS = TALK.scenes.slice(1).map((s, i) => (TALK.scenes[i].to + s.from) / 2);
const TOP = STRIP.y - STRIP.h / 2;
const BOTTOM = STRIP.y + STRIP.h / 2;
const BRACKET = TOP - 26;

export const ThreeSteps: React.FC = () => {
  const { frame, fps, cue, end } = useScene();
  const s = (seconds: number) => Math.round(seconds * fps);

  const intro = cue("narrate a video yourself");
  const step1 = cue("add one line");
  const saying = cue("saying the voice");
  const recorded = cue("recorded");
  const step2 = cue("Record the whole talk");
  const folder = cue("recordings folder");
  const step3 = cue("run narrate");
  const stepsOut = cue("This video");
  const started = cue("started");
  const take = cue("one take");
  const timed = cue("timed to it");
  // The sweep settles before the scene's closing fade.
  const sweepAt = Math.min(timed + s(0.45), end - s(1.9));

  const stepsGone = frame >= stepsOut + s(0.5);
  const leave = 1 - prog(frame, stepsOut, 0.45, fps);

  // The whole take writes on, left to right.
  const upTo = mix(0, TALK.duration + 1, prog(frame, started - s(1), 1.4, fps));
  const waveIn = frame >= started - s(1);

  // Once the scenes are named, the take dims, and each scene in turn lights, settling bright.
  const dim = prog(frame, timed, 0.5, fps);
  const pulse = (i: number, lead = 0) => {
    const at = sweepAt + s(i * 0.2 + lead);
    return { up: prog(frame, at, 0.25, fps), down: prog(frame, at + s(0.3), 0.45, fps) };
  };
  const sceneOf = (t: number) => TALK.scenes.findIndex((sc) => t >= sc.from && t <= sc.to);
  const level = (t: number) => {
    const base = mix(1, 0.45, dim);
    const i = sceneOf(t);
    if (i < 0) return { o: base, g: 1 };
    const sc = TALK.scenes[i];
    const { up, down } = pulse(i, (0.22 * (t - sc.from)) / (sc.to - sc.from));
    return { o: mix(mix(base, 1, up), 0.9, down), g: 1 + 0.14 * up * (1 - down) };
  };

  return (
    <>
      {/* The steps */}
      {!stepsGone && (
        <div style={{ opacity: leave }}>
          <StepHead n="1" caption="add one line" x={LEFT} y={HEAD} intro={intro} at={step1} />
          <StepHead n="2" caption="record the talk" x={RIGHT} y={HEAD} intro={intro} at={step2} />
          <StepHead n="3" caption="run narrate" x={LEFT} y={HEAD3} intro={intro} at={step3} />

          <Fade x={LEFT} y={PANEL} at={step1} dur={0.5} rise={14}>
            <Panel>
              {FRONTMATTER.map((line, i) => {
                if (i !== VOICE_LINE) return <MonoLine key={i} text={line} />;
                const shown = prog(frame, saying, 0.45, fps);
                const lit = prog(frame, recorded, 0.4, fps);
                return (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      margin: "0 -14px",
                      padding: "0 14px",
                      opacity: shown,
                      transform: `translateX(${(1 - shown) * 16}px)`,
                    }}
                  >
                    {/* The highlight: a gold wash with a bar at its left edge. */}
                    <div style={{ position: "absolute", inset: 0, borderRadius: 6, background: `${ROLE.you}2A`, boxShadow: `inset 4px 0 0 ${ROLE.you}`, opacity: lit }} />
                    <span style={{ position: "relative", color: lit > 0.5 ? ROLE.you : C.dim }}>voice:</span>
                    <span style={{ position: "relative", color: C.text }}> {"{ provider: recorded }"}</span>
                  </div>
                );
              })}
            </Panel>
          </Fade>

          <Fade x={RIGHT} y={PANEL} at={step2} dur={0.5} rise={14}>
            <Panel>
              <MonoLine text="videos/your-own-voice/" color={C.text} />
              <TreeLine branch="├── " name="script.md" />
              {[
                { branch: "└── ", name: "recordings/", at: folder },
                { branch: "    └── ", name: "_talk.m4a", at: folder + s(0.35), color: ROLE.you },
              ].map((row) => (
                <div key={row.name} style={{ opacity: prog(frame, row.at, 0.4, fps), transform: `translateX(${(1 - prog(frame, row.at, 0.4, fps)) * 16}px)` }}>
                  <TreeLine branch={row.branch} name={row.name} color={row.color} />
                </div>
              ))}
            </Panel>
          </Fade>

          <Terminal
            x={LEFT}
            y={HEAD3 + 136}
            w={1920 - 2 * LEFT}
            at={step3}
            lines={[
              { text: "$ npx lyceum narrate your-own-voice", at: step3 + s(0.15) },
              { text: "  aligning videos/your-own-voice/recordings/_talk.m4a against the script…", at: step3 + s(1.1), color: C.dim },
            ]}
          />
        </div>
      )}

      {/* The take, whole again */}
      {waveIn && (
        <>
          <Fade x={STRIP.x} y={BOTTOM + 34} at={started - s(1)} dur={0.5}>
            <div style={{ fontFamily: FONT.mono, fontSize: 26, color: ROLE.muted, whiteSpace: "nowrap" }}>recordings/_talk.m4a</div>
          </Fade>
          <Svg>
            <line x1={STRIP.x} x2={STRIP.x + STRIP.w} y1={STRIP.y} y2={STRIP.y} stroke={C.faint} strokeWidth={2} opacity={prog(frame, started - s(1), 0.4, fps)} />
            <Waveform upTo={upTo} opacity={(t) => level(t).o} gain={(t) => level(t).g} />
            {CUTS.map((t, i) => (
              <Line key={i} from={[talkX(t), TOP - 6]} to={[talkX(t), BOTTOM + 6]} at={take + s(i * 0.12)} dur={0.4} color={ROLE.cut} width={3} />
            ))}
            {TALK.scenes.map((sc, i) => {
              const at = timed + s(i * 0.08);
              if (frame < at) return null;
              const { up, down } = pulse(i, 0.11);
              const a = talkX(sc.from) + 6;
              const b = talkX(sc.to) - 6;
              const o = prog(frame, at, 0.5, fps) * mix(0.7, 1, up);
              const stroke = up * (1 - down) > 0.5 ? ROLE.you : C.dim;
              return (
                <g key={sc.id} opacity={o} stroke={stroke} strokeWidth={2} fill="none">
                  <path d={`M ${a} ${BRACKET + 10} V ${BRACKET} H ${b} V ${BRACKET + 10}`} />
                </g>
              );
            })}
          </Svg>
          {TALK.scenes.map((sc, i) => {
            const { up, down } = pulse(i, 0.11);
            const glow = up * (1 - down);
            const label = String(i + 1).padStart(2, "0");
            return (
              <Fade key={sc.id} x={(talkX(sc.from) + talkX(sc.to)) / 2} y={BRACKET - 36} anchor="center" at={timed + s(i * 0.08)} dur={0.5} rise={18}>
                <div style={{ position: "relative", fontFamily: FONT.mono, fontSize: 34, whiteSpace: "nowrap" }}>
                  <span style={{ color: C.text, opacity: mix(0.6, 1, up) * (1 - glow) }}>{label}</span>
                  <span style={{ position: "absolute", left: 0, top: 0, color: ROLE.you, opacity: glow }}>{label}</span>
                </div>
              </Fade>
            );
          })}
        </>
      )}
    </>
  );
};

/** A step's big number (shown dim from the start, lit on its cue) and its caption. */
const StepHead: React.FC<{ n: string; caption: string; x: number; y: number; intro: number; at: number }> = ({ n, caption, x, y, intro, at }) => {
  const { frame, fps } = useScene();
  const shown = prog(frame, intro, 0.6, fps);
  const lit = prog(frame, at, 0.45, fps);
  if (shown <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "baseline", gap: 30, whiteSpace: "nowrap" }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 104, lineHeight: 1, color: ROLE.you, opacity: shown * mix(0.28, 1, lit) }}>{n}</div>
      <div style={{ fontFamily: FONT.serif, fontSize: 46, color: C.text, opacity: lit, transform: `translateX(${(1 - lit) * -14}px)` }}>{caption}</div>
    </div>
  );
};

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      width: COL,
      height: PANEL_H,
      borderRadius: 12,
      border: `2px solid ${C.faint}`,
      background: C.surface,
      padding: "22px 30px",
      fontFamily: FONT.mono,
      fontSize: MONO,
      lineHeight: 1.55,
      whiteSpace: "pre",
    }}
  >
    {children}
  </div>
);

/** A frontmatter line: the key dim, the value in text colour. */
const MonoLine: React.FC<{ text: string; color?: string }> = ({ text, color }) => {
  const colon = text.indexOf(":");
  if (color || colon < 0) return <div style={{ color: color ?? C.dim }}>{text}</div>;
  return (
    <div>
      <span style={{ color: C.dim }}>{text.slice(0, colon + 1)}</span>
      <span style={{ color: C.text }}>{text.slice(colon + 1)}</span>
    </div>
  );
};

const TreeLine: React.FC<{ branch: string; name: string; color?: string }> = ({ branch, name, color }) => (
  <div>
    <span style={{ color: C.dim }}>{branch}</span>
    <span style={{ color: color ?? C.text }}>{name}</span>
  </div>
);
