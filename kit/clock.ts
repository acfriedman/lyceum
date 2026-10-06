// The frame clock: the frame being drawn (scene-relative), and the video's rate and size. Whatever
// draws the kit provides it, and everything that animates reads it through `useScene()`.

import { createContext, useContext } from "react";

export type Clock = { frame: number; fps: number; width: number; height: number };

const ClockContext = createContext<Clock | null>(null);
export const ClockProvider = ClockContext.Provider;

export function useClock(): Clock {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error("no frame clock: a scene must be drawn inside a ClockProvider");
  return clock;
}
