// The first thing the page runs (page.tsx imports it before anything that loads the videos): the
// theme the renderer names in the URL, `?theme=<name>`, applied before any scene module reads `C`.

import { applyTheme } from "./theme";

applyTheme(new URLSearchParams(location.search).get("theme") ?? "dark");
