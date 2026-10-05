// Word cues: a scene times its animation to the narration by naming the words it should land on.
//
//   const { frame, fps, cue } = useScene();
//   const shown = cue("returns nothing");              // the frame "returns" starts
//   const later = cue("block", { after: shown });      // the first "block" after that
//   const done  = cue("block", { after: shown, end: true });
//
// A phrase that the narration doesn't contain throws, naming the scene: a script edit that breaks a
// cue fails the render instead of drifting silently.

import { createContext, useContext } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type Word = { w: string; s: number; e: number };

export type SceneTiming = {
  id: string;
  title: string;
  words: Word[];
  leadInFrames: number;
  frames: number;
};

const SceneContext = createContext<SceneTiming | null>(null);
export const SceneProvider = SceneContext.Provider;

const normalize = (word: string) =>
  word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']/g, "");

export type CueOptions = {
  /** Only match a phrase starting at or after this frame. */
  after?: number;
  /** The frame the phrase's last word ends, instead of the frame its first word starts. */
  end?: boolean;
  /** Seconds added to the result (negative to lead the word). */
  offset?: number;
};

/**
 * The current scene's clock: `{ frame, fps, cue, at, id, title, end, narrationEnd }`. `cue(phrase,
 * options)` is the scene-relative frame a spoken phrase starts (see `CueOptions`), `at(seconds)` the
 * frame that far into the narration, `end` the scene's last frame, `narrationEnd` the frame the
 * narration ends. Frame 0 is the lead-in before the first word.
 */
export function useScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timing = useContext(SceneContext);
  if (!timing) throw new Error("useScene() outside a scene");

  const spoken = timing.words.map((w) => normalize(w.w));
  const toFrame = (seconds: number) => timing.leadInFrames + Math.round(seconds * fps);

  const cue = (phrase: string, options: CueOptions = {}): number => {
    const target = phrase.split(/\s+/).map(normalize).filter(Boolean);
    for (let i = 0; i + target.length <= spoken.length; i++) {
      if (options.after !== undefined && toFrame(timing.words[i].s) < options.after) continue;
      if (target.every((t, k) => spoken[i + k] === t)) {
        const word = options.end ? timing.words[i + target.length - 1].e : timing.words[i].s;
        return toFrame(word) + Math.round((options.offset ?? 0) * fps);
      }
    }
    const where = options.after !== undefined ? ` after frame ${options.after}` : "";
    throw new Error(`scene "${timing.id}": narration has no "${phrase}"${where}`);
  };

  /** The frame `seconds` into the narration (0 = the first word). */
  const at = (seconds: number) => toFrame(seconds);

  return {
    frame,
    fps,
    cue,
    at,
    id: timing.id,
    title: timing.title,
    /** The scene's last frame. */
    end: timing.frames,
    /** The frame the narration ends. */
    narrationEnd: toFrame(timing.words.at(-1)?.e ?? 0),
  };
}
