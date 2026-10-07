// The kit's fonts, vendored in fonts/ (SIL Open Font License) so a render never waits on the network:
// CMU Serif for text, JetBrains Mono for code.

// The JetBrains Mono file is Google Fonts' latin subset, and the face claims only that subset's range,
// so other characters fall back down the font stack.
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, " +
  "U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

const faces: [family: string, file: string, descriptors: FontFaceDescriptors][] = [
  ["CMU Serif", "cmu-serif-500-roman.woff2", { weight: "400", style: "normal" }],
  ["CMU Serif", "cmu-serif-500-italic.woff2", { weight: "400", style: "italic" }],
  ["CMU Serif", "cmu-serif-700-roman.woff2", { weight: "700", style: "normal" }],
  ["JetBrains Mono", "jetbrains-mono-latin.woff2", { weight: "400", style: "normal", unicodeRange: LATIN }],
  ["JetBrains Mono", "jetbrains-mono-latin.woff2", { weight: "600", style: "normal", unicodeRange: LATIN }],
];

/** Loads every face into the document; `url` gives a font file's URL from its name. */
export async function loadFonts(url: (file: string) => string): Promise<void> {
  await Promise.all(
    faces.map(async ([family, file, descriptors]) => {
      const face = await new FontFace(family, `url(${url(file)}) format("woff2")`, descriptors).load();
      document.fonts.add(face);
    }),
  );
}
