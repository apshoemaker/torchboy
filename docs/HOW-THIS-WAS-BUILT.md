# How this was built with coding agents

Torchboy was built end to end in a conversation with **Claude Code** — 27
prompts over about 25 hours of wall-clock time, 793 tool calls, no code typed by
hand. The [full transcript](transcript/) is in this repo, one chapter per prompt.

This document is the honest version of what that was like: which tools did which
work, when, why — and the four lessons that cost the most to learn.

## The shape of it

| | |
|---|---|
| Prompts from the human | 27 |
| Tool calls by the agent | 793 |
| Elapsed | ~25 hours across two days |
| Lines of code written by hand | 0 |

The human's prompts are almost entirely **art direction and bug reports**, not
instructions: *"the head is not moving"*, *"it sounds sort of like rushing air"*,
*"the tin whistle piece is weird"*, *"lol maybe not go down again"*. Read the
[transcript index](transcript/) — the whole game is specified in about two pages
of plain English.

## The tools, and what each was for

| Tool | Calls | What it did |
|---|---|---|
| **Bash** | 418 | the main work surface: file edits, one-off measurement scripts, `ffmpeg`/ImageMagick |
| **Playwright MCP** | 286 | driving the real game in a real browser |
| **Blender MCP** | 23 | a live Blender session for authoring and inspecting meshes |
| **Read** | 29 | reading files and rendered images back |
| **ToolSearch** | 9 | loading deferred tool schemas on demand |
| **WebFetch / WebSearch** | 5 | pulling reference docs at the end |

### Bash, for everything including the edits

Most of the 418 Bash calls are file edits — `python3` heredocs doing anchored
string replacement, rather than a dedicated edit tool. That has one property
worth stealing: **an anchored replacement can fail loudly.** Twice in this
project a patch silently matched nothing and reported success, and the bug
showed up much later as a blank ending card. After that, every patch asserted
its anchor existed before writing, which caught the next one immediately.

The other big use is **one-off measurement scripts**: a node script that rolls
900 caves and checks every one is completable; a script that measures the
foot-slide ratio; a script that runs three full story playthroughs against the
live API and prints them side by side.

### Playwright MCP, for verifying things that cannot be unit-tested

A game is visual and audible. Almost none of it can be asserted from a unit
test, so the agent drove the actual game in an actual browser — 128
`browser_evaluate`, 81 `navigate`, 53 `screenshot`, 24 `run_code_unsafe`.

Three distinct jobs:

1. **Assertions on real state.** Walk the character to a wall through the real
   keyboard input layer, then read `cavern.countOn(level)` to check the passage
   opened. Play a whole run to the ending and assert the restart button appears.
2. **Reading the screen back.** Screenshots rendered into the conversation, so
   the agent could look at what it had made — which is how the hero image was
   art-directed and how the "floating props" bug was confirmed.
3. **Recording the media.** The GIFs in this README are captured via the Chrome
   DevTools Protocol screencast, driven through the real input layer, then
   assembled with `ffmpeg`. The [capture approach](WORKFLOWS.md#recording-media-for-the-readme)
   is documented.

### Blender MCP, early and then deliberately not

The character and props were authored by running Python in a **live Blender
session** over MCP — fast to iterate when you can render a preview and look at
it. But the session state is invisible and unreproducible, so the same scripts
were moved to a **headless** build (`npm run assets`) as soon as they worked.
The live session stayed useful for inspection; the headless path is the one that
ships.

### Web research, last

Four `WebFetch` calls and one search, all at the end, to read the two references
the documentation restructure was based on: rust-analyzer's `architecture.md`
and OpenAI's agentic-legibility scorecard. The OpenAI blog post returned 403, so
the agent used OpenAI's own published skill artifact instead of guessing at the
contents — worth noting, because the alternative was inventing a plausible
structure and attributing it to a source it had not read.

## Roughly when each tool mattered

| Phase | Prompts | Dominant tool |
|---|---|---|
| Character, props, cavern meshes | 1–3 | Blender MCP |
| Animation and rendering bugs | 2–3, 11–12 | Playwright (assert on state) |
| Generated audio | 4–6 | Bash (node scripts measuring spectra) |
| The live story | 7–9, 18–22 | Bash (`curl` + full playthroughs) |
| Procedural levels, gating | 13–15, 19 | Bash (invariant sweeps over 900 levels) |
| Hero image and GIFs | 22–24 | Playwright (CDP screencast) + ffmpeg |
| Docs, container | 25–29 | WebFetch, Bash, Docker |

## The four lessons that cost the most

### 1. Measure, don't eyeball

Every serious bug in this project looked fine.

- The character was "animated" for a whole session while **1750 of its 1792
  vertices had no vertex group** — the clips played, the bones moved, and
  nothing on screen budged. Counting unweighted vertices found it in one query;
  looking at it never would have.
- The choir "sounded ethereal" while measuring **1.48× noise to pitched signal**.
  It was wind, not a voice.
- Foot-slide was "a bit off" at **5.91×**.

The rule the project now runs on: a claim about behaviour comes with a number,
and the number has to be one that would look different if the change had not
worked.

### 2. The agent's own test rig is a suspect

Twice, a *working* fix looked broken because the harness was wrong:

- A bare dynamic `import()` in a test got a different module instance than the
  HMR-versioned one the game used, so a correct fix appeared to do nothing.
- A naive straight-line walk toward a target walked into a wall — the caves are
  not convex — which looked exactly like a broken game mechanic.

And once, a measurement was silently meaningless: `preserveDrawingBuffer: false`
makes canvas pixel readback return blank, so a "0% blown pixels" result was
measuring nothing at all.

Before believing a bad result, check the rig.

### 3. Prohibitions move a failure mode; they do not remove it

The story originally let the model invent the boy's backstory. Twelve runs
produced **twelve tin whistles**. Forbidding whistles produced **twelve
ledgers**. Listing alternatives in the prompt was worse still — whatever was
listed became the new pool.

A single sample from a fixed prompt collapses onto one answer, and no amount of
negation fixes that. The fix was structural: either supply the entropy
([adr/0005](adr/0005-randomised-candidate-selection-for-variety.md)) or stop
asking for invention at all ([adr/0004](adr/0004-authored-premise-not-invented-backstory.md)).

### 4. Documentation rots silently, and agents believe it

When the caves moved from a baked mesh into the browser, `npm run levels` and
`npm run assets` kept referring to a `public/data/` directory that no longer
existed. Both had been **broken for days** without anyone noticing, because
nothing ran them. The README meanwhile described a premise system that had been
deleted, an endpoint that had been renamed, and a story architecture that had
been replaced.

None of that was found by reading. It was found by *running the commands* while
writing the documentation that claimed they worked — and by containerizing,
which is what exposed that two runtime dependencies had been mislabelled as dev
dependencies all along.

## What this repo does to stay legible to agents

The structure follows OpenAI's agentic-legibility rubric — a short
[`AGENTS.md`](../AGENTS.md) as a table of contents rather than a manual, with
the real material in `docs/`, decisions in [`adr/`](adr/), and a validation
command (`npm run check`) that can actually say no. See
[ARCHITECTURE.md](ARCHITECTURE.md).

## The transcript

[**docs/transcript/**](transcript/) — all 27 prompts and what followed each one.

It is rendered from the raw session log with three things removed: ~40MB of
base64 image data (screencast frames), home directory paths, and session-local
temp paths. Tool output longer than ~40 lines is truncated and marked. Nothing
else is edited — including the wrong turns, the misdiagnoses, and the two
occasions the agent had to correct itself.
