import React from "react";
import { C, FONT, Fade, Svg, Text, lin, mix, prog, useScene } from "#kit";
import { ROLE, Waveform, clipOf } from "./shared";

// Written to be read aloud: the narration as one dense paragraph, with a breath gauge draining as it's
// read, greys out; the same words return as a list, a line per breath, each ending in a pause mark that
// lights when Andrew pauses there; then this scene's real waveform draws beneath, its pauses ticked.

// This scene draws its own audio, as it plays: seconds of its clip, from 0.
const SPAN = { from: 0, to: clipOf("read-aloud").duration };

/** The script's lines, with the phrase each starts on and the phrase it ends on. */
const LINES = [
  { text: "Reading a script out loud is harder than it sounds.", last: "harder than it sounds" },
  { text: "Long sentences run out of breath,", last: "out of breath" },
  { text: "and the words start to sound read.", last: "sound read" },
  { text: "So I wrote this as short lines, like bullet points.", last: "like bullet points" },
  { text: "Each line is one breath, and I pause at the end of it.", last: "end of it" },
  { text: "I'm still reading every word,", last: "every word" },
  { text: "but it sounds less like reading, and a little bit more like talking.", last: "more like talking" },
];
const FIRST = ["Reading a script", "Long sentences", "and the words", "So I wrote", "Each line", "I'm still", "but it sounds"];

const LIST = { x: 260, y: 236, pitch: 56, size: 36 };
const WAVE = { x: 260, w: 1400, y: 770, h: 120 };

/** Two short bars, ‖: the pause at a line's end. */
const PauseMark: React.FC<{ lit: number; opacity: number }> = ({ lit, opacity }) => (
  <div style={{ display: "flex", gap: 6, marginLeft: 22, opacity }}>
    {[0, 1].map((i) => (
      <div key={i} style={{ position: "relative", width: 5, height: 30, borderRadius: 2, background: C.faint }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 2,
            background: ROLE.you,
            opacity: lit,
            boxShadow: `0 0 ${12 * lit}px ${ROLE.you}`,
          }}
        />
      </div>
    ))}
  </div>
);

export const ReadAloud: React.FC = () => {
  const { frame, fps, cue, at } = useScene();
  const clip = (f: number) => SPAN.from + (f - at(0)) / fps;

  const reading = cue("Reading a script");
  const long = cue("Long sentences");
  const soundRead = cue("sound read");
  const soundReadEnd = cue("sound read", { end: true });
  const short = cue("short lines");
  const oneBreath = cue("one breath");
  const talking = cue("more like talking");

  const starts = FIRST.map((p) => cue(p));
  const ends = LINES.map((l) => cue(l.last, { end: true }));

  // The paragraph: greys once the words "sound read", gone when the lines arrive.
  const grey = mix(1, 0.4, prog(frame, soundRead, 0.6, fps));
  const breath = 1 - lin(frame, long, (soundReadEnd - long) / fps, fps);
  const empty = 1 - Math.min(1, breath / 0.25);

  // The list writes on line by line, quickly, once the paragraph has faded.
  const listAt = short + Math.round(0.4 * fps);
  const lineAt = (i: number) => listAt + Math.round(i * 0.16 * fps);
  // A line's pause mark lights at its pause: the lines already read light in turn on "one breath",
  // the rest as Andrew reaches the end of each.
  const litAt = (i: number) => Math.max(ends[i], i < 4 ? oneBreath + Math.round(i * 0.22 * fps) : ends[i]);
  // The line being spoken now, once the list is up.
  const current = starts.reduce((n, s, i) => (frame >= s ? i : n), 0);

  // The waveform draws in, left to right, from "I'm still reading" through "more like talking", so it's
  // whole while the last line is said.
  const drawn = prog(frame, cue("I'm still reading"), Math.max(1.1, (talking - cue("I'm still reading")) / fps), fps);
  const upTo = mix(SPAN.from, SPAN.to, drawn);

  return (
    <>
      {/* A paragraph, and a breath running out */}
      <Text x={960} y={232} size={30} color={ROLE.muted} at={reading} out={short} dur={0.6} reveal="fade">
        a paragraph
      </Text>
      <Fade x={960} y={440} anchor="center" at={reading} out={short} dur={0.6}>
        <div
          style={{
            width: 1300,
            padding: "34px 46px",
            borderRadius: 14,
            border: `2px solid ${C.faint}`,
            background: C.surface,
            fontFamily: FONT.serif,
            fontSize: 34,
            lineHeight: 1.5,
            color: C.text,
            opacity: grey,
          }}
        >
          {LINES.map((l) => l.text).join(" ")}
        </div>
      </Fade>
      <Fade x={960} y={668} anchor="center" at={long} out={short} dur={0.5}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontFamily: FONT.serif, fontSize: 30, color: ROLE.muted }}>
          breath
          <div style={{ position: "relative", width: 420, height: 18, borderRadius: 9, background: C.sunken, border: `2px solid ${C.faint}` }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${breath * 100}%`, borderRadius: 9, background: ROLE.you, opacity: 1 - empty }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${breath * 100}%`, borderRadius: 9, background: ROLE.problem, opacity: empty }} />
          </div>
        </div>
      </Fade>

      {/* A line per breath */}
      <Text x={LIST.x} y={LIST.y - 64} size={30} color={ROLE.you} anchor="left" at={listAt} dur={0.5} reveal="fade">
        a line per breath
      </Text>
      {LINES.map((line, i) => {
        const a = lineAt(i);
        if (frame < a) return null;
        const write = prog(frame, a, 0.5, fps);
        const now = i === current && frame >= listAt ? prog(frame, Math.max(listAt, starts[i]), 0.3, fps) * (1 - prog(frame, ends[i], 0.4, fps)) : 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: LIST.x,
              top: LIST.y + i * LIST.pitch,
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              fontFamily: FONT.serif,
              fontSize: LIST.size,
              color: C.text,
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ position: "relative", width: 12, height: 12, borderRadius: 6, marginRight: 24, background: C.dim, opacity: write }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 6, background: ROLE.you, opacity: now }} />
            </div>
            <span style={{ clipPath: `inset(-10px ${100 - 100 * write}% -10px 0)` }}>{line.text}</span>
            <PauseMark lit={prog(frame, litAt(i), 0.3, fps)} opacity={prog(frame, a + Math.round(0.4 * fps), 0.3, fps)} />
          </div>
        );
      })}

      {/* This scene as it was read: the pauses are the gaps */}
      <Svg>
        {drawn > 0 && (
          <>
            <line x1={WAVE.x} x2={WAVE.x + WAVE.w * drawn} y1={WAVE.y} y2={WAVE.y} stroke={C.faint} strokeWidth={2} />
            <Waveform scene="read-aloud" x={WAVE.x} w={WAVE.w} y={WAVE.y} h={WAVE.h} from={SPAN.from} to={SPAN.to} upTo={upTo} />
          </>
        )}
        {ends.map((f, i) => {
          const t = clip(f);
          if (upTo < t) return null;
          const px = WAVE.x + ((t - SPAN.from) / (SPAN.to - SPAN.from)) * WAVE.w;
          const o = Math.min(1, (upTo - t) / 0.25);
          return (
            <g key={i} opacity={o}>
              <line x1={px} x2={px} y1={WAVE.y - WAVE.h / 2 - 6} y2={WAVE.y + WAVE.h / 2 + 6} stroke={ROLE.you} strokeWidth={1.5} opacity={0.4} />
              <rect x={px - 6.5} y={WAVE.y - WAVE.h / 2 - 34} width={4.5} height={22} rx={1.5} fill={ROLE.you} />
              <rect x={px + 2} y={WAVE.y - WAVE.h / 2 - 34} width={4.5} height={22} rx={1.5} fill={ROLE.you} />
            </g>
          );
        })}
      </Svg>
      <Text x={WAVE.x} y={WAVE.y + WAVE.h / 2 + 46} size={26} color={ROLE.muted} anchor="left" at={talking} dur={0.5} reveal="fade">
        this scene, as recorded
      </Text>
    </>
  );
};
