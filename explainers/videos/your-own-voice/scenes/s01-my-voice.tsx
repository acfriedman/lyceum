import React from "react";
import { C, FONT, Fade, Line, Svg, Text, prog, track, useScene } from "#kit";
import { ROLE, STRIP, TALK, Waveform, clipOf, talkX } from "./shared";

// This voice is mine: the take writes on as Andrew introduces himself, a synthetic voice is named and
// then crossed out, three cards name what a video of your own is for, and the strip zooms in so the
// words of "timed every animation to my words" pin to where they're spoken.

// This scene draws its own audio, as it plays: seconds of its clip, from 0.
const SPAN = { from: 0, to: clipOf("my-voice").duration };
// The take it plays from: the talk, or this scene's own retake.
const TAKE = `recordings/${TALK.scenes.find((s) => s.id === "my-voice")?.retake ?? "_talk.m4a"}`;
const Y = 500;
const H = 200;
const PHRASE = ["timed", "every", "animation", "to", "my", "words"];
const USES = [
  { label: "a talk", cue: "a talk", x: 520 },
  { label: "a demo", cue: "a demo", x: 870 },
  { label: "an update for your team", cue: "an update for your team", x: 1330 },
];

export const MyVoice: React.FC = () => {
  const { frame, fps, cue, at } = useScene();
  // Second of the talk being heard: the clip starts at SPAN.from, after the scene's lead-in.
  const now = SPAN.from + (frame - at(0)) / fps;
  const clip = (f: number) => SPAN.from + (f - at(0)) / fps;

  const name = cue("Andrew");
  const synthetic = cue("A synthetic voice");
  const hearing = cue("you're hearing me");
  const read = cue("I read");
  const timed = cue("timed");
  const ats = PHRASE.map((w) => cue(w, { after: timed - 1 }));

  // The strip zooms onto the phrase as it's spoken, and holds there to the end of the scene.
  const zoom = { from: clip(ats[0]) - 0.9, to: clip(ats.at(-1)!) + 1.4 };
  const from = track(frame, fps, [[0, SPAN.from], [timed - Math.round(0.5 * fps), zoom.from]], 0.8);
  const to = track(frame, fps, [[0, SPAN.to], [timed - Math.round(0.5 * fps), zoom.to]], 0.8);
  const view = { x: STRIP.x, w: STRIP.w, from, to };
  const wordsOut = 0;

  const pulse = 0.55 + 0.45 * Math.sin((frame / fps) * Math.PI * 1.6);
  const strike = prog(frame, hearing, 0.5, fps);
  const loud = read + Math.round(0.8 * fps);

  return (
    <>
      <Text x={STRIP.x} y={250} size={40} color={ROLE.you} anchor="left" at={name} out={synthetic} dur={0.6}>
        Andrew
      </Text>
      <Text x={960} y={250} size={44} color={C.dim} at={synthetic} out={loud} dur={0.5} reveal="fade">
        text-to-speech
      </Text>
      <Svg>
        {strike > 0 && frame < loud + Math.round(0.45 * fps) && (
          <Line from={[800, 252]} to={[800 + 320 * strike, 252]} color={ROLE.problem} width={4} opacity={1 - prog(frame, loud, 0.45, fps)} />
        )}
      </Svg>

      <div style={{ position: "absolute", left: STRIP.x, top: Y + H / 2 + 34, fontFamily: FONT.mono, fontSize: 26, color: C.dim, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, background: ROLE.problem, opacity: pulse }} />
        {TAKE}
      </div>

      <Svg>
        <line x1={STRIP.x} x2={STRIP.x + STRIP.w} y1={Y} y2={Y} stroke={C.faint} strokeWidth={2} />
        <Waveform scene="my-voice" y={Y} h={H} from={from} to={to} upTo={now} />
        {PHRASE.map((word, i) => {
          if (frame < ats[i]) return null;
          const px = talkX(clip(ats[i]), view);
          const o = prog(frame, ats[i], 0.3, fps) * (1 - wordsOut);
          const top = Y - H / 2 - (i % 2 === 0 ? 40 : 100);
          return <line key={word} x1={px} x2={px} y1={top + 14} y2={Y} stroke={C.text} strokeWidth={2} opacity={o * 0.7} />;
        })}
      </Svg>
      {PHRASE.map((word, i) => {
        if (frame < ats[i] || wordsOut >= 1) return null;
        const px = talkX(clip(ats[i]), view);
        const top = Y - H / 2 - (i % 2 === 0 ? 40 : 100);
        return (
          <div
            key={word}
            style={{
              position: "absolute",
              left: px,
              top: top - 30,
              transform: "translateX(-4px)",
              fontFamily: FONT.serif,
              fontSize: 36,
              color: C.text,
              whiteSpace: "nowrap",
              opacity: prog(frame, ats[i], 0.3, fps) * (1 - wordsOut),
            }}
          >
            {word}
          </div>
        );
      })}

      {USES.map((use) => (
        <Fade key={use.label} x={use.x} y={840} anchor="center" at={cue(use.cue)} dur={0.5}>
          <div style={{ padding: "16px 34px", borderRadius: 14, border: `2.5px solid ${ROLE.you}`, background: `${ROLE.you}18`, fontFamily: FONT.serif, fontSize: 40, color: C.text, whiteSpace: "nowrap" }}>
            {use.label}
          </div>
        </Fade>
      ))}
    </>
  );
};
