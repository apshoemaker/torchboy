# 0003. A cavern is not finishable until every secret is found

**Status:** Accepted

## Context

Secrets were optional. A player could walk to the staircase and climb, having
found nothing, which meant the discovery mechanic — the entire point of the game
— was skippable. It also meant the story, which is driven by what the player
does, had very little to work with.

## Decision

The way onward does not exist until **every** secret on the level is open. Not
locked — **absent**: not rendered, not lit, not drawn on the minimap, and not
audible to the choir. Opening the last secret makes it rise out of the floor
about two seconds later, after the knowledge has entered him.

## Consequences

- The HUD counter becomes per-level (`passages here 2/3`), because that number is
  now the thing standing between the player and the way out.
- **Every secret must be findable, or the run is stranded with no way up.** This
  was previously harmless. The generator now checks progressive discoverability:
  open everything the player can currently stand beside, re-flood, repeat, and
  reject the level if anything is left over. Verified across 900 generated
  levels, 0 uncompletable, at no measurable cost (~10ms per run, 0 re-rolls in
  200).
- Reachability of the *secret tile* is not the test — what has to be reachable is
  the floor beside it, because that is where the torch opens it from. Opening one
  secret can be what puts the player beside the next.
- The two-second gap between the knowledge and the stairs is deliberate: it makes
  the knowledge read as the cause and the way up as what it buys, rather than two
  things flashing at once.
