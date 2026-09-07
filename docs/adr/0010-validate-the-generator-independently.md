# 0010. Validate the generator with an independent re-derivation

**Status:** Accepted

## Context

Since [0001](0001-generate-caves-in-the-browser.md) the caves are generated per
run, and since [0003](0003-gate-the-way-up-on-full-discovery.md) a level that
hides an unreachable secret strands the run with no way up. There is no longer a
committed level file to inspect, so what needs checking is the **generator**, not
an artefact.

`LevelGen.js` already has an internal `validate()` that re-rolls bad levels. A
test that called it would only ever agree with it, including with its bugs.

## Decision

`tools/validate_levels.mjs` rolls many runs and re-derives the invariants
**independently** of the generator's own check — its own flood fill, its own
discoverability fixpoint, its own counting. It exits non-zero on the first
violation and prints the seed, so any failure is reproducible via
`generateLevels(seed)`.

Wired to `npm run check` (validate, then build) and `npm test` (300 runs).

## Consequences

- The two implementations must be kept in step by hand. That is the cost, and it
  is deliberate: the duplication is the test.
- If you change what makes a level valid, change both — and keep the validator a
  re-derivation rather than a call into the generator.
- This replaced a `npm run levels` that had been **broken since the caves moved
  in-browser**: it still wrote to `public/data/`, which no longer exists. A
  validation command that crashes is worse than none, because it is assumed to
  pass.
