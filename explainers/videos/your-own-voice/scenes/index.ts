import type { SceneMap } from "#kit";
import { MyVoice } from "./s01-my-voice";
import { NotAScript } from "./s02-not-a-script";
import { OneTake } from "./s03-one-take";
import { FixAScene } from "./s04-fix-a-scene";
import { ThreeSteps } from "./s05-three-steps";

export const scenes: SceneMap = {
  "my-voice": MyVoice,
  "not-a-script": NotAScript,
  "one-take": OneTake,
  "fix-a-scene": FixAScene,
  "three-steps": ThreeSteps,
};
