// A small Swift tokenizer for on-screen code. Deterministic and synchronous, which a frame renderer
// wants; it only has to colour short, hand-picked snippets correctly.

import { C } from "./theme";

export type Token = { text: string; color: string };

const KEYWORDS = new Set(
  (
    "func let var throws throw try await async guard else return protocol final class struct enum init " +
    "private public static while for in if do catch self nil true false some any import case switch " +
    "default where inout defer extension typealias"
  ).split(" "),
);

const RULES: [RegExp, (match: string) => string][] = [
  [/^\/\/.*/, () => C.dim],
  [/^"(?:[^"\\]|\\.)*"/, () => C.green],
  [/^@\w+/, () => C.purple],
  [/^\d+(?:\.\d+)?/, () => C.gold],
  [/^[A-Za-z_]\w*/, (word) => (KEYWORDS.has(word) ? C.pink : /^[A-Z]/.test(word) ? C.blue : C.text)],
  [/^\s+/, () => C.text],
  [/^./, () => C.text],
];

/** Tokenizes one line of Swift into coloured runs. */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let rest = line;
  while (rest.length > 0) {
    for (const [pattern, color] of RULES) {
      const match = rest.match(pattern);
      if (!match) continue;
      const text = match[0];
      // A call site's name reads as a function: an identifier directly followed by `(`.
      const isCall = /^[a-z_]\w*$/.test(text) && rest[text.length] === "(" && !KEYWORDS.has(text);
      tokens.push({ text, color: isCall ? C.yellow : color(text) });
      rest = rest.slice(text.length);
      break;
    }
  }
  return tokens;
}
