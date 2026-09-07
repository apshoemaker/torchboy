# 0002. The game climbs; the end-game is escape

**Status:** Accepted

## Context

The game originally descended: level 0 was the top, the player went down, and the
goal was to reach the bottom. But the story that emerged — a boy who has to get
out and into the light — makes the bottom the wrong destination. Descending
toward an escape is incoherent.

## Decision

Reverse the game. **Level 0 is the deepest**, levels stack upward
(`levelY = level * drop`), and the end-game is reaching daylight at the top of
the last cavern.

`>` becomes the way *up* and is **walkable** — a staircase he steps onto, rather
than a shaft he steps around.

## Consequences

- The ending is an ascension, which is what makes the final animation land.
- Anything phrased as a descent is stale. This bit twice: `Props.setActiveLevel`
  kept an `i + 1` that used to mean "the level below" and now meant "the level
  above", leaving every ember and chest hanging nine units overhead, still
  glowing because they are emissive.
- `>` being walkable rather than a hole changed both collision and the minimap,
  which draws it as solid.
- Prompt and documentation language has to be checked for direction words
  whenever either is edited.
