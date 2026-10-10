import React from "react";
import { C, FONT, Line, Svg, lin, mix, prog, track, useScene, visibility } from "#kit";
import { ROLE } from "./shared";

// A person isn't a script: two lanes on one time axis. A synthetic voice's three scenes sit edge to edge
// and light up in turn; the same three scenes in your voice open a pause, take in an unscripted aside and
// stumble, so the lane overflows its tidy edge. Recording the scenes separately instead leaves three
// mismatched clips stitched across visible seams.

const X0 = 360;
const X1 = 1760;
const EDGE = 1840; // nothing is drawn past here: the overflowing lane fades out between X1 and EDGE
const TOP_Y = 380;
const BOT_Y = 700;
const LANE_H = 110;
const SEAM = 6;
const BW = (X1 - X0 - 2 * SEAM) / 3; // a scene block, edge to edge
const CLIP_SEAM = 40;
const CW = (X1 - X0 - 2 * CLIP_SEAM) / 3; // a separately recorded clip
const GAP = 130; // the pause
const UNS = 170; // the unscripted aside
const STUMBLE = { from: 150, w: 180 }; // within scene 2
const SCALES = [0.7, 1.15, 0.85];
const FILLS = [0.1, 0.26, 0.15];
const LABEL_Y = 806; // event labels under the bottom lane

/** A rounded scene block, drawn on left to right as `reveal` goes 0 → 1. `y` is its centre line. */
const Block: React.FC<{ x: number; w: number; y: number; h: number; color: string; fill?: number; reveal?: number; opacity?: number; dashed?: boolean }> = ({
  x,
  w,
  y,
  h,
  color,
  fill = 0.15,
  reveal = 1,
  opacity = 1,
  dashed = false,
}) => {
  const width = w * reveal;
  if (width <= 0.5 || opacity <= 0) return null;
  return (
    <rect
      x={x}
      y={y - h / 2}
      width={width}
      height={h}
      rx={12}
      fill={color}
      fillOpacity={fill}
      stroke={color}
      strokeWidth={3}
      strokeDasharray={dashed ? "12 9" : undefined}
      opacity={opacity}
    />
  );
};

const Label: React.FC<{ x: number; y: number; text: string; color?: string; size?: number; opacity: number; anchor?: "start" | "middle" | "end" }> = ({
  x,
  y,
  text,
  color = C.text,
  size = 30,
  opacity,
  anchor = "middle",
}) =>
  opacity <= 0 ? null : (
    <text x={x} y={y} textAnchor={anchor} fontFamily={FONT.serif} fontSize={size} fill={color} opacity={opacity}>
      {text}
    </text>
  );

export const NotAScript: React.FC = () => {
  const { frame, fps, cue } = useScene();
  const s = (seconds: number) => Math.round(seconds * fps);

  // The opening: an element pinned to the moment its words are spoken.
  const element = cue("each element");
  const spoken = cue("spoken");
  const synthetic = cue("A synthetic voice");
  const markerO = visibility(frame, fps, element, synthetic);
  const tick = prog(frame, spoken, 0.4, fps);

  // The synthetic lane: drawn on, then lit scene by scene.
  const reads = cue("reads the script exactly");
  const sceneBy = cue("scene by scene");
  const pulses = [sceneBy, sceneBy + s(0.45), sceneBy + s(0.9)];
  const pulse = (at: number) => (frame < at ? 0 : Math.min(lin(frame, at, 0.12, fps), 1 - lin(frame, at + s(0.12), 0.55, fps)));

  // Your lane: the same scenes, then a pause, an aside and a stumble push it out of line.
  const person = cue("person");
  const doesnt = cue("doesn't");
  const pause = cue("pause to think");
  const isnt = cue("isn't in the script");
  const trip = cue("trip over a line");
  const recording = cue("recording every scene");
  const separately = cue("separately");
  const stitched = cue("stitched together");

  const g = track(frame, fps, [[0, 0], [pause, GAP], [recording, 0]], 0.8);
  const u = track(frame, fps, [[0, 0], [isnt, UNS], [recording, 0]], 0.8);
  const seam = track(frame, fps, [[0, SEAM], [recording, CLIP_SEAM]], 0.8);
  const bw = track(frame, fps, [[0, BW], [recording, CW]], 0.8);
  const hs = SCALES.map((k) => LANE_H * track(frame, fps, [[0, 1], [separately, k]], 0.7));
  const fills = FILLS.map((f) => track(frame, fps, [[0, 0.15], [separately, f]], 0.7));

  const end1 = X0 + bw + g;
  const ux = end1 + seam;
  const s2x = ux + u + SEAM * Math.min(1, u / UNS);
  const s3x = s2x + bw + seam;
  const xs = [X0, s2x, s3x];
  const bottomReveal = [0, 1, 2].map((i) => prog(frame, doesnt + s(0.2 * i), 0.55, fps));
  const split = g > 1;

  const eventOut = recording;
  const stumbleO = 1 - prog(frame, recording, 0.5, fps);

  return (
    <>
      <Svg>
        <defs>
          <linearGradient id="nas-overflow" gradientUnits="userSpaceOnUse" x1={X1} y1={0} x2={EDGE} y2={0}>
            <stop offset={0} stopColor="white" stopOpacity={1} />
            <stop offset={1} stopColor="white" stopOpacity={0} />
          </linearGradient>
          <mask id="nas-overflow-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={1920} height={1080}>
            <rect x={0} y={0} width={1920} height={1080} fill="url(#nas-overflow)" />
          </mask>
        </defs>

        {/* Lane labels. */}
        <Label x={200} y={370} text="synthetic" size={36} color={ROLE.synthetic} opacity={prog(frame, synthetic, 0.5, fps)} />
        <Label x={200} y={412} text="voice" size={36} color={ROLE.synthetic} opacity={prog(frame, synthetic, 0.5, fps)} />
        <Label x={200} y={712} text="you" size={36} color={ROLE.you} opacity={prog(frame, person, 0.5, fps)} />

        {/* The time axes. */}
        <Line from={[X0, TOP_Y]} to={[X1, TOP_Y]} at={0} dur={1} color={C.faint} width={2} />
        <Line from={[X0, BOT_Y]} to={[X1, BOT_Y]} at={person} dur={0.8} color={C.faint} width={2} />

        {/* The opening marker: an element, pinned to a moment. */}
        {markerO > 0 && (
          <g opacity={markerO}>
            <rect x={680} y={196} width={160} height={58} rx={10} fill={C.surface} stroke={C.text} strokeWidth={2.5} />
            <Label x={760} y={235} text="element" size={32} opacity={1} />
            {tick > 0 && (
              <>
                <line x1={760} x2={760} y1={254} y2={254 + (TOP_Y - 254) * tick} stroke={C.text} strokeWidth={2.5} />
                <circle cx={760} cy={TOP_Y} r={8 * tick} fill={C.text} />
              </>
            )}
          </g>
        )}

        {/* Synthetic lane: three tidy scenes, edge to edge. */}
        {[0, 1, 2].map((i) => {
          const at = reads + s(0.2 * i);
          const x = X0 + i * (BW + SEAM);
          const p = pulse(pulses[i]);
          return (
            <g key={i}>
              <Block x={x} w={BW} y={TOP_Y} h={LANE_H} color={ROLE.synthetic} fill={0.15 + 0.4 * p} reveal={prog(frame, at, 0.55, fps)} />
              {p > 0 && <rect x={x - 4} y={TOP_Y - LANE_H / 2 - 4} width={BW + 8} height={LANE_H + 8} rx={15} fill="none" stroke={ROLE.synthetic} strokeWidth={2} opacity={0.6 * p} />}
              <Label x={x + BW / 2} y={TOP_Y - LANE_H / 2 - 18} text={`scene ${i + 1}`} opacity={prog(frame, at + s(0.3), 0.4, fps)} />
            </g>
          );
        })}

        {/* Where the synthetic scenes end: the lines your lane no longer meets. */}
        {[X0 + BW + SEAM / 2, X0 + 2 * BW + 1.5 * SEAM, X1].map((x, i) => (
          <Line key={i} from={[x, 450]} to={[x, 790]} at={doesnt + s(0.15 * i)} out={recording} dur={0.6} color={C.faint} width={2} dashed />
        ))}

        {/* Your lane. */}
        <g mask="url(#nas-overflow-mask)">
          {/* Scene 1, split by the pause. */}
          {split ? (
            <>
              <Block x={X0} w={bw / 2} y={BOT_Y} h={hs[0]} color={ROLE.you} fill={fills[0]} />
              <Block x={X0 + bw / 2 + g} w={bw / 2} y={BOT_Y} h={hs[0]} color={ROLE.you} fill={fills[0]} />
            </>
          ) : (
            <Block x={X0} w={bw} y={BOT_Y} h={hs[0]} color={ROLE.you} fill={fills[0]} reveal={bottomReveal[0]} />
          )}
          {g > 20 && (
            <line x1={X0 + bw / 2 + 10} x2={X0 + bw / 2 + g - 10} y1={BOT_Y} y2={BOT_Y} stroke={ROLE.muted} strokeWidth={3} strokeDasharray="4 8" opacity={Math.min(1, g / GAP)} />
          )}

          {/* The unscripted aside. */}
          <Block x={ux} w={u} y={BOT_Y} h={LANE_H} color={ROLE.muted} fill={0.08} dashed />

          {/* Scenes 2 and 3. */}
          {[1, 2].map((i) => (
            <Block key={i} x={xs[i]} w={bw} y={BOT_Y} h={hs[i]} color={ROLE.you} fill={fills[i]} reveal={bottomReveal[i]} />
          ))}

          {/* The stumble: a stretch of scene 2 in the warning colour. */}
          {frame >= trip && stumbleO > 0 && (
            <Block
              x={s2x + STUMBLE.from}
              w={STUMBLE.w}
              y={BOT_Y}
              h={LANE_H}
              color={ROLE.problem}
              fill={0.35}
              reveal={prog(frame, trip, 0.5, fps)}
              opacity={stumbleO}
            />
          )}

          {/* Scene labels. */}
          {[0, 1, 2].map((i) => {
            const x = i === 0 ? X0 + mix(bw / 2, bw / 4, Math.min(1, g / GAP)) : xs[i] + bw / 2;
            return <Label key={i} x={x} y={BOT_Y - hs[i] / 2 - 18} text={`scene ${i + 1}`} opacity={prog(frame, doesnt + s(0.2 * i + 0.3), 0.4, fps)} />;
          })}

          {/* What went wrong, under the lane. */}
          <Label x={X0 + bw / 2 + g / 2} y={LABEL_Y} text="pause" color={ROLE.muted} opacity={visibility(frame, fps, pause + s(0.3), eventOut)} />
          <Label x={ux + u / 2} y={LABEL_Y} text="unscripted" color={ROLE.muted} opacity={visibility(frame, fps, isnt + s(0.3), eventOut)} />
          <Label
            x={s2x + STUMBLE.from + STUMBLE.w / 2}
            y={LABEL_Y}
            text="stumble"
            color={ROLE.problem}
            opacity={visibility(frame, fps, trip + s(0.3), eventOut)}
          />
        </g>

        {/* Stitches across the seams between separately recorded clips. */}
        {frame >= stitched &&
          [0, 1].map((i) => {
            const sx = xs[i] + bw + g * (i === 0 ? 1 : 0) + seam / 2;
            return [-26, 0, 26].map((dy, j) => {
              const p = prog(frame, stitched + s(0.12 * (3 * i + j)), 0.3, fps);
              return (
                <line
                  key={`${i}-${j}`}
                  x1={sx - 20}
                  y1={BOT_Y + dy - 12}
                  x2={sx - 20 + 40 * p}
                  y2={BOT_Y + dy - 12 + 24 * p}
                  stroke={ROLE.problem}
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  opacity={p > 0 ? 1 : 0}
                />
              );
            });
          })}

        <Label x={(X0 + X1) / 2} y={850} text="three separate recordings" size={28} color={ROLE.muted} opacity={prog(frame, separately + s(0.3), 0.5, fps)} />
      </Svg>
    </>
  );
};
