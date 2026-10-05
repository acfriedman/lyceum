import React from "react";
import { Composition, Folder } from "remotion";
import "./fonts";
import { SingleScene, Video } from "./Video";
import { videos } from "@lyceum/videos";

// Every video is one full composition plus one composition per scene (in a folder), so a single
// scene can be previewed or rendered on its own.
export const Root: React.FC = () => (
  <>
    {videos.map(({ narration }) => (
      <React.Fragment key={narration.video}>
        <Composition
          id={narration.video}
          component={Video}
          defaultProps={{ video: narration.video }}
          durationInFrames={narration.frames}
          fps={narration.fps}
          width={narration.width}
          height={narration.height}
        />
        <Folder name={`${narration.video}-scenes`}>
          {narration.scenes.map((scene) => (
            <Composition
              key={scene.id}
              id={`${narration.video}--${scene.id}`}
              component={SingleScene}
              defaultProps={{ video: narration.video, id: scene.id }}
              durationInFrames={scene.frames}
              fps={narration.fps}
              width={narration.width}
              height={narration.height}
            />
          ))}
        </Folder>
      </React.Fragment>
    ))}
  </>
);
