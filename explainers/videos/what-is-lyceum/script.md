---
title: "Lyceum: explain the picture in your head"
status: approved by Andrew 2026-10-07, voice cedar
updated: 2026-10-07
# Written form → spoken form, applied only to the text sent to the voice.
pronounce: {}
sources:
  - README.md (what Lyceum is, getting started, requirements, cost of a voice)
  - skills/lyceum/SKILL.md (the workflow: research, script gate, narrate, scenes, review, render; sources per claim)
  - tools/render.mjs (one scene re-rendered on its own; unchanged scenes reused)
  - kit/cue.tsx (every element timed to the words that introduce it)
  - LICENSE (MIT)
---

<!--
Format: one `## NN · id — Title` per scene. `> Visual:` lines describe the animation; every other
paragraph is narration, spoken in order. The narration is the only text sent to TTS, so it is
written for the ear: no identifiers that read badly aloud, short sentences. The intent above the
first scene is never narrated.
-->

# Intent

- **Point:** you can turn what you understand into a short, precise, animated explanation by writing
  a script and letting your coding agent build it, and reviewing it feels like reviewing a document.
- **For:** the README. Knowledge workers at technical companies: engineers first, but designers and
  product managers too. No implementation details.
- **Angle:** starts with the picture in your head that never survives the whiteboard, shows what the
  best explanations do, then what using Lyceum is like, and ends by revealing that this video is itself
  a script.
- **Length:** under three minutes.
- **Notes:** the running example is a small diagram (request → cache → database) that first gets
  erased, then comes back built properly in scene 2, and appears in sync with its words in scene 5.
  Every visual should feel like a calm, clean diagram, never busy.

## 01 · whiteboard — The picture in your head

> Visual: Center: a small diagram draws itself as a sketch: three boxes, "request" → "cache" →
> "database", with arrows. On "the picture moves", a dot travels along the arrows. On "it gets
> erased", a wipe sweeps across and the diagram is gone. On "a document", a page of grey text lines
> appears where it was, the boxes' labels now buried in paragraphs. On "a meeting", the page shrinks to
> the left and a calendar block "Architecture walkthrough" appears, then a second identical one stacks
> under it on "next month".

You understand something well. How a system fits together, or why a design went the way it did. In
your head, it's a picture, and the picture moves.

Then you have to explain it. You draw it on a whiteboard, and it gets erased. You write a document,
and the picture flattens into paragraphs. You book a meeting, and next month you book it again.

## 02 · good-explanations — What the best explanations do

> Visual: The canvas clears. The same diagram rebuilds cleanly: "request" appears on "a diagram
> builds", "cache" on "each piece", "database" on "the moment it's mentioned", arrows after. A caption
> strip along the bottom shows the spoken words, the current one highlighted. On "days to make", the
> diagram dims and a row of calendar days fills in, one after another, labelled "storyboard",
> "animate", "record", "edit". On "almost nobody", everything fades to a single line: "so it stays in
> your head".

The clearest explanations you've ever watched do something simple. A diagram builds on screen while a
voice explains it. Each piece appears the moment it's mentioned, so you always know where to look.

Those videos take days to make, with animation software and a microphone and a lot of patience. So
almost nobody makes them for the things they explain at work.

## 03 · a-script — It starts as a script

> Visual: A document panel titled "script.md" writes on, real format: a heading "## 02 · cache —
> Where reads go first", a blockquote "> Visual: three boxes, request → cache → database…", and a
> narration paragraph "Every read checks the cache first…". On "what's on screen", the Visual line
> highlights; on "what's said", the narration paragraph highlights. On "no timeline", a ghosted
> animation timeline with keyframe diamonds appears to the right and is struck through.

With Lyceum you write it instead, as one script in plain text. Each scene says two
things: what's on screen, and what's said.

There's no timeline to drag and no keyframes to set. Your coding agent does the rest.

## 04 · the-loop — Your agent builds it

> Visual: A row of seven stations left to right, each a labelled node: "research", "script", "your
> review", "voice", "scenes", "check", "render". They light up in turn as narrated. "your review" is a
> different colour, with a small person mark, and on "stops" the travelling highlight pauses there. On
> "checks every scene", a small grid of stills (a contact sheet) pops up above "check". On "renders the
> video", a play-button video card appears at the end of the row.

Ask it for a video about your caching layer, your onboarding flow, or your new pricing. It reads the
real sources first: the code, the design documents, the notes. It drafts the script, and then it
stops, so you can review it.

Once you're happy, it gives the script a voice, builds every scene, checks every scene by looking at
stills from it, and renders the video.

## 05 · in-sync — The picture follows the words

> Visual: Top half: the request → cache → database diagram, empty at first. Bottom: this scene's
> narration as text, words lighting up as spoken. On "says cache", the cache box appears with a thin
> line from the word "cache" up to it; same for "database". On "edit a sentence", the narration
> sentence changes (a word is inserted, pushing "cache" later) and the box's appear-marker slides to the
> new moment. On "point at a moment", a video scrubber appears with a pin dropped on it; on "only that
> scene", one segment of the scrubber lights while the others stay grey.

Every piece of the picture is tied to the words that introduce it. When I say cache, the cache
appears. And when I say database, there it is. Edit a sentence, and the animation follows it. Nothing
needs retiming.

Reviewing feels like reviewing a document. Watch the video, point at a moment, and ask for a change.
Only that scene is rebuilt.

## 06 · for-anyone — Precise, for anyone

> Visual: Four cards fan in one at a time, each with a role and a tiny diagram: "Engineer · how our
> services fit together", "Designer · why this flow works", "Product · how the feature behaves",
> "Everyone · a postmortem, in order". On "says what's true", the cards settle and a script page slides
> in with its sources list highlighted, each source ticking on.

An engineer can explain a system to a new teammate. A designer can walk through why a flow works. A
product manager can show how a feature behaves before it ships. And anyone can tell a postmortem in
the order things happened.

Because the agent works from your sources, the video says what's true, and the script lists where
every claim came from.

## 07 · this-video — This video was a script

> Visual: The frame pulls back to reveal this video's own script.md, scrolling past the scene headings
> 01 to 07 and stopping on this one. On "a few cents", a small price tag appears. On "free and open
> source", the script slides away and the title "Lyceum" writes on with the tagline "Explainer videos
> made of animated, narrated diagrams, written as a script and built by your coding agent." Below it,
> the opening's request → cache → database diagram draws itself once more, and the dot travels through
> it on "the picture in your head".

Everything you just watched started as a script, about four hundred words long. The voice
cost a few cents.

Lyceum is free and open source. Install it, ask your agent for a video, and share the picture in
your head.
