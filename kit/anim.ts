// Timing helpers. Everything is in scene-relative frames; durations are in seconds.

/** manim's `smooth` rate function: an S-curve with a gentle start and end. */
export function smooth(t: number, inflection = 10): number {
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  const error = sigmoid(-inflection / 2);
  const value = (sigmoid(inflection * (t - 0.5)) - error) / (1 - 2 * error);
  return Math.min(1, Math.max(0, value));
}

/** Smoothed progress, 0 → 1, of an animation that starts at frame `at` and lasts `seconds`. */
export function prog(frame: number, at: number, seconds: number, fps: number): number {
  if (seconds <= 0) return frame >= at ? 1 : 0;
  return smooth(Math.min(1, Math.max(0, (frame - at) / (seconds * fps))));
}

/** Linear (unsmoothed) progress. */
export function lin(frame: number, at: number, seconds: number, fps: number): number {
  if (seconds <= 0) return frame >= at ? 1 : 0;
  return Math.min(1, Math.max(0, (frame - at) / (seconds * fps)));
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Opacity of something shown at `inAt` and hidden at `outAt` (either may be omitted). */
export function visibility(
  frame: number,
  fps: number,
  inAt?: number,
  outAt?: number,
  fade = 0.45,
): number {
  const shown = inAt === undefined ? 1 : prog(frame, inAt, fade, fps);
  const hidden = outAt === undefined ? 0 : prog(frame, outAt, fade, fps);
  return shown * (1 - hidden);
}

/**
 * A value that holds, then moves smoothly to each next key at its frame, over `seconds`:
 * `track(frame, fps, [[0, 100], [cue("now"), 400]])` sits at 100, then glides to 400.
 */
export function track(frame: number, fps: number, keys: [number, number][], seconds = 0.7): number {
  let value = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    value = mix(value, keys[i][1], prog(frame, keys[i][0], seconds, fps));
  }
  return value;
}
