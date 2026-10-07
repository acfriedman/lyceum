# Scene-agent brief (template)

Give one of these to each scene's subagent, filling in the `<…>` parts and the scene notes. The scene's
pack, `.cache/work/<slug>/scenes/<id>.md`, already holds the mechanical part: the visual brief, the
narration, the word timings, and the file and component name. So none of that is repeated here.

**The scene notes are where your judgment goes.** Subagents spend most of their time reading, so the notes
carry everything they'd otherwise look up:
- **The facts on screen:** real type, function and value names, with any snippet quoted exactly.
- **What the neighbouring scenes leave on screen and pick up,** where it matters for continuity.
- **The layout:** positions, and which cue words trigger which changes, beyond the pack's `> Visual:` lines.

A subagent should never need to open a source file. If a fact is needed and the notes don't give it, the
subagent labels the element "illustrative" instead.

---

You are building one animated scene for a narrated, 3Blue1Brown-style explainer video. It's made with
Lyceum (React and TypeScript). The project is `<absolute path to the directory holding
lyceum.config.json>`; work only from that directory.

## Your assignment: scene <NN> · <id> (<its one-line role in the arc>)

Read these four files and nothing else:
1. `.cache/work/<slug>/scenes/<id>.md`: your scene's pack.
   - It has the file you own and its export name, the scenes before and after, the visual brief, the
     narration, and every spoken word with its start time. The audio is final.
   - The visual brief is authoritative. Quote its code, names and values exactly, and label on screen
     anything it calls simplified or illustrative.
2. `.cache/work/<slug>/kit-api.md`: the whole scene API. Import kit things from `"#kit"`.
3. `videos/<slug>/scenes/shared.tsx`: this video's vocabulary (role colours, positions, recurring props).
   Use it rather than inventing your own, so the video stays consistent.
4. `videos/<slug>/scenes/s01-<first-id>.tsx`: a finished scene. Match its idiom and polish.

Other agents are building the other scenes at the same time.
- **Edit only your own scene file.** Don't touch `shared.tsx`, `scenes/index.ts`, `script.md`,
  `narration.json`, or anything in the Lyceum package.
- If you need a helper, define it in your own file.
- Never run `lyceum narrate`: it bills a paid voice API.
- Never render video.

## Scene notes
<the layout; what appears at which cue words; the real names, values and snippets to show, exactly; what
the previous scene leaves on screen and what the next one picks up; how it ends>

## How timing works
`const { frame, fps, cue, at } = useScene();`

- `cue("exact spoken words")` returns the scene-relative frame where the phrase starts.
  - `{ after: f }` gives the first match after frame `f`.
  - `{ end: true }` gives where the phrase ends.
  - `{ offset: s }` shifts the result by `s` seconds.
- Matching ignores case and punctuation, so a word that's spoken twice needs `{ after }`.
- A phrase missing from the narration throws, so copy phrases from the pack.
- Express every duration in seconds × fps, never as a raw frame count: `Math.round(0.5 * fps)`,
  `prog(frame, at, 0.6, fps)`.
- `track(frame, fps, [[f0, v0], [f1, v1]])` moves things smoothly.
- Frame 0 is the lead-in before the first word. Make every element appear exactly when the narration
  names it.

## Style rules
- **The look:** a dark canvas, few things on screen at once, generous space.
- **Attention:** fade stale elements out (`out=`) so attention follows the narration.
- **Layout:**
  - Nothing overlaps unintentionally.
  - Never leave the screen static or empty for more than about 6 s.
  - The frame is 1920×1080. Keep content inside an 80 px margin; the top-left corner (y < 110) is
    reserved for the chapter tag.
- **Text:**
  - Minimum text size is 26 px. A shrunken recall of an earlier element may go smaller.
  - Labels are short. Never put narration sentences on screen.
  - Labels use full words, not acronyms or shortenings, unless they quote code.
- **Code:** code shown must be faithful to the notes, or labelled "simplified" or "illustrative".
- **Kit quirks:**
  - `Node`'s sub-label renders under 26 px, so put sub-labels in their own `Text`.
  - `Box`, `Arrow` and `Line` must be inside `<Svg>`.

## Verify (required)
- `npx lyceum typecheck` must be clean. If the only errors are in other agents' scene files, ignore them.
- Plan the layout carefully first. Contact sheets render one at a time across the whole machine, so other
  agents may be waiting their turn.
- Run stills **once**, when the scene is written:
  - command: `npx lyceum stills <slug> <id> --at <10–12 comma-separated seconds>`;
  - cover every cue and the end, sampling the end about 0.7 s before the last frame, because every scene
    fades through black over its last 0.45 s;
  - it may wait minutes for its turn, so give it a long timeout, and never run it in the background or
    twice at once.
- Then look at `.cache/work/<slug>/stills/<id>.png`. Fix any overlap, clipping, illegible text, empty
  stretch or mistimed element it shows.
- Re-run stills only if you changed the layout, and at most once more. Your last run should cover the
  whole scene: it's the sheet the reviewer sees.

## Report back (brief)
Two or three sentences on what the scene shows and anything you couldn't make work. Then list the kit gaps
you worked around locally.
