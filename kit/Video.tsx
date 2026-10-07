// The Remotion compositions, kept while both renderers exist: a video's stages laid out on the
// narration's timeline, each scene in its own sequence with its clip starting after the lead-in, and
// Remotion's frame fed into the kit's clock.

import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ClockProvider } from "./clock";
import { Stage, lookup } from "./stage";
import { C } from "./theme";

export type { Narration, SceneMap } from "./stage";

/** Gives its children the kit's clock, from Remotion's frame (relative to the enclosing sequence). */
const RemotionClock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  return <ClockProvider value={{ frame, fps, width, height }}>{children}</ClockProvider>;
};

// Props are serialized by Remotion, so compositions name their video and the components are looked
// up from the registry rather than passed in.
export const Video: React.FC<{ video: string }> = ({ video }) => {
  const { narration } = lookup(video);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {narration.scenes.map((scene) => (
        <Sequence key={scene.id} name={scene.id} from={scene.from} durationInFrames={scene.frames}>
          <RemotionClock>
            <Stage video={video} id={scene.id} />
          </RemotionClock>
          <Sequence from={scene.leadInFrames} name={`${scene.id} voice`}>
            <Audio src={staticFile(scene.audio)} />
          </Sequence>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/** One scene alone, for iterating on it in the studio. */
export const SingleScene: React.FC<{ video: string; id: string }> = ({ video, id }) => {
  const scene = lookup(video).narration.scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`${video}: no scene "${id}"`);
  return (
    <AbsoluteFill>
      <RemotionClock>
        <Stage video={video} id={id} />
      </RemotionClock>
      <Sequence from={scene.leadInFrames}>
        <Audio src={staticFile(scene.audio)} />
      </Sequence>
    </AbsoluteFill>
  );
};
