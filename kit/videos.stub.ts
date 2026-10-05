// Stands in for a project's registry when the kit is type-checked on its own (see tsconfig.json). In a
// project, "@lyceum/videos" is the project's videos/index.ts.

import type { Narration, SceneMap } from "./Video";

export const videos: { narration: Narration; scenes: SceneMap }[] = [];
