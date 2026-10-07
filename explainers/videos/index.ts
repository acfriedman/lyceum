// The registry: one entry per video directory. `lyceum scenes <video>` adds a video's narration
// and scene map here.

import type { Narration, SceneMap } from "#kit";
import whatIsLyceumNarration from "./what-is-lyceum/narration.json";
import { scenes as whatIsLyceumScenes } from "./what-is-lyceum/scenes";

export const videos: { narration: Narration; scenes: SceneMap }[] = [
  { narration: whatIsLyceumNarration as Narration, scenes: whatIsLyceumScenes },
];
