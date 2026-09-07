# Audio

There are **no audio files**. Everything is synthesised at runtime.

Files: `src/game/Ambience.js` (the score), `src/game/Choir.js` (the chain around
the voice), `src/audio/vocal-tract-processor.js` (the AudioWorklet).

## The score

`Ambience.js` never loops, costs no download, and can read the game: the drone
shifts a whole tone per level, and a cold cluster fades up as the torch senses a
hidden way, so the music plays the same hot/cold hunt as the flame and the HUD.

Deliberately un-insistent, by construction rather than by mixing:

- a **minor hexatonic scale with no leading tone**, so no phrase ever demands a
  resolution
- pitches chosen by a **random walk** rather than independent picks — a walk
  wanders, independent picks sound arbitrary
- drone LFOs at **incommensurate rates**, so it breathes without settling into an
  audible cycle

Nothing states a beat.

## The choir

When something worth finding comes into range, a distant chorus fades up and
crescendos as you close on it.

It is a **physically-modelled vocal tract**, not a pad: a Kelly–Lochbaum digital
waveguide (the tract as a chain of 44 cylindrical sections) driven by Fant's LF
glottal-flow model plus aspiration noise. Same physics as Pink Trombone, written
from the published model so it can run in an **AudioWorklet** — the npm port of
Pink Trombone uses a `ScriptProcessorNode`, which is deprecated and runs on the
main thread, which in a game means the renderer and the synth stall each other.
[adr/0009](../adr/0009-articulatory-synthesis-for-the-choir.md)

**One tract, many glottal voices.** A real choir is many tracts, but every voice
here sings the same vowel, so they share one: five glottal pulse trains summed
into a single waveguide. ~25M float-ops/sec instead of ~127M for five tracts, and
the tract is what supplies the vocal character anyway. No nasal branch either —
for a closed-velum "oh" the nose contributes nothing and costs ~40% more.

Each voice drifts on its own slow LFO (0.1–0.3Hz, a few cents), so they are never
quite in tune with each other. That is what a choir is.

### Verified by measurement, not by ear

- **It is a vowel.** Exciting the tract with noise alone makes the spectrum its
  transfer function, so the formants are unambiguous. At the default the tract
  measures **F1 413Hz, F2 853Hz** — a textbook choral "oh" (reference 450/900).
  Opening the vowel raises F1 to 536Hz, as it should.
- **It is sung, not exhaled.** The sung fundamental sits **31dB above the noise
  floor**, with three tonal harmonics.

### Two things this got wrong first

- **"High aspiration, low tenseness" makes wind, not a voice.** Those settings
  put breath noise at **1.48× the pitched component**, and noise through a vocal
  tract is just filtered air. A choir is *sung*: breath is a texture on top of a
  clearly pitched tone. Tenseness 0.58 / aspiration 0.20.
- **Darken the output, never the excitation.** The breath was filtered at 1.3kHz
  on the way *in*, so it never excited F2 and the tract had no vowel to shape.
  The excitation must be broadband; the output filter does the darkening.

### The chain around it

The ethereal part is not the voice, it is the chain: a lowpass above F2, a fixed
shelf on the top, three modulated delay taps to turn one tract into a section,
and a wet send that is ~80% of the signal. The dry, present component only
appears once you are close, so the sound walks toward you out of the dark.

The crescendo is a **smoothstep, not a square** — squaring keeps it near-silent
for most of the walk in and then lurches at the end.

Radii are per prop: embers sing from 8 units, treasure from 14, the way out from
17. A chorus that sang for all 18 embers would be wallpaper. A **sealed** way out
does not sing at all, or the shimmer would walk you to a door you cannot open.

## Three fixes that had to be measured

- **Two buses, not one.** The dark bed runs through a lowpass that closes down to
  keep the cave muffled; the shimmer and the discovery chime bypass it. Routed
  through the one filter they measured *zero* energy above 1.5kHz.
- **No sharp transients anywhere.** A percussive cave-drip voice was tried and
  cut — at ambient volume its 5ms attack read as a click, not as water. Every
  remaining voice fades in over at least 0.35s.
- **The reverb impulse is lowpassed as it is generated**, and the noise bed's
  loop is crossfaded closed. Raw white noise made a grainy tail that fizzed on
  every note (~80% of peak jump between adjacent samples, now ~11% on tonal
  material), and a buffer whose first and last samples differ steps audibly every
  time round.

## Constraints

- **Audio must never break startup.** If the worklet cannot load, an additive
  fallback choir takes over.
- Browsers require a gesture before audio starts. `M` mutes, and the setting
  persists.
- When changing any of this, verify by spectrum. The numbers above are the
  regression baseline.
