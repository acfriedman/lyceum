import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { continueRender, delayRender, staticFile } from "remotion";

loadJetBrainsMono("normal", { weights: ["400", "600"], subsets: ["latin"] });

const faces: [string, FontFaceDescriptors][] = [
  ["cmu-serif-500-roman.woff2", { weight: "400", style: "normal" }],
  ["cmu-serif-500-italic.woff2", { weight: "400", style: "italic" }],
  ["cmu-serif-700-roman.woff2", { weight: "700", style: "normal" }],
];

const handle = delayRender("Loading CMU Serif");
Promise.all(
  faces.map(([file, descriptors]) => {
    const face = new FontFace("CMU Serif", `url(${staticFile(`fonts/${file}`)}) format("woff2")`, descriptors);
    return face.load().then((loaded) => document.fonts.add(loaded));
  }),
)
  .then(() => continueRender(handle))
  .catch((error) => {
    console.error(error);
    continueRender(handle);
  });
