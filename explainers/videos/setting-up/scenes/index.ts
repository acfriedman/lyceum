import type { SceneMap } from "#kit";
import { Where } from "./s01-where";
import { OwnProject } from "./s02-own-project";
import { BesideTheCode } from "./s03-beside-the-code";
import { OwnRepository } from "./s04-own-repository";
import { EachMachine } from "./s05-each-machine";
import { Sharing } from "./s06-sharing";
import { Recap } from "./s07-recap";

export const scenes: SceneMap = {
  where: Where,
  "own-project": OwnProject,
  "beside-the-code": BesideTheCode,
  "own-repository": OwnRepository,
  "each-machine": EachMachine,
  sharing: Sharing,
  recap: Recap,
};
