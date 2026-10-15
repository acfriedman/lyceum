// The registry: one entry per video directory. `lyceum scenes <video>` adds a video's narration
// and scene map here.

import type { Narration, SceneMap } from "#kit";
import whatIsLyceumNarration from "./what-is-lyceum/narration.json";
import { scenes as whatIsLyceumScenes } from "./what-is-lyceum/scenes";
import settingUpNarration from "./setting-up/narration.json";
import { scenes as settingUpScenes } from "./setting-up/scenes";
import yourOwnVoiceNarration from "./your-own-voice/narration.json";
import { scenes as yourOwnVoiceScenes } from "./your-own-voice/scenes";

export const videos: { narration: Narration; scenes: SceneMap }[] = [
  { narration: whatIsLyceumNarration as Narration, scenes: whatIsLyceumScenes },
  { narration: settingUpNarration as Narration, scenes: settingUpScenes },
  { narration: yourOwnVoiceNarration as Narration, scenes: yourOwnVoiceScenes },
];
