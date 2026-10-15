import React from "react";
import { C, FONT, Line, Svg, lin, mix, prog, useScene, visibility } from "#kit";
import { ROLE, Waveform, clipOf } from "./shared";

// Timed to my voice: two lanes on one time axis, the words of "I speed up, I slow down, I take a
// breath" in each. A synthetic voice spaces them evenly, an element waiting above each; in Andrew's lane
// they land live, at the real times he says them, over his real waveform. Dashed lines match each word
// of the script to where it was heard, and the elements drop from the even spots to the real ones.

// This scene draws its own audio, as it plays: seconds of its clip, from 0.
const SPAN = { from: 0, to: clipOf("timed-to-you").duration };
const PHRASE = ["I", "speed", "up", "I", "slow", "down", "I", "take", "a", "breath"];
const X0 = 360;
const X1 = 1760;
const TOP = 350; // the synthetic voice's axis
const BOT = 680; // yours
const SLOT = 44; // an element sits this far above its lane's axis
const WORD = 30; // word size
const ROW = 42; // between rows of words under the bottom axis
const MARGIN = 0.3; // seconds of axis either side of the phrase

/** A small element card, centred on `x`, `y`. */
const Element: React.FC<{ x: number; y: number; color: string; opacity?: number; glow?: number }> = ({ x, y, color, opacity = 1, glow = 0 }) =>
  opacity <= 0 ? null : (
    <g opacity={opacity}>
      {glow > 0 && <rect x={x - 22} y={y - 17} width={44} height={34} rx={9} fill="none" stroke={color} strokeWidth={2} opacity={glow} />}
      <rect x={x - 15} y={y - 10} width={30} height={20} rx={5} fill={color} fillOpacity={0.25 + 0.5 * glow} stroke={color} strokeWidth={2.5} />
    </g>
  );

/** A word on a lane, its left edge at its tick. A halo in the canvas colour keeps ticks from running
 *  through it. */
const Word: React.FC<{ x: number; y: number; text: string; color?: string; opacity: number }> = ({ x, y, text, color = C.text, opacity }) =>
  opacity <= 0 ? null : (
    <text
      x={x - 3}
      y={y}
      fontFamily={FONT.serif}
      fontSize={WORD}
      fill={color}
      stroke={C.bg}
      strokeWidth={8}
      strokeLinejoin="round"
      paintOrder="stroke"
      opacity={opacity}
    >
      {text}
    </text>
  );

const Label: React.FC<{ x: number; y: number; text: string; color: string; opacity: number }> = ({ x, y, text, color, opacity }) =>
  opacity <= 0 ? null : (
    <text x={x} y={y} textAnchor="middle" fontFamily={FONT.serif} fontSize={34} fill={color} opacity={opacity}>
      {text}
    </text>
  );

export const TimedToYou: React.FC = () => {
  const { frame, fps, cue, at } = useScene();
  const s = (seconds: number) => Math.round(seconds * fps);
  const sec = (f: number) => (f - at(0)) / fps; // seconds of narration at a frame

  // When Andrew said each word of the phrase: each cue is the rest of the phrase, after the word before.
  const starts: number[] = [];
  PHRASE.forEach((_, i) => {
    starts.push(cue(PHRASE.slice(i).join(" "), i === 0 ? {} : { after: starts[i - 1] }));
  });
  const last = cue("breath", { after: starts[9], end: true });

  // The shared time axis spans the phrase as he said it.
  const T0 = sec(starts[0]) - MARGIN;
  const T1 = sec(last) + MARGIN;
  const xAt = (t: number) => X0 + ((t - T0) / (T1 - T0)) * (X1 - X0);
  const real = starts.map((f) => xAt(sec(f)));
  const even = PHRASE.map((_, i) => mix(real[0], real[9], i / 9));

  // Rows under your axis: each word takes the first row where it clears the word before it.
  const rowEnds: number[] = [];
  const rows = PHRASE.map((w, i) => {
    const width = w.length * WORD * 0.52 + 14;
    let r = 0;
    while (rowEnds[r] !== undefined && real[i] < rowEnds[r]) r++;
    rowEnds[r] = real[i] + width;
    return r;
  });
  const rowY = (r: number) => BOT + 58 + r * ROW;

  // The opening: one element, pinned to the moment its words are spoken.
  const element = cue("each element");
  const spoken = cue("spoken");
  const synthetic = cue("A synthetic voice");
  const tells = cue("tells it");
  const exactly = cue("exactly");
  const openO = visibility(frame, fps, element, synthetic);
  const openDrop = prog(frame, spoken, 0.35, fps);
  const openTick = prog(frame, spoken + s(0.2), 0.3, fps);

  const mine = cue("My voice doesn't");
  const listens = cue("listens to my take");
  const finds = cue("finds every word");
  const wherever = cue("Wherever");
  const lands = cue("that's where its animation lands");
  const landed = cue("lands", { after: lands });

  // The waveform writes on as the take plays; "listens" sweeps along it.
  const talk = (t: number) => SPAN.from + t; // second of the talk for a second of narration
  const now = SPAN.from + sec(frame);
  const sweep = mix(T0, T1, lin(frame, listens, 1.6, fps));
  const sweeping = frame >= listens && frame < listens + s(1.8);
  const waveO = prog(frame, mine, 0.6, fps);

  const topDim = prog(frame, wherever, 0.6, fps);
  const linesFade = prog(frame, landed, 0.6, fps);

  return (
    <Svg>
      {/* Lane labels. */}
      <Label x={200} y={350} text="synthetic" color={ROLE.synthetic} opacity={prog(frame, synthetic, 0.5, fps)} />
      <Label x={200} y={392} text="voice" color={ROLE.synthetic} opacity={prog(frame, synthetic, 0.5, fps)} />
      <Label x={200} y={692} text="you" color={ROLE.you} opacity={prog(frame, mine, 0.5, fps)} />

      {/* Your take's waveform, under the bottom axis. */}
      {waveO > 0 && (
        <g opacity={waveO}>
          <Waveform
            scene="timed-to-you"
            x={X0}
            w={X1 - X0}
            y={BOT}
            h={64}
            from={talk(T0)}
            to={talk(T1)}
            upTo={now}
            opacity={(t) => 0.28 + (sweeping ? 0.6 * Math.exp(-(((t - talk(sweep)) / 0.18) ** 2)) : 0)}
          />
        </g>
      )}

      {/* The time axes. */}
      <Line from={[X0, TOP]} to={[X1, TOP]} at={0} dur={1} color={C.faint} width={2} />
      <Line from={[X0, BOT]} to={[X1, BOT]} at={mine} dur={0.8} color={C.faint} width={2} />

      {/* The opening element: it drops onto the axis as its word is spoken. */}
      {openO > 0 && (
        <g opacity={openO}>
          {openTick > 0 && <line x1={960} x2={960} y1={TOP} y2={TOP + 26 * openTick} stroke={C.text} strokeWidth={2.5} />}
          <Word x={960} y={TOP + 58} text="spoken" opacity={openTick} />
          <Element x={960} y={mix(TOP - SLOT - 110, TOP - SLOT, openDrop)} color={C.text} opacity={prog(frame, element, 0.4, fps)} />
        </g>
      )}

      {/* The synthetic lane: the words evenly spaced, an element waiting above each. */}
      {PHRASE.map((w, i) => {
        const wo = prog(frame, synthetic + s(0.08 * i), 0.35, fps);
        const tick = prog(frame, synthetic + s(0.08 * i + 0.15), 0.3, fps);
        return (
          <g key={`top-${i}`}>
            {tick > 0 && <line x1={even[i]} x2={even[i]} y1={TOP} y2={TOP + 26 * tick} stroke={ROLE.synthetic} strokeWidth={2.5} />}
            <Word x={even[i]} y={TOP + 58} text={w} opacity={wo * mix(1, 0.45, topDim)} />
          </g>
        );
      })}

      {/* Dashed lines from each word of the script to where it was heard. */}
      {PHRASE.map((_, i) => {
        const a = finds + s(0.12 * i);
        if (frame < a) return null;
        return (
          <Line
            key={`match-${i}`}
            from={[even[i] + 6, TOP + 70]}
            to={[real[i], BOT - 4]}
            at={a}
            dur={0.5}
            color={C.dim}
            width={2}
            dashed
            opacity={mix(0.9, 0.35, linesFade)}
          />
        );
      })}

      {/* Your lane: each word lands as it's said. */}
      {PHRASE.map((_, i) => {
        if (frame < starts[i]) return null;
        const y = rowY(rows[i]);
        const tick = prog(frame, starts[i], 0.2, fps);
        const flash = 1 - lin(frame, starts[i], 0.5, fps);
        return (
          <g key={`bot-tick-${i}`}>
            <line x1={real[i]} x2={real[i]} y1={BOT} y2={BOT + (y - 28 - BOT) * tick} stroke={ROLE.you} strokeWidth={2.5} />
            {flash > 0 && <circle cx={real[i]} cy={BOT} r={6 + 10 * (1 - flash)} fill="none" stroke={ROLE.you} strokeWidth={2} opacity={flash} />}
          </g>
        );
      })}
      {PHRASE.map((w, i) =>
        frame < starts[i] ? null : <Word key={`bot-${i}`} x={real[i]} y={rowY(rows[i])} text={w} opacity={prog(frame, starts[i], 0.25, fps)} />,
      )}

      {/* The elements: waiting on the synthetic lane, then each drops to where its word was said. */}
      {PHRASE.map((_, i) => {
        const appear = prog(frame, tells + s(0.06 * i), 0.35, fps);
        if (appear <= 0) return null;
        const beat = exactly + s(0.14 * i);
        const glow = frame < beat ? 0 : Math.min(lin(frame, beat, 0.1, fps), 1 - lin(frame, beat + s(0.1), 0.45, fps));
        const go = lands + s(0.08 * i);
        const fall = lin(frame, go, 0.55, fps);
        const x = mix(even[i], real[i], prog(frame, go, 0.55, fps));
        const bounce = frame < go + s(0.55) ? 0 : 1 - lin(frame, go + s(0.55), 0.35, fps);
        const settle = -12 * Math.sin(Math.PI * (1 - bounce)) * bounce;
        const y = mix(TOP - SLOT, BOT - SLOT, fall * fall) + settle;
        const gold = lin(frame, go + s(0.5), 0.15, fps);
        return (
          <g key={`el-${i}`}>
            <Element x={x} y={y} color={ROLE.synthetic} opacity={appear * (1 - gold)} glow={glow} />
            <Element x={x} y={y} color={ROLE.you} opacity={gold} />
          </g>
        );
      })}
    </Svg>
  );
};
