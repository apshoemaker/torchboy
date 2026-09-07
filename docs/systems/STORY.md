# The story system

Torchboy's story is **written by Claude while the game is played**, from a log of
what the player has actually done. It is never the same twice, and never the same
for two runs through the same cave.

Files: `tools/story-plugin.mjs` (server), `src/game/Narrator.js` (client),
`src/game/Chronicle.js` (the log).

## Shape

`Chronicle` records events in words a model can use — how far he has walked with
nothing to show for it, that his torch went cold at a wall and he walked away
anyway, that he has begun retreading his own footprints, that he has left nothing
in this cavern unopened. `Narrator` sends that log plus everything already told
to `POST /api/story/next`, and gets back one of three things:

| `want` | Returns | When |
|---|---|---|
| `beat` | `{text}` | on events and on distance walked, with a randomised gap |
| `revelation` | `{knowledge, response}` | when a sealed way is opened |
| `ending` | `{text}` | walking into the daylight |

Beats are **prefetched**: the moment one is shown, the next is requested, so the
network is never on the critical path.

## The premise is fixed and authored

The model may treat exactly one thing as already true:

> Torchboy finds himself in a deep dark cave. He knows that his torch can help
> find secret passages, and that there must be some way to make his torch work
> better. He has a darkness in his heart that he does not understand, but he
> knows that he has to get out of this cave and go into the light.

Everything past that has to come from the cave. The prompt **forbids** inventing
a family, a person he lost, a companion, an animal, a keepsake, or a life above
ground — he does not remember getting here and nobody is with him.

The story is built from three things only:

1. **The darkness in him** — unexplained at the start, and what the whole arc is
   slowly uncovering.
2. **What he actually does and sees** — the walking, the cold, the passages, the
   embers, what the old miners left.
3. **The ancient knowledge** that enters him on a discovery, which is not his,
   does not care about him, and cannot be un-known.

## Why it is authored: prohibitions move the mode, they do not remove it

An earlier version left the backstory entirely to the model. The results are
worth recording, because the failure is not obvious and the obvious fixes make it
worse:

- Twelve fresh runs produced **twelve tin whistles**.
- Forbidding whistles produced **twelve ledgers**.
- Listing alternatives in the prompt was *worse*: whatever was listed became the
  new pool.

A single sample from a fixed prompt collapses onto one answer, and negation only
relocates the collapse. An intermediate fix worked — have the model enumerate six
different possibilities in one completion and commit to a randomly chosen index,
which genuinely spread the distribution — but the premise supersedes it.
See [adr/0004](../adr/0004-authored-premise-not-invented-backstory.md).

## Continuity is mandatory and stated every time

The live design knows the run but has to be told, in the prompt, on every call,
that it is CONTINUING: never restate, never summarise, never start over, and
anything already established stays established and recurs.

An earlier prompt asked for beats that "leave things unsaid" and said the best
beat "implies a whole life in twelve words". That is a recipe for standalone
aphorisms and that is exactly what came back — atmospheric, and not a story.
The rewrite makes continuity checkable: every beat must advance the situation,
beat N must read as the consequence of beat N−1, and by the end it must have been
one story with a cause and a consequence.

With those rules a run produces a real through-line — the dark was *fed*, once;
the payment was always a child sent down with a light; the miners were not
digging for ore but building rooms to keep something sleeping; the light above
hungers too.

## The bestowal

Opening a sealed way, or climbing into a new cavern, brings something up out of
the floor and into him: a cold orb rises from the stone, arcs in, and enters his
chest. Each revelation is a **pair** — the knowledge, in a colder register that
is never in his voice and never about him, and his response a few seconds later.
They are styled differently on screen for the same reason: the beats are his
memory, a revelation is something handed to him from outside.

Two things the effect needed that were not obvious:

- **Spawn it on the camera side of him.** Rising from directly beneath put the
  orb behind his own body for most of the climb, so most of the animation was
  invisible.
- **Keep it dimmer than the torch.** At first pass its point light peaked at 34
  against the torch's ~30 and washed the cavern white, burying the orb it was
  meant to light.

## Constraints

- **Structured output** (`output_config.format` with a Zod schema) is what makes
  this reliable — a beat comes back as `{text}`, a revelation as
  `{knowledge, response}`, not prose to parse.
- **The key stays server-side.** `tools/story-plugin.mjs` is Vite middleware;
  anything under `src/` ships to the browser.
  [adr/0006](../adr/0006-keep-the-api-key-server-side.md)
- **Failure is silent and soft.** No credentials → 503 → the client uses written
  fallback beats and the game plays normally.
- **Do not give the model information you do not want it to use.** An early
  version listed the three cavern names for texture and told the model not to
  name them. It named all three, in the wrong cavern, contradicting the HUD. The
  fix was to remove the names from the prompt, not to prohibit harder.
- The fallback beats in `Narrator.js` must hold to the same premise. They once
  referred to his mother's torch and a kitchen floor, which the premise forbids.

## Editing the prompt

Read the whole of `tools/story-plugin.mjs` first — it is short and the prompt is
the design. Then change it, and evaluate by running **several full playthroughs**
and reading them end to end. One sample tells you nothing about variety, and
variety is what usually breaks.
