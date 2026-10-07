import React from "react";
import { C, FONT, Pill, Text, mix, prog, useScene } from "#kit";
import { ScriptLine, ScriptPage, SystemDiagram } from "./shared";

// The reveal: this video's own script.md scrolls to this scene's heading; then the script slides away
// for the title, the tagline, the link and, once more, the picture in your head.

const SCRIPT: ScriptLine[] = [
  { text: "---", kind: "meta" },
  { text: 'title: "Lyceum: explain the picture in your head"', kind: "narration" },
  { text: "---", kind: "meta" },
  { text: "## 01 · whiteboard — The picture in your head", kind: "heading" },
  { text: "You understand something well. How a system fits together…", kind: "narration" },
  { text: "", kind: "blank" },
  { text: "## 02 · good-explanations — What the best explanations do", kind: "heading" },
  { text: "The clearest explanations you've ever watched do something simple…", kind: "narration" },
  { text: "", kind: "blank" },
  { text: "## 03 · a-script — It starts as a script", kind: "heading" },
  { text: "With Lyceum you write it instead, as one script in plain text.", kind: "narration" },
  { text: "", kind: "blank" },
  { text: "## 04 · the-loop — Your agent builds it", kind: "heading" },
  { text: "Ask it for a video about your caching layer…", kind: "narration" },
  { text: "", kind: "blank" },
  { text: "## 05 · in-sync — The picture follows the words", kind: "heading" },
  { text: "Every piece of the picture is tied to the words that introduce it…", kind: "narration" },
  { text: "", kind: "blank" },
  { text: "## 06 · for-anyone — Precise, for anyone", kind: "heading" },
  { text: "An engineer can explain a system to a new teammate…", kind: "narration" },
  { text: "", kind: "blank" },
  { text: "## 07 · this-video — This video was a script", kind: "heading" },
  { text: "Everything you just watched started as a script, about four hundred words long.", kind: "narration" },
];

/** A colour `t` of the way from hex `a` to hex `b`. */
function blend(a: string, b: string, t: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(mix(ch(a, i), ch(b, i), t))).join(",")})`;
}

const PAGE = { x: 160, y: 150, w: 1600, h: 720, size: 26 } as const;
/** Scroll that brings the last two lines into view near the page's foot. */
const SCROLL_END = 360;

export const ThisVideo: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const everything = cue("Everything");
  const started = cue("started as a script");
  const words = cue("four hundred words");
  const cents = cue("a few cents");
  const lyceum = cue("Lyceum is free");
  const openSource = cue("open source");
  const install = cue("Install it");
  const ask = cue("ask your agent");
  const picture = cue("the picture in your head");

  // The page scrolls from the top to this scene's heading over about four seconds.
  const scroll = mix(0, SCROLL_END, prog(frame, everything, 4, fps));

  // On "Lyceum is free" the page and its pills slide down and fade.
  const leave = prog(frame, lyceum, 0.45, fps);
  const pageOpacity = 1 - leave;

  // The diagram returns: parts staggered over about a second, then arrows; the dot travels once.
  const step = Math.round(0.33 * fps);
  const dot = frame < picture ? undefined : 2 * prog(frame, picture, 1.5, fps);

  return (
    <>
      {pageOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: pageOpacity, transform: `translateY(${leave * 140}px)` }}>
          <ScriptPage
            x={PAGE.x}
            y={PAGE.y}
            w={PAGE.w}
            h={PAGE.h}
            size={PAGE.size}
            lines={SCRIPT}
            at={0}
            scroll={scroll}
            title="videos/what-is-lyceum/script.md"
            highlight={[{ lines: [21, 22], at: started, color: C.yellow }]}
          />
          <Pill x={1730} y={260} text="≈ 400 words" anchor="right" size={28} at={words} />
          <Pill x={1730} y={330} text="voice: a few cents" anchor="right" size={28} color={C.gold} at={cents} />
        </div>
      )}

      <Text x={960} y={300} size={120} anchor="center" at={lyceum + Math.round(0.35 * fps)} dur={1}>
        Lyceum
      </Text>
      <div
        style={{
          position: "absolute",
          left: 960 - 650,
          top: 400,
          width: 1300,
          textAlign: "center",
          fontFamily: FONT.serif,
          fontSize: 38,
          lineHeight: 1.35,
          color: blend(C.dim, C.text, prog(frame, openSource + Math.round(0.4 * fps), 1, fps)),
          opacity: frame < openSource ? 0 : prog(frame, openSource, 0.6, fps),
          transform: `translateY(${(1 - prog(frame, openSource, 0.6, fps)) * 12}px)`,
        }}
      >
        Explainer videos made of animated, narrated diagrams, written like a screenplay and built by your coding agent.
      </div>
      <Text x={960} y={580} size={30} font="mono" color={C.dim} anchor="center" at={install} reveal="fade">
        github.com/acfriedman/lyceum
      </Text>

      <SystemDiagram
        y={780}
        scale={0.7}
        ats={{ request: ask, cache: ask + step, database: ask + 2 * step }}
        arrowAts={[ask + 3 * step, ask + Math.round(3.5 * step)]}
        dot={dot}
      />
    </>
  );
};
