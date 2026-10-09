---
name: lyceum
description: Make explainer videos of animated, narrated diagrams about code, systems or ideas with Lyceum (React scenes timed to text-to-speech narration). Use when the user asks for an explainer video, a narrated walkthrough, a video series, or "help me understand X visually", and when they ask to revise, re-narrate, re-render or extend an existing Lyceum video.
---

# Lyceum: explainer videos

A video is one `script.md`. Its narration is synthesized scene by scene, with a timestamp for every
word. Every scene is a React component that times its animation to the spoken words with
`cue("…")`. The output is an MP4 that teaches one thing: why it exists, the problem it solves, and how
it works.

**Accuracy matters more than polish.** A beautiful animation of a wrong claim is worse than no video.

## 0. Find the project and read its guide

A Lyceum project is the directory holding `lyceum.config.json`, found at or above the working directory.
Run every command from there. If there is none, ask the user where the videos should live and run
`npx lyceum init <dir>`, then `npm install`. Suggest `explainers/` inside the repository the videos
explain, or a repository of its own for videos that span several repositories or a whole product. Never
add Lyceum to an application's own `package.json`.

Read the file named by the config's `project` (usually `project.md`; older projects name it under
`brief`) before anything else. It holds what this skill can't know, for every video in the project:
- who the audience is;
- where ground truth lives (repositories, design docs, tests);
- project house rules: names, pronunciations, terms;
- how work is reviewed and delivered.

**Where the project guide and this skill disagree, the guide wins.** The config can also set a default `voice`,
plus `pronounce` and `allowSpoken` entries that apply to every script.

Commands: `npx lyceum <command>`. Projects created by `lyceum init` also have the same commands as npm
scripts (`npm run narrate -- <slug>`).

## Workflow

### 1. Pin down the topic

Find out what the video must explain and which sources are ground truth. Ask only if the topic is
genuinely ambiguous.

**Length:** use the length the user asks for. Budget about 150 spoken words per minute, and one scene per
40–50 seconds: a 5-minute video is about 750 words in 6–8 scenes. If no length is named, let the material
set it. Don't pad, and don't ask for a length.

### 2. Research

Read the actual code and documents, not summaries; delegate wide searches to a helper agent if yours can.
Collect the concrete things the video can show:
- real type and function names, and real snippets;
- tests and fixtures that demonstrate failure modes (they make great on-screen examples);
- the history: what was there before, and why it changed. Version-control history is the source.

### 3. Write the script

```bash
npx lyceum new <slug> "<Title>"
```

Fill in `videos/<slug>/script.md`. Start with its **intent**, the section above the first scene: the
point a viewer should leave with, the audience if it differs from the project's, the angle, the length,
and anything only this video needs. It's never narrated, and every scene agent reads it. Then each scene
is:
- a `## NN · id — Title` heading;
- `> Visual:` lines, the animation brief;
- narration paragraphs.

List the sources in the frontmatter, one per line: the path first, then what the video takes from it
in parentheses, as in `- tools/render.mjs (one scene re-rendered on its own)`. Paths are relative to
the root of the repository holding the project; a path into a checkout beside it starts with that
checkout's directory name (`engine/src/cache.ts`). `lyceum stale` watches these paths, so name real
files or directories rather than shorthand.

What makes a script work:
- **Build the problem before the solution.** A strong arc:
  1. a concrete hook;
  2. the frame;
  3. the problem, stated sharply;
  4. why the obvious fixes fail;
  5. the mechanism;
  6. its edge cases;
  7. the payoff in real code;
  8. a recap that calls back to the opening.
- **Write for the ear.** Short sentences, and no identifiers that read badly aloud. Spell names as they
  should sound, or map them under `pronounce:` (for example `CompletionDelivery: Completion Delivery`).
  `pronounce` only changes the text sent to the voice, so cue phrases must use the spoken form. If a voice
  already says a name acceptably, leave it alone: respellings often sound worse.
- **Say everything in full: no acronyms, no shortenings.** A listener can't see the spelling, so "op" or
  "GCD" makes them stop and decode. Say "operation", "Grand Central Dispatch", even where the code says
  "op".
  - Everyday acronyms are fine: API, URL, UI, JSON, HTTP, CPU, and so on.
  - Code on screen keeps its real names. On-screen labels prefer full words too, unless they quote code.
  - `narrate` refuses narration with an all-caps acronym (other than the everyday ones) or a known
    shortening (op, impl, config, repo, func, param, arg, env, dep, init, …). Fix the script.
    `allow_spoken:` in the frontmatter, or `allowSpoken` in the config, is for deliberate exceptions only.
- **Round long numbers in narration.** Speech-to-text writes "5,248" as digits, and the aligner can't
  match a spelled-out "five thousand two hundred and forty-eight". Say "just over five thousand" and put
  the exact figure on screen. Short numbers are fine on their own, but not run straight into another number.
- **Make each visual brief specific:** what is on screen, where it is, and which spoken words trigger each
  change. Vague briefs produce vague scenes.
- **Give every claim a source.** If code on screen is simplified, the brief says "simplified".

**Gate:** show the user the intent and the arc as numbered one-line scenes, with the script's path, and
wait. They may waive review ("I trust your script"). Respect that, but still show the intent and the arc.

### 4. Narrate

```bash
npx lyceum narrate <slug>                         # OpenAI gpt-4o-mini-tts, voice "cedar" (default)
npx lyceum narrate <slug> --provider say          # free macOS draft voice
npx lyceum narrate <slug> --provider elevenlabs   # ElevenLabs (word timings from the API)
npx lyceum narrate <slug> --only <scene>          # one scene
```

This writes `narration.json` (durations, word timings, timeline) and `captions.srt`.
- **Cost and speed:** every paragraph is voiced at once, so narration takes about as long as the longest
  paragraph plus alignment, well under a minute. Clips are cached by a hash of voice and text, so only
  changed text is billed: roughly $0.15 per 10-minute video with OpenAI.
- **Keys:** `OPENAI_KEY` (or `OPENAI_API_KEY`) and `ELEVEN_LABS_KEY` (or `ELEVENLABS_API_KEY`), from the
  environment or the nearest `.env` at or above the project.
- **Voice:** a script can pin a voice in frontmatter: `voice: { provider: elevenlabs }`, or
  `{ id: marin, instructions: … }` for another OpenAI voice.
- **Loudness:** every clip (and, for OpenAI, every paragraph) is brought to −23 LUFS with one constant
  gain, so separate takes don't jump in volume. Pitch and pacing still vary from take to take; this doesn't
  touch them.

Why the OpenAI path is more involved:
- **Truncation:** gpt-4o-mini-tts often drops an input's last sentence. So Lyceum:
  - voices one paragraph at a time;
  - appends a sentinel ("Okay.") and cuts the audio before it;
  - checks each paragraph against the script, and retries.
- **No word timings:** the voice doesn't report when each word is spoken, so Lyceum transcribes each clip
  with local Whisper and matches it to the script character by character. That's mlx-whisper, so Apple
  Silicon only; its venv is created on first use.

A "paragraph N still missing words" error after retries is a real failure: report it, and don't paper
over it. Never switch providers silently.

**Check the endings.** Narration is cheap, so listening is the bottleneck, not credits. After narrating,
transcribe each scene and compare its last words with the script, so no clip ends early. Use Whisper with
`condition_on_previous_text=False`, or it hallucinates over silence.

Then scaffold the scenes:

```bash
npx lyceum scenes <slug>
```

It's idempotent: re-run it after any narration change. It:
- creates placeholder scene files, `scenes/index.ts` and `scenes/shared.tsx`;
- registers the video in `videos/index.ts`;
- writes the authoring material to `.cache/work/<slug>/`:
  - `word-timings.md`;
  - one brief pack per scene (`scenes/<id>.md`: the video's intent, the visual brief, narration and word
    timings);
  - `kit-api.md`, the whole scene API on one page.

### 5. Set the visual vocabulary, then build scene 1 yourself

Before any scene, write `scenes/shared.tsx`. It holds the vocabulary every scene reuses:
- role colours: who is who, used the same way in every scene;
- standard positions for recurring layouts;
- recurring props.

Build scene 1 yourself. It proves the kit works for this topic, and it sets the idiom the other scenes
copy. Check it with a contact sheet:

```bash
npx lyceum stills <slug> <scene-id> --at 1,4,8,12,16,20
```

Then look at `.cache/work/<slug>/stills/<scene-id>.png`, a grid of half-scale frames. Contact sheets are
how you see a scene without watching video. They are review scratch: never deliver them.

### 6. Build the remaining scenes

**If your agent can run subagents in parallel,** give each remaining scene its own subagent, using the
template in `references/scene-agent-brief.md`. Launch them all at once.
- **Keep their reading small.** Agents spend most of their time reading, so the brief limits them to four
  files: the scene's pack, the kit digest, `shared.tsx` and scene 1.
- **Put the facts in your scene notes.** They carry every fact a scene needs (real names, values, what the
  neighbouring scenes leave on screen), so no subagent has to look anything up.
- **No conflicts:** each subagent owns only its scene file.

**Otherwise** build the scenes one by one, following the same brief for each.

**Memory:** Lyceum caps the memory-hungry work for the whole machine (slots under the Lyceum home
directory), so contact sheets queue rather than pile up.
- Ask each subagent to plan its layout first and run stills once, with a long timeout.
- On a 16 GB machine, keep about a dozen subagents at most.
- Never start a render while a narration is running.

### 7. Review every scene

Look at every scene's contact sheet yourself. Check for:
- claims that don't match the sources;
- overlaps, or text clipped at the frame edge (keep an 80 px margin);
- stretches over about 6 s where nothing moves;
- elements that arrive before or after their words.

The last 0.45 s of every scene fades through black by design, so a blank final frame is expected.

Fix small things directly. Subagents report kit gaps they worked around. If one is a real kit bug, fix it
in Lyceum itself, not in the project.

As soon as a scene passes review, render it, so the final render only has to join the scenes:

```bash
npx lyceum render <slug> --scene <id>
```

- **Speed:** a scene takes 10–15 s per 40 s of video.
- **Cache:** each scene's render is cached by a fingerprint of everything that shapes it: its file,
  `shared.tsx`, the kit, its narration and the settings. Unchanged scenes are skipped.

### 8. Render and deliver

```bash
npx lyceum typecheck && npx lyceum render <slug>
```

This:
- renders the title card and any scene that's still stale;
- joins them;
- lays the narration clips on the timeline;
- muxes in the captions.

The output is `videos/<slug>/dist/<slug>.mp4`, plus `dist/<slug>.srt`.
- **Title card:** every video opens on its frontmatter `title:` for 2.5 s, so the first frame (what a
  player shows before it starts) names the video. Just after that first frame, a quiet "Sound on"
  reminder rises in below the title.
  `npx lyceum stills <slug> _title` shows the card.
- **Subtitles:** a soft English track by default. `captions: burned` in the script's frontmatter, or
  `"captions": "burned"` in `lyceum.config.json` for every video, draws them into the picture instead.
  Either way, scenes are drawn at 87.5% above a band kept for them, so turning them on never covers a
  scene.
- **Timing:** from nothing, about 2 minutes per 5 minutes of video; seconds if every scene was already
  rendered.
- **Check it:** `ffprobe` should show h264, aac and (unless captions are burned) mov_text streams.
- **Deliver it:** hand the user the file, attaching it if your interface can, otherwise giving its path.

`--draft` renders a 720p preview of one scene to `dist/scenes/<id>.draft.mp4`. It's for quick looks and
never goes into the assembled video. Finals are 1920×1080 at 30 frames per second.

### 9. Commit when asked

Follow the project guide's delivery rules. Commit and push only when the user asks. Never commit build artifacts:
`.cache/` and `videos/*/dist/` are gitignored, and they should stay that way.

Once the user approves the video, record what it was checked against:
`npx lyceum stale --mark <slug>` writes the current commit to the script's `verified:`.

### 10. Keep it current

```bash
npx lyceum stale [<slug>…] [--json]   # which videos' sources changed since they were verified
npx lyceum stale --mark <slug>        # record that a video was checked at the current commit
```

`stale` lists, per video, the commits and files that changed among its sources since `verified:` (or,
without one, since the last commit to touch the video). It exits 1 if any video is stale. Changes to a
video's own directory don't count. It runs on committed history, so a shallow clone needs
`git fetch --unshallow` first.

A changed file doesn't mean a wrong video, and most diffs won't affect it. To revise a stale video:
1. Read the diffs and commit messages against what the narration and `> Visual:` briefs claim. A claim
   is stale when it is now false, or when a name, value or snippet on screen no longer matches. A rename
   can make a claim stale even where the cited file didn't change; moved lines alone don't.
2. If nothing is stale, run `stale --mark <slug>` and you're done.
3. Otherwise make the smallest edit to the script that makes it true, keeping the voice, arc and length.
   Fix the affected scenes to match. Keep cued phrases intact where you can, since `cue()` throws if the
   narration no longer contains its phrase; where you can't, update the cue.
4. Update `sources:`, then `stale --mark <slug>`. Re-narrate only the changed scenes
   (`narrate <slug> --only <scene>`), and render.

## Kit essentials

- `useScene()` returns `{ frame, fps, cue, at, end, narrationEnd }`.
  - Durations are always seconds × `fps`, never raw frame counts.
  - `cue("phrase", { after, end, offset })` returns a scene-relative frame. Matching ignores case and
    punctuation, so a repeated word needs `{ after }`.
  - A phrase missing from the narration throws, so a script edit can't silently desync a scene.
- **Imports:** scenes import everything from `"#kit"`, never from kit files by path.
- **Primitives:**
  - `Text` (manim-style write-on), `Fade`;
  - `Code`, with `codePoint` for placing things against columns, highlights, dim and strike;
  - `Svg` with `Arrow`, `Box` and `Line` (these three must be inside `<Svg>`);
  - `Node` (labelled box), `Card`, `Tape`, `Pill`.
  - Animation helpers: `prog` (manim smooth), `track` (keyframed values), `visibility`.
- **No props:** a scene component takes none. The renderer finds each scene by its video and scene id
  in `videos/index.ts`, which `lyceum scenes` maintains.
- **Font quirks:**
  - JetBrains Mono draws `->` and `==` as ligatures, which matters when aligning by column.
  - `Card` text is 24 px and `Node`'s sub-label is smaller still. Put sub-labels in their own `Text`.
