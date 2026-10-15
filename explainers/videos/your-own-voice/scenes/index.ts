import type { SceneMap } from "#kit";
import { MyVoice } from "./s01-my-voice";
import { ReadAloud } from "./s02-read-aloud";
import { TimedToYou } from "./s03-timed-to-you";
import { OneTake } from "./s04-one-take";
import { FixAScene } from "./s05-fix-a-scene";
import { ThreeSteps } from "./s06-three-steps";

export const scenes: SceneMap = {
  "my-voice": MyVoice,
  "read-aloud": ReadAloud,
  "timed-to-you": TimedToYou,
  "one-take": OneTake,
  "fix-a-scene": FixAScene,
  "three-steps": ThreeSteps,
};
