import React from "react";
import { Arrow, C, FONT, Svg, Text, prog, useScene, visibility } from "#kit";
import { ROLE, TALK, Terminal, Waveform } from "./shared";

// Fix one scene: Lyceum's real error names the scene a stumble is in, a take of just that scene joins
// the recordings, and in the strip of scene clips it replaces this scene's own while the rest stay as they
// were. Then the real warning for words the script doesn't have: the audio keeps them, the captions
// don't.

const TERM = { x: 160, y: 130, w: 1600 };
const TREE = { x: 160, y: 470, size: 28, row: 46, indent: 40 };

// The talk's scene clips, side by side, each as wide as it is long.
const STRIP_Y = 800;
const STRIP_H = 150;
const GAP = 24;
const LEFT = 160;
const WIDTH = 1600;
const FIX = TALK.scenes.findIndex((s) => s.id === "fix-a-scene"); // this scene's own clip
const total = TALK.scenes.reduce((sum, s) => sum + (s.to - s.from), 0);
const perSecond = (WIDTH - GAP * (TALK.scenes.length - 1)) / total;
const CLIPS = TALK.scenes.reduce<{ id: string; from: number; to: number; x: number; w: number }[]>((clips, s) => {
  const x = clips.length ? clips[clips.length - 1].x + clips[clips.length - 1].w + GAP : LEFT;
  return [...clips, { id: s.id, from: s.from, to: s.to, x, w: (s.to - s.from) * perSecond }];
}, []);
const fixClip = CLIPS[FIX];
const fixMid = fixClip.x + fixClip.w / 2;
// The stretch of the new take that says something the script doesn't have (illustrative).
const EXTRA = { from: fixClip.from + (fixClip.to - fixClip.from) * 0.4, to: fixClip.from + (fixClip.to - fixClip.from) * 0.62 };
const extraMid = fixClip.x + ((EXTRA.from + EXTRA.to) / 2 - fixClip.from) * perSecond;

export const FixAScene: React.FC = () => {
  const { frame, fps, cue } = useScene();
  const s = (seconds: number) => Math.round(seconds * fps);

  const stumble = cue("If I stumble");
  const tells = cue("tells me");
  const whichScene = cue("which scene");
  const whichWords = cue("which words");
  const treeAt = cue("didn't hear");
  const record = cue("record just that scene");
  const replaces = cue("replaces that part");
  const everything = cue("Everything else");
  const stays = cue("stays as it was");
  const say = cue("If I say something");
  const something = cue("something the script");
  const warns = cue("warns me");
  const captions = cue("captions won't show it");

  // The error's third line wraps; its label waits until the panel is at full height.
  const illustrative = whichWords + s(2.2);

  const lift = prog(frame, replaces, 0.6, fps);
  const slide = prog(frame, replaces + s(0.35), 0.6, fps);
  const flag = prog(frame, whichScene, 0.4, fps);
  const gold = prog(frame, something, 0.6, fps);
  // The strip is up from the opening line ("Nobody reads two minutes without a slip"): every scene of
  // the take, before the stumble is flagged in one of them.
  const stripAt = cue("Nobody reads");
  const stripIn = prog(frame, stripAt, 0.8, fps);
  const replaced = frame >= replaces + s(0.35);
  const unchanged = visibility(frame, fps, stays, say);

  return (
    <>
      <Terminal
        {...TERM}
        at={stumble}
        out={say}
        lines={[
          { text: "videos/your-own-voice/recordings/_talk.m4a doesn't say all of the script:", at: stumble, color: ROLE.problem },
          { text: '  fix-a-scene: skips "I record just that scene again"', at: whichScene },
          {
            text: "Record each of these scenes on its own, to videos/your-own-voice/recordings/<scene-id>.m4a, or change its narration in script.md to what you said.",
            at: whichWords,
            color: ROLE.muted,
          },
        ]}
      />
      <Text x={TERM.x + TERM.w} y={384} anchor="right" size={26} italic color={ROLE.muted} at={illustrative} out={say} dur={0.5} reveal="fade">
        illustrative
      </Text>

      {/* recordings/, its take, and the new take of one scene. */}
      <Text x={TREE.x} y={TREE.y} anchor="top-left" size={TREE.size} font="mono" color={C.text} at={treeAt} out={say} dur={0.5} reveal="fade">
        recordings/
      </Text>
      <Text x={TREE.x + TREE.indent} y={TREE.y + TREE.row} anchor="top-left" size={TREE.size} font="mono" color={ROLE.you} at={treeAt} out={say} dur={0.5} reveal="fade">
        _talk.m4a
      </Text>
      <Text x={TREE.x + TREE.indent} y={TREE.y + 2 * TREE.row} anchor="top-left" size={TREE.size} font="mono" color={ROLE.fix} at={record} out={say} dur={0.6}>
        fix-a-scene.m4a
      </Text>

      <Svg>
        {/* The tree's branch. */}
        {frame >= treeAt && (
          <g opacity={prog(frame, treeAt, 0.5, fps) * visibility(frame, fps, undefined, say)}>
            <line
              x1={TREE.x + 12}
              x2={TREE.x + 12}
              y1={TREE.y + 42}
              y2={TREE.y + TREE.row + 22 + (frame >= record ? TREE.row * prog(frame, record, 0.4, fps) : 0)}
              stroke={C.faint}
              strokeWidth={2}
            />
          </g>
        )}

        {/* The clips. This scene's, flagged, lifts out on "replaces"; the new take drops into its place. */}
        {frame >= stripAt &&
          CLIPS.map((clip, i) => {
            const isFix = i === FIX;
            const dy = isFix ? -60 * lift : 0;
            const o = stripIn * (isFix ? 1 - lift : 1);
            return (
              <g key={clip.id} transform={`translate(0 ${dy})`} opacity={o}>
                <Waveform x={clip.x} w={clip.w} y={STRIP_Y} h={STRIP_H} from={clip.from} to={clip.to} />
                {isFix && flag > 0 && (
                  <rect
                    x={clip.x - 10}
                    y={STRIP_Y - STRIP_H / 2 - 12}
                    width={clip.w + 20}
                    height={STRIP_H + 24}
                    rx={10}
                    fill="none"
                    stroke={ROLE.problem}
                    strokeWidth={3}
                    opacity={flag}
                  />
                )}
              </g>
            );
          })}
        {slide > 0 && (
          <g transform={`translate(0 ${-70 * (1 - slide)})`} opacity={slide}>
            <Waveform
              x={fixClip.x}
              w={fixClip.w}
              y={STRIP_Y}
              h={STRIP_H}
              from={fixClip.from}
              to={fixClip.to}
              color={(t) => (gold > 0 && t >= EXTRA.from && t < EXTRA.to ? ROLE.you : ROLE.fix)}
            />
          </g>
        )}

        <Arrow from={[TREE.x + TREE.indent + 270, TREE.y + 2 * TREE.row + 18]} to={[fixMid, STRIP_Y - STRIP_H / 2 - 28]} bend={-60} at={replaces} out={everything} dur={0.6} color={ROLE.fix} width={3} />
        <Arrow from={[extraMid, 372]} to={[extraMid, STRIP_Y - STRIP_H / 2 - 14]} at={captions + s(0.3)} dur={0.6} color={ROLE.muted} width={2.5} dashed />
      </Svg>

      {/* Clip numbers, and "unchanged" over every clip but this scene's. */}
      {CLIPS.map((clip, i) => {
        const isFix = i === FIX;
        const color = !isFix ? ROLE.muted : replaced ? ROLE.fix : flag > 0 ? ROLE.problem : ROLE.muted;
        return (
          <React.Fragment key={clip.id}>
            {frame >= stripAt && (
              <div
                style={{
                  position: "absolute",
                  left: clip.x + clip.w / 2,
                  top: STRIP_Y + STRIP_H / 2 + 34,
                  transform: "translate(-50%, -50%)",
                  fontFamily: FONT.mono,
                  fontSize: 28,
                  color,
                  opacity: stripIn,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
            )}
            {!isFix && frame >= stays && (
              <div
                style={{
                  position: "absolute",
                  left: clip.x + clip.w / 2,
                  top: STRIP_Y - STRIP_H / 2 - 34,
                  transform: "translate(-50%, -50%)",
                  fontFamily: FONT.serif,
                  fontStyle: "italic",
                  fontSize: 28,
                  color: ROLE.muted,
                  opacity: unchanged,
                }}
              >
                unchanged
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* The warning for words the script doesn't have. */}
      <Terminal
        {...TERM}
        at={warns}
        lines={[
          {
            text: '  fix-a-scene: heard "and honestly that surprised me", which isn\'t in the script (the captions won\'t show it)',
            at: warns + s(0.3),
            color: ROLE.you,
          },
        ]}
      />
      <Text x={TERM.x + TERM.w} y={304} anchor="right" size={26} italic color={ROLE.muted} at={warns + s(1.9)} dur={0.5} reveal="fade">
        illustrative
      </Text>
      <Text x={extraMid} y={346} size={32} italic color={ROLE.muted} at={captions} dur={0.6}>
        the audio keeps it
      </Text>
    </>
  );
};
