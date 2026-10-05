// The scene-authoring API: everything a video's scenes import, as `import { … } from "#kit"`
// (mapped in package.json `imports`), so scenes never reach into the kit's file layout.

export * from "./anim";
export * from "./cue";
export * from "./primitives";
export * from "./theme";
export type { Narration, SceneMap } from "./Video";
