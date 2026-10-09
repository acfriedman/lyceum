// SubRip captions: written by narrate.mjs from the word timings, read back by the renderer to burn them
// into the picture or to shift them past the title card.

/** A cue's time as SubRip writes it: `HH:MM:SS,mmm`. */
function stamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** SubRip text from cues: `{ s, e, text }`, in seconds. */
export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.s)} --> ${stamp(c.e)}\n${c.text}\n`).join("\n");
}

/** Cues (`{ s, e, text }`, in seconds) from SubRip text. */
export function parseSrt(text) {
  const seconds = (t) => {
    const [h, m, s, ms] = t.split(/[:,.]/).map(Number);
    return h * 3600 + m * 60 + s + ms / 1000;
  };
  const cues = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    const times = lines.findIndex((l) => l.includes("-->"));
    if (times < 0) continue;
    const [s, e] = lines[times].split("-->").map((t) => seconds(t.trim()));
    cues.push({ s, e, text: lines.slice(times + 1).join("\n") });
  }
  return cues;
}
