import React from "react";
import { C, FONT, Line, Svg, lin, mix, prog, track, useScene, visibility } from "#kit";
import { DIAGRAM, ROLE, SystemDiagram, useAppear, useWordFrames } from "./shared";

// The picture follows the words: each part of the diagram appears on the word that names it, shown on a
// timeline of the narration; an edit to the sentence carries the part with it. Then review: a video
// player, a pin on one moment, a comment, and only that scene rebuilt.

const SENTENCE = "When I say cache, the cache appears. And when I say database, there it is.";
const CACHE_WORD = 3; // the first "cache," (the word the cache box is tied to)
const DATABASE_WORD = 11;

// The word timeline.
const RULE = { x0: 200, x1: 1720, y: 730 } as const;
const WORD_SIZE = 28;
const ROWS = [700, 660, 620]; // baselines, stacked when words crowd together
const INSERTED = "finally";
const SHIFT = 124; // pixels the words after the insertion move right
const CHAR_W = 0.46 * WORD_SIZE; // a generous estimate of a serif character's width
const GAP = 10;

// The diagram (top) and the player (part 2).
const DY = 340;
const PLAYER = { x: 960, y: 440, w: 880, h: 495 } as const;
const SCRUB = { x0: 410, w: 1100, y: 760, h: 14, n: 7, gap: 8 } as const;
const segW = (SCRUB.w - (SCRUB.n - 1) * SCRUB.gap) / SCRUB.n;
const segX = (i: number) => SCRUB.x0 + i * (segW + SCRUB.gap);
const PICKED = 4; // segment 05

const wordWidth = (w: string) => w.length * CHAR_W;

/** Rows for each word so no two overlap, in either the original or the edited layout. */
function assignRows(orig: number[], edited: number[], words: string[], insertAt: number) {
  const taken: [number, number, number][][] = ROWS.map(() => []); // [x0, x1, layout] per row; layout 0 original, 1 edited, 2 both
  const free = (row: number, a: number, b: number, layout: number) =>
    taken[row].every(([x0, x1, l]) => !(l === 2 || layout === 2 || l === layout) || b + GAP <= x0 || a >= x1 + GAP);
  const place = (intervals: [number, number, number][]) => {
    const row = ROWS.findIndex((_, r) => intervals.every(([a, b, l]) => free(r, a, b, l)));
    const r = row < 0 ? ROWS.length - 1 : row;
    taken[r].push(...intervals);
    return r;
  };
  const rows: number[] = [];
  let insertedRow = 0;
  words.forEach((w, i) => {
    if (i === insertAt) insertedRow = place([[edited[i] - SHIFT, edited[i] - SHIFT + wordWidth(INSERTED), 1]]);
    const width = wordWidth(w);
    rows.push(
      orig[i] === edited[i]
        ? place([[orig[i], orig[i] + width, 2]])
        : place([
            [orig[i], orig[i] + width, 0],
            [edited[i], edited[i] + width, 1],
          ]),
    );
  });
  return { rows, insertedRow };
}

export const InSync: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const every = cue("Every piece");
  const whenISay = cue("When I say");
  const cacheF = cue("cache", { after: whenISay });
  const databaseF = cue("database", { after: whenISay });
  const sentenceEnd = cue("there it is", { end: true });
  const edit = cue("Edit a sentence");
  const sentence = cue("sentence", { after: edit });
  const follows = cue("follows it");
  const nothing = cue("Nothing needs retiming");
  const reviewing = cue("Reviewing feels");
  const watch = cue("Watch the video");
  const point = cue("point at a moment");
  const ask = cue("ask for a change");
  const only = cue("Only that scene");

  // ── Part 1: the diagram and the narration's timeline ──
  const { words, frames } = useWordFrames(SENTENCE, whenISay);
  const span = sentenceEnd - whenISay + 0.7 * fps;
  const xOf = (f: number) => RULE.x0 + ((f - whenISay) / span) * (RULE.x1 - RULE.x0);
  const orig = frames.map(xOf);
  const edited = orig.map((x, i) => (i >= CACHE_WORD ? x + SHIFT : x));
  const { rows, insertedRow } = assignRows(orig, edited, words, CACHE_WORD);

  const slide = track(frame, fps, [[0, 0], [sentence, 1]], 0.6);
  const wordX = (i: number) => mix(orig[i], edited[i], slide);
  const timelineO = useAppear(every, reviewing);

  const playheadX = Math.min(RULE.x1, xOf(Math.max(whenISay, Math.min(frame, sentenceEnd))));
  const playheadO = timelineO * visibility(frame, fps, undefined, sentenceEnd + Math.round(0.5 * fps));

  // The word "finally", typed in at the edit.
  const typed = Math.round(lin(frame, sentence, 0.5, fps) * INSERTED.length);
  const caretO = frame < edit ? 0 : prog(frame, edit, 0.3, fps) * visibility(frame, fps, undefined, nothing) * (Math.floor((frame - edit) / (0.4 * fps)) % 2 === 0 || frame >= sentence ? 1 : 0.25);
  const insertedX = orig[CACHE_WORD];

  // A tie from a word up to its box: from the top of the word to the box's bottom edge.
  const tieFrom = (i: number): [number, number] => [wordX(i) + wordWidth(words[i]) * 0.4, ROWS[rows[i]] - WORD_SIZE * 0.8];
  const boxBottom = (part: 0 | 1): [number, number] => [960 + part * DIAGRAM.gap, DY + DIAGRAM.h / 2 + 8];

  // The cache box pulses as the animation follows the edit.
  const pulse = lin(frame, follows, 0.8, fps);
  const pulseO = frame >= follows ? (1 - pulse) * 0.9 : 0;
  const checkO = useAppear(nothing, reviewing, 0.5);

  // ── Part 2: the player, the pin, the comment, one scene rebuilt ──
  const playerO = useAppear(watch, undefined, 0.6);
  const segCentre = segX(PICKED) + segW / 2;
  const scrubX = mix(SCRUB.x0, segCentre, lin(frame, watch, (point - watch) / fps, fps));
  const loop = 2.4 * fps;
  const dot = frame >= watch ? ((Math.min(frame, point) - watch) % loop) / loop * 2 : undefined;
  const pinDrop = prog(frame, point, 0.5, fps);
  const pinO = frame >= point ? Math.min(1, pinDrop * 2) : 0;
  const bubbleO = useAppear(ask, undefined, 0.5);
  const rebuilt = frame >= only ? prog(frame, only, 0.7, fps) : 0;

  return (
    <>
      {/* Part 1 */}
      <SystemDiagram y={DY} ats={{ cache: cacheF, database: databaseF }} arrowAts={[cacheF, databaseF]} out={reviewing} />

      <div style={{ position: "absolute", inset: 0, opacity: timelineO }}>
        <Svg>
          <line x1={RULE.x0} y1={RULE.y} x2={RULE.x1} y2={RULE.y} stroke={C.dim} strokeWidth={3} />
          {/* Ticks under the two words the boxes are tied to. */}
          {([[CACHE_WORD, cacheF, ROLE.cache], [DATABASE_WORD, databaseF, ROLE.database]] as const).map(([i, f, colour]) =>
            frame < f ? null : (
              <line key={i} x1={wordX(i)} y1={RULE.y - 12} x2={wordX(i)} y2={RULE.y + 12} stroke={colour} strokeWidth={4} opacity={prog(frame, f, 0.3, fps)} />
            ),
          )}
          {/* The playhead. */}
          <g opacity={playheadO}>
            <line x1={playheadX} y1={RULE.y - 130} x2={playheadX} y2={RULE.y + 18} stroke={C.yellow} strokeWidth={2} />
            <circle cx={playheadX} cy={RULE.y} r={7} fill={C.yellow} />
          </g>
        </Svg>

        <Svg>
          <Line from={tieFrom(CACHE_WORD)} to={boxBottom(0)} at={cacheF} dur={0.4} color={ROLE.cache} width={2} />
          <Line from={tieFrom(DATABASE_WORD)} to={boxBottom(1)} at={databaseF} dur={0.4} color={ROLE.database} width={2} />
        </Svg>

        {words.map((word, i) => {
          const spoken = frame >= frames[i];
          const next = frames[i + 1] ?? sentenceEnd;
          const current = spoken && frame < next;
          const tied = i === CACHE_WORD ? ROLE.cache : i === DATABASE_WORD ? ROLE.database : undefined;
          const color = current ? C.yellow : spoken ? (tied ?? C.text) : C.faint;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: wordX(i),
                top: ROWS[rows[i]] - WORD_SIZE,
                fontFamily: FONT.serif,
                fontSize: WORD_SIZE,
                lineHeight: `${WORD_SIZE * 1.2}px`,
                whiteSpace: "nowrap",
                color,
              }}
            >
              {word}
            </div>
          );
        })}

        {/* The inserted word, typed with a caret. */}
        <div
          style={{
            position: "absolute",
            left: insertedX,
            top: ROWS[insertedRow] - WORD_SIZE,
            fontFamily: FONT.serif,
            fontSize: WORD_SIZE,
            lineHeight: `${WORD_SIZE * 1.2}px`,
            whiteSpace: "nowrap",
            color: C.yellow,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>{INSERTED.slice(0, typed)}</span>
          <span style={{ display: "inline-block", width: 3, height: WORD_SIZE * 1.05, marginLeft: 2, background: C.yellow, opacity: caretO }} />
        </div>

        <div style={{ position: "absolute", left: RULE.x0, top: RULE.y + 22, fontFamily: FONT.serif, fontStyle: "italic", fontSize: 26, color: C.dim }}>
          narration →
        </div>

        {/* No retiming. */}
        <div style={{ position: "absolute", left: RULE.x1 - 250, top: RULE.y + 30, width: 250, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, opacity: checkO }}>
          <svg width={34} height={34} viewBox="0 0 34 34">
            <path d="M6 18 L14 26 L29 8" fill="none" stroke={ROLE.agent} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: FONT.serif, fontSize: 30, color: ROLE.agent }}>no retiming</span>
        </div>
      </div>

      {pulseO > 0 && (
        <Svg>
          <rect
            x={960 - DIAGRAM.w / 2 - 6 - pulse * 26}
            y={DY - DIAGRAM.h / 2 - 6 - pulse * 26}
            width={DIAGRAM.w + 12 + pulse * 52}
            height={DIAGRAM.h + 12 + pulse * 52}
            rx={14 + pulse * 10}
            fill="none"
            stroke={ROLE.cache}
            strokeWidth={4}
            opacity={pulseO}
          />
        </Svg>
      )}

      {/* Part 2 */}
      {playerO > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: playerO }}>
          <div
            style={{
              position: "absolute",
              left: PLAYER.x - PLAYER.w / 2,
              top: PLAYER.y - PLAYER.h / 2,
              width: PLAYER.w,
              height: PLAYER.h,
              borderRadius: 18,
              border: `2px solid ${C.faint}`,
              background: "#141418",
              transform: `translateY(${(1 - playerO) * 16}px)`,
            }}
          />
          <SystemDiagram y={PLAYER.y} scale={0.55} opacity={0.55} arrowAts={[watch, watch]} dot={dot} />

          <Svg>
            {Array.from({ length: SCRUB.n }, (_, i) => (
              <rect key={i} x={segX(i)} y={SCRUB.y - SCRUB.h / 2} width={segW} height={SCRUB.h} rx={SCRUB.h / 2} fill={C.faint} />
            ))}
            {rebuilt > 0 && (
              <rect x={segX(PICKED)} y={SCRUB.y - SCRUB.h / 2 - 2} width={segW * rebuilt} height={SCRUB.h + 4} rx={(SCRUB.h + 4) / 2} fill={ROLE.agent} />
            )}
            <circle cx={scrubX} cy={SCRUB.y} r={11} fill={C.text} />
          </Svg>

          {Array.from({ length: SCRUB.n }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: segX(i),
                width: segW,
                top: SCRUB.y + 22,
                textAlign: "center",
                fontFamily: FONT.mono,
                fontSize: 26,
                color: i === PICKED && rebuilt > 0 ? mixColour(rebuilt) : C.dim,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
          ))}

          <div
            style={{
              position: "absolute",
              left: segX(PICKED),
              width: segW,
              top: SCRUB.y + 70,
              textAlign: "center",
              fontFamily: FONT.serif,
              fontSize: 32,
              color: ROLE.agent,
              opacity: rebuilt,
            }}
          >
            rebuilt
          </div>

          {/* The pin, dropped on segment 05. */}
          {pinO > 0 && (
            <Svg>
              <g opacity={pinO} transform={`translate(${segCentre}, ${SCRUB.y - 12 - (1 - pinDrop) * 70})`}>
                <path d="M0 0 L-11 -24 A15 15 0 1 1 11 -24 Z" fill={ROLE.you} />
                <circle cx={0} cy={-32} r={6} fill="#141418" />
              </g>
            </Svg>
          )}

          {/* The comment. */}
          {bubbleO > 0 && (
            <div
              style={{
                position: "absolute",
                left: segCentre - 200,
                top: 618,
                width: 400,
                height: 62,
                borderRadius: 14,
                border: `2px solid ${ROLE.you}`,
                background: "#221C14",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT.serif,
                fontSize: 30,
                color: ROLE.you,
                opacity: bubbleO,
                transform: `translateY(${(1 - bubbleO) * 12}px)`,
              }}
            >
              cache a little sooner?
              <div
                style={{
                  position: "absolute",
                  left: 200 - 9,
                  bottom: -10,
                  width: 16,
                  height: 16,
                  background: "#221C14",
                  borderRight: `2px solid ${ROLE.you}`,
                  borderBottom: `2px solid ${ROLE.you}`,
                  transform: "rotate(45deg)",
                }}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};

/** The segment label's colour as it turns from dim to green. */
function mixColour(t: number) {
  const a = [0x8a, 0x8a, 0x8f];
  const b = [0x83, 0xc1, 0x67];
  return `rgb(${a.map((v, i) => Math.round(mix(v, b[i], t))).join(",")})`;
}
