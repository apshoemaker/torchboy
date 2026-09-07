# 0004. Fixed authored premise, not model-invented backstory

**Status:** Accepted. Supersedes [0005](0005-randomised-candidate-selection-for-variety.md).

## Context

The story is generated per run. An early version seeded it with a randomly
assembled premise (a register, a remembered object, a reason he went down),
picked from three hand-written pools. The pools showed: a "tin whistle" kept
appearing and read as arbitrary, because it *was* arbitrary — it had no
relationship to the cave the player was in.

Removing the pools and letting the model invent freely was worse. The behaviour
is worth recording because the obvious fixes make it worse, not better:

- Twelve fresh runs produced **twelve tin whistles**.
- Forbidding whistles produced **twelve ledgers**.
- Listing alternative categories in the prompt was worst of all — whatever was
  listed *became* the new pool.

A single sample from a fixed prompt collapses onto one answer. Negation
relocates the collapse; it does not remove it.

## Decision

Fix the premise, author it, and forbid invention past it. The model may treat
exactly one thing as already true — the boy, the cave, the torch, the sense that
it can be made to work better, the unexplained darkness in his heart, the light
he has to reach.

The prompt explicitly forbids inventing a family, a person he lost, a companion,
an animal, a keepsake, or a life above ground. The story must be built from the
darkness in him, what he actually does and sees, and the knowledge that enters
him.

## Consequences

- Variety moves from *setup* to *meaning*. Openings are now necessarily similar —
  they all dramatise the same moment — while what the cave turns out to mean
  varies per run.
- The story is anchored to gameplay, because gameplay is the only material it has.
- The rules that forced a named character and a carried object were removed; they
  were what manufactured the whistles and the dead uncles.
- The written fallback beats had to be rewritten to obey the same premise — they
  referred to his mother's torch and a kitchen floor.
- If endings ever need to diverge more, the lever is the *revelation* prompt, not
  the premise.
