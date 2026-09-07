# Workflows

How to make a change here and know whether it worked.

## The gate

```bash
npm run check        # validate the cave generator, then build
```

Run it before claiming a change is done. It is fast (a few seconds) and it is
the only thing in this repo that will tell you "no" on its own.

```bash
npm test             # the generator invariants over 300 runs (~3s)
npm run levels       # the same, 150 runs
```

There is **no linter or formatter**. Match the surrounding style: comments
explain *why*, not *what*, and a measured number beats an adjective.

## The standing rule: measure, don't eyeball

Most of this project's worst bugs looked fine. The character was "animated" for
days while 1750 of its 1792 vertices had no vertex group. The choir "sounded
ethereal" while it was 1.48× noise. Foot-slide was "a bit off" at 5.91×.

So: when you change something visual or audible, produce a **number**, and
prefer a number that would be different if the change had not worked.

Two failure modes to watch for in your own measurements:

- **The metric may be silently invalid.** `preserveDrawingBuffer: false` makes
  canvas pixel readback return blank — a "0% blown pixels" result that meant
  nothing. Sanity-check that your measurement can *fail*.
- **The harness may be the bug.** A stale Vite module instance once made a
  working fix look broken; a naive straight-line walk into a wall looked like a
  broken game mechanic. Before believing a bad result, check the rig.

## Verifying a change in the browser

The game exposes `window.__game` in dev — `grid`, `player`, `cavern`, `props`,
`narrator`, `chronicle`, `cam`, `minimap`, and the run-state object. This is a
**debug seam for tests, not an API**; don't build features on it.

Drive the real game and assert on real state. A workable shape:

```js
// wait for boot
await page.waitForFunction(() => window.__game?.props &&
  document.getElementById('loading').classList.contains('gone'));

// act through the real input layer, so gait, head-turn and camera behave
// exactly as they do under a player's hands
await page.keyboard.down('KeyW'); /* ... */ await page.keyboard.up('KeyW');

// assert on state, not on a screenshot
const { total, found } = await page.evaluate(() =>
  window.__game.cavern.countOn(window.__game.game.level));
```

Two things that will waste your time if you don't know them:

- **The caves are not convex.** A straight-line walk toward a target walks into
  a wall. BFS the tile grid for a path and walk the corners.
- **Proximity thresholds are tight.** The torch opens a secret within 2.6 world
  units and tiles are 2 wide, so stopping "next to" a secret can leave you at
  2.7 and nothing happens. Aim at the secret itself and let collision stop you.

## Changing the story

The prompt lives in `tools/story-plugin.mjs` and is the whole design surface.
Read [systems/STORY.md](systems/STORY.md) before editing it — particularly the
finding that **prohibitions move the failure mode rather than removing it**.

To evaluate a prompt change, run several full playthroughs against the endpoint
and read them end to end. A single sample tells you nothing about variety, and
variety is usually what breaks.

## Changing audio

Verify by spectrum, not by ear. [systems/AUDIO.md](systems/AUDIO.md) lists the
measurements that matter (formant frequencies, harmonic-to-noise ratio,
sample-to-sample discontinuity) and the numbers the current build hits.

## Changing the caves or the level rules

`npm test` is the real check. If you change what makes a level valid, change
`tools/validate_levels.mjs` too — and keep it an *independent* re-derivation of
the rule rather than a call into the generator's own `validate()`.

## Rebuilding assets

`npm run assets`. Read [systems/ASSETS.md](systems/ASSETS.md) first — the bmesh
rules there are not optional, and violating them produces a mesh that looks
correct in Blender and is silently broken in the game.

## Recording media for the README

Clips in `docs/media/` are captured by driving the real game through the real
input layer, with the camera pulled closer than the shipped `viewSize` so the
character reads at GIF size. Nothing else is altered. If you re-record, keep
that constraint and keep the disclosure line under the clips in `README.md`.
