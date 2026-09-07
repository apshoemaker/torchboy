# Decision records

Why the load-bearing decisions were made. Check here before reversing something
that looks arbitrary — most of it isn't, and the rationale is usually a bug that
was expensive to find.

Each record uses the same four sections: **Context**, **Decision**,
**Consequences**, **Status**.

| # | Decision | Status |
|---|---|---|
| [0001](0001-generate-caves-in-the-browser.md) | Generate caves in the browser, not as a baked mesh | Accepted |
| [0002](0002-climb-instead-of-descend.md) | The game climbs; the end-game is escape | Accepted |
| [0003](0003-gate-the-way-up-on-full-discovery.md) | A cavern is not finishable until every secret is found | Accepted |
| [0004](0004-authored-premise-not-invented-backstory.md) | Fixed authored premise, not model-invented backstory | Accepted, supersedes 0005 |
| [0005](0005-randomised-candidate-selection-for-variety.md) | Model enumerates candidates, we pick the index | Superseded by 0004 |
| [0006](0006-keep-the-api-key-server-side.md) | The API key never reaches the browser | Accepted |
| [0007](0007-bake-skin-weights-onto-bmesh-elements.md) | Store bmesh assignment on elements, never in side tables | Accepted |
| [0008](0008-linear-fog-with-an-orthographic-camera.md) | Linear fog, keyed to camera distance | Accepted |
| [0009](0009-articulatory-synthesis-for-the-choir.md) | Physically-modelled vocal tract in an AudioWorklet | Accepted |
| [0010](0010-validate-the-generator-independently.md) | Validate the generator with an independent re-derivation | Accepted |
| [0011](0011-serve-the-container-with-a-node-server.md) | Serve the container with a Node server, not a static file server | Accepted |

## Template

```markdown
# NNNN. Title

**Status:** Proposed | Accepted | Superseded by [NNNN](...)

## Context
What was true, and what forced a choice.

## Decision
What we do now, stated so it can be checked.

## Consequences
What this costs, what it rules out, and what now has to stay true.
```
