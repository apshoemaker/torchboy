# 0009. Physically-modelled vocal tract in an AudioWorklet

**Status:** Accepted

## Context

The shimmer that rises as the player nears something worth finding needed to
sound like a distant choir. Additive and filtered-noise pads read as synth pads,
not voices — the giveaway is that a real voice has formants that move together
because they come from one resonating tract.

An existing npm port of Pink Trombone was available, but it uses a
`ScriptProcessorNode`, which is deprecated and runs on the main thread. In a game
that means the renderer and the synth stall each other.

## Decision

Implement a Kelly–Lochbaum digital waveguide (the tract as 44 cylindrical
sections) driven by Fant's LF glottal-flow model plus aspiration noise, written
from the published model so it can run in an **AudioWorklet**, off the main
thread.

**One tract, five glottal voices.** Every voice sings the same vowel, so they
share a tract: five pulse trains summed into one waveguide, ~25M float-ops/sec
instead of ~127M for five tracts. No nasal branch — for a closed-velum "oh" it
contributes nothing and costs ~40% more.

## Consequences

- Verified by measurement, and those numbers are the regression baseline: **F1
  413Hz / F2 853Hz** (textbook choral "oh"), fundamental **31dB above the noise
  floor**.
- Two settings that sound plausible are wrong, and both were found by measuring:
  "high aspiration, low tenseness" puts noise at **1.48×** the pitched component
  and produces wind rather than a voice; and filtering the breath on the way *in*
  means it never excites F2, so the tract has no vowel to shape. Darken the
  output, never the excitation.
- The worklet is the only off-main-thread code in the repo and is loaded by URL
  rather than imported, which is a different failure mode from the rest of the
  codebase — hence the additive fallback choir if it cannot load.
