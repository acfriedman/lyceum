import type { SceneMap } from "#kit";
import { Whiteboard } from "./s01-whiteboard";
import { GoodExplanations } from "./s02-good-explanations";
import { AScript } from "./s03-a-script";
import { TheLoop } from "./s04-the-loop";
import { InSync } from "./s05-in-sync";
import { ForAnyone } from "./s06-for-anyone";
import { ThisVideo } from "./s07-this-video";

export const scenes: SceneMap = {
  whiteboard: Whiteboard,
  "good-explanations": GoodExplanations,
  "a-script": AScript,
  "the-loop": TheLoop,
  "in-sync": InSync,
  "for-anyone": ForAnyone,
  "this-video": ThisVideo,
};
