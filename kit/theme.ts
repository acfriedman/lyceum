// The house look: a 3Blue1Brown-style dark canvas, with manim's palette and Computer Modern text.

export const C = {
  bg: "#0E0E10",
  text: "#ECECEC",
  dim: "#8A8A8F",
  faint: "#3A3A40",
  blue: "#58C4DD",
  teal: "#5CD0B3",
  green: "#83C167",
  yellow: "#FFE873",
  gold: "#F0AC5F",
  red: "#FC6255",
  maroon: "#C55F73",
  purple: "#B189C7",
  pink: "#E880B5",
} as const;

export type Color = string;

export const FONT = {
  serif: '"CMU Serif", "Latin Modern Roman", Georgia, serif',
  mono: '"JetBrains Mono", Menlo, monospace',
} as const;

/** JetBrains Mono's advance width, as a fraction of the font size: lets code highlights be placed by column. */
export const MONO_ADVANCE = 0.6;
