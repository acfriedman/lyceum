// The look. A video is drawn in one theme, its script's `theme:` (else the project's, else dark):
//   dark   the house look: a 3Blue1Brown-style dark canvas, with manim's palette
//   paper  a light, formal look for presentations: warm off-white, ink-black text, and the same colour
//          names in deeper inks, so they hold their contrast on a light ground
// Scenes take every colour from `C`, which holds the video's theme, so a scene draws right in either.
// Never hard-code one: a panel is `C.surface`, a recess `C.sunken`, a faint wash `${C.text}06`.

/** A theme's colours. Each is `#RRGGBB`, so an alpha can be appended: `${C.blue}22`. */
export type Palette = {
  /** The canvas. */
  bg: string;
  /** Text and outlines. */
  text: string;
  /** Secondary text: labels, notes, the chapter tag. */
  dim: string;
  /** Rules, grid lines, and things not yet in play. */
  faint: string;
  /** A panel on the canvas: a document, a window, a terminal. */
  surface: string;
  /** A recess: a screen inside a panel, a thumbnail's well. */
  sunken: string;
  blue: string;
  teal: string;
  green: string;
  yellow: string;
  gold: string;
  red: string;
  maroon: string;
  purple: string;
  pink: string;
};

export type Theme = {
  colors: Palette;
  /** The title card draws an accent rule under the title. */
  titleRule: boolean;
};

export const THEMES = {
  dark: {
    colors: {
      bg: "#0E0E10",
      text: "#ECECEC",
      dim: "#8A8A8F",
      faint: "#3A3A40",
      surface: "#16161A",
      sunken: "#0B0B0D",
      blue: "#58C4DD",
      teal: "#5CD0B3",
      green: "#83C167",
      yellow: "#FFE873",
      gold: "#F0AC5F",
      red: "#FC6255",
      maroon: "#C55F73",
      purple: "#B189C7",
      pink: "#E880B5",
    },
    titleRule: false,
  },
  paper: {
    colors: {
      bg: "#FAF8F4",
      text: "#1C1E24",
      dim: "#6E6A64",
      faint: "#D8D3CA",
      surface: "#FFFFFF",
      sunken: "#F0ECE4",
      blue: "#1F5A96",
      teal: "#147A6E",
      green: "#3F7A2E",
      yellow: "#B07D00",
      gold: "#B5651D",
      red: "#B3261E",
      maroon: "#8E2F4C",
      purple: "#5E3F8F",
      pink: "#A33A6C",
    },
    titleRule: true,
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

let current: Theme = THEMES.dark;

/** The video's colours. The theme is set before any scene module loads, so they can be read anywhere,
 *  module-level constants included (`const ROLE = { request: C.blue }`). */
export const C: Readonly<Palette> = { ...THEMES.dark.colors };

/** The video's theme. */
export const theme = (): Theme => current;

/** Sets the theme. The renderer's page does, before any scene loads (kit/boot.ts); scenes never do. */
export function applyTheme(name: string): void {
  if (!Object.hasOwn(THEMES, name)) {
    throw new Error(`unknown theme "${name}": the kit's themes are ${Object.keys(THEMES).join(", ")}`);
  }
  current = THEMES[name as ThemeName];
  Object.assign(C, current.colors);
}

export type Color = string;

export const FONT = {
  serif: '"CMU Serif", "Latin Modern Roman", Georgia, serif',
  mono: '"JetBrains Mono", Menlo, monospace',
} as const;

/** JetBrains Mono's advance width, as a fraction of the font size: lets code highlights be placed by column. */
export const MONO_ADVANCE = 0.6;
