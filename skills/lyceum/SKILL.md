---
name: lyceum
description: Make narrated explainer videos about code, systems or ideas with Lyceum (React scenes timed to text-to-speech narration). Use when the user asks for an explainer video, a narrated walkthrough, a video series, or "help me understand X visually", and when they ask to revise, re-narrate, re-render or extend an existing Lyceum video.
---

# Lyceum: explainer videos

A video is one `script.md`. Its narration is synthesized scene by scene, with a timestamp for every
word. Every scene is a React component that times its animation to the spoken words with
`cue("…")`. The output is an MP4 that teaches one thing: why it exists, the problem it solves, and how
it works.

**Accuracy matters more than polish.** A beautiful animation of a wrong claim is worse than no video.

## 0. Find the project and read its brief

A Lyceum project is the directory holding `lyceum.config.json`, found at or above the working directory.
Run every command from there. If there is none, ask the user where the videos should live and run
`npx lyceum init <dir>`, then `npm install`.

Read the file named by the config's `brief` (usually `brief.md`) before anything else. It holds what this
skill can't know:
- who the audience is;
- where ground truth lives (repositories, design docs, tests);
- project house rules: names, pronunciations, terms;
- how work is reviewed and delivered.

**Where the brief and this skill disagree, the brief wins.** The config can also set a default `voice`,
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

Fill in `videos/<slug>/script.md`. Each scene is:
- a `## NN · id — Title` heading;
- `> Visual:` lines, the animation brief;
- narration paragraphs.

List the sources in the frontmatter.

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

**Gate:** show the user the arc as numbered one-line scenes, with the script's path, and wait. They may
waive review ("I trust your script"). Respect that, but still show the arc.

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
  - one brief pack per scene (`scenes/<id>.md`: the visual brief, narration and word timings);
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
- renders any scene that's still stale;
- joins the scene videos;
- lays the narration clips on the timeline;
- muxes in the captions.

The output is `videos/<slug>/dist/<slug>.mp4`, with soft English subtitles, plus `dist/<slug>.srt`.
- **Timing:** from nothing, about 2 minutes per 5 minutes of video; seconds if every scene was already
  rendered.
- **Check it:** `ffprobe` should show h264, aac and mov_text streams.
- **Deliver it:** hand the user the file, attaching it if your interface can, otherwise giving its path.

`--draft` renders a 720p preview of one scene to `dist/scenes/<id>.draft.mp4`. It's for quick looks and
never goes into the assembled video. Finals are 1920×1080 at 30 frames per second.

### 9. Commit when asked

Follow the brief's delivery rules. Commit and push only when the user asks. Never commit build artifacts:
`.cache/` and `videos/*/dist/` are gitignored, and they should stay that way.

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
