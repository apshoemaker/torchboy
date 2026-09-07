# Architecture

If you want to familiarise yourself with this code base, you are in the right
place. This document is about the **shape** of the system and the constraints
that hold it together — not an API reference. Where a rule exists because
breaking it produced a specific, memorable bug, the bug is named, because the
rule is easier to keep when you know what it is defending against.

See also: [SETUP.md](SETUP.md), [WORKFLOWS.md](WORKFLOWS.md), the deep dives in
[systems/](systems/), and the decision records in [adr/](adr/).

## Bird's Eye View

Torchboy is a browser game with **no content pipeline at runtime**. Almost
nothing it shows you was authored ahead of time:

- The **caves** are generated in the browser at load, per run, and validated
  against their own design invariants before they are shown.
- The **geometry** is built from those grids in the browser, as three.js
  `BufferGeometry`. There is no cavern mesh to download.
- The **music** is synthesised, not sampled. There are no audio files at all.
- The **story** is written by Claude while you play, from a log of what you have
  actually done.

Only the character and the props are baked artefacts (`public/models/*.glb`,
~500KB total), and even those are produced by scripts in `blender/` rather than
modelled by hand.

The data flow of a single run is a straight line:

```
LevelGen.js         roll caves until a set passes validate()
      |  grid: rows of chars, one array per level
      +--> Grid.js        collision, floor height, line of sight
      +--> CavernMesh.js  -> Cavern.js   the meshes you see
      +--> Props.js                      pickups, stairs, the way out
      +--> Minimap.js                    fog of war

main.js             owns the frame loop and all wiring between systems
      |
      +--> Player/Expression/Torch/IsoCamera/Cutaway    what you see and steer
      +--> Chronicle.js  -> Narrator.js -> /api/story/next -> Claude
      +--> Ambience.js   -> Choir.js    -> vocal-tract-processor.js (worklet)
```

**`main.js` is the only place systems meet.** Everything in `src/game/` is a
leaf that knows about the grid and its own concern, and nothing else. That is
what keeps a change to, say, the choir from being able to break the minimap.

## Code Map

This section describes what lives where, and the constraints local to each part.

### `src/main.js`

Boot sequence, the `renderer.setAnimationLoop` frame loop, and every piece of
wiring between systems. Also owns the `game` object — the small pile of run
state (`level`, `found`, `won`, `ended`, `transition`) that several systems read.

**Architecture Invariant:** systems do not import each other. If two systems
need to interact, they do it here. The one deliberate exception is that most
systems take `grid` in their constructor, because the grid is the shared
description of the world.

`window.__game` is exported in dev and is how the browser-driven tests reach in.
It is a debug seam, not an API — do not build features on it.

### `src/game/LevelGen.js`

Cellular-automata caves, then features placed on the result, then **the level is
validated and re-rolled if it fails**. Cave generation is cheap (~10ms for three
levels) and a bad roll is worth throwing away rather than shipping.

CA smoothing reliably merges all open space into one blob, so naturally sealed
pockets are rare. Secret rooms are therefore **carved deliberately** into solid
rock, and each carve is verified to be unreachable while its `S` wall counts as
solid, and rolled back if it leaks.

Tiles:

```
 #  rock              .  floor            S  secret wall      P  spawn
 <  the way he came   >  the way onward   F  ember            *  crystal
 T  secret treasure   X  the way out
```

**Architecture Invariant:** the way onward must be reachable *without* opening
any secret, and every secret must itself be findable. These two pull in opposite
directions and both matter — see [adr/0003](adr/0003-gate-the-way-up-on-full-discovery.md).
`tools/validate_levels.mjs` re-checks them independently of this file's own
`validate()`, deliberately: a validator that called the generator's own check
would only agree with its bugs.

### `src/game/Grid.js`

The authority on the world as *data*: what a tile is, whether you can stand
there, how high the floor is, and whether a wall blocks a sight line.

**Architecture Invariant:** `floorHeight()` is a line-by-line port of the same
function in `blender/build_cavern.py` and must stay bit-identical to it. If the
two drift, the player floats above or sinks into the ground that Blender built.
`FLOOR_SUB` appears in both files.

`viewBlocked()` marches the grid rather than testing triangles — about 20 tile
lookups instead of ~12k intersection tests per frame.

### `src/game/CavernMesh.js`, `src/game/Cavern.js`

`CavernMesh` turns a grid into geometry (a JS port of `blender/build_cavern.py`);
`Cavern` owns the resulting per-level meshes and the secret-reveal animation.

Rock and floor are built on a lattice **2× finer than the tile grid**, with
corner wander that varies with height, so walls lean and bulge instead of
extruding as clean prisms.

**Architecture Invariant:** the floor is smooth-shaded and the rock is
flat-shaded. Flat-shading a gently rolling surface on a regular lattice turns
every cell into its own facet and the ground reads as a diamond quilt — *more*
geometric than the flat plane it replaced.

### `src/game/Player.js`, `src/game/Expression.js`

`Player` owns movement, the animation state machine and the contact shadow.
`Expression` is a **procedural layer applied after `mixer.update()`**, composing
onto the pose the mixer just wrote: head lag on an under-damped spring, look-at
toward whatever the torch senses, blinks, brows, and reaction beats. None of it
could be a baked clip, because all of it depends on live game state.

Controls are `WASD` to move, drag with the mouse to pivot the camera, `Q`/`E` to
turn with the keyboard. Steering is screen-relative and follows the pivot.

There is a real tension in the proportions worth knowing about: his legs are 0.28
units long and he is 1.36 tall, so a fully planted foot at any brisk speed demands
a fast cadence. At the original 4.2 u/s that was 8.8 steps/sec, a blur. Two dials
in `Player.js`: `SPEED` (reduced 4.2 → 3.2, putting the locked cadence at 6.7
steps/sec) and `FOOT_LOCK` (1.0 is a perfectly planted foot; 0.7 trades a 1.4×
slide for a calmer ~4.7 steps/sec).

**Architecture Invariant:** the walk cycle is locked to *measured* ground speed
(`timeScale = groundSpeed * clipDuration / STRIDE_PER_CYCLE`), not to the input
vector. Using the input vector means scraping along a wall keeps his legs at full
cadence while he barely moves. Measured slide ratio: 1.00.

### `src/game/Torch.js`, `src/game/Cutaway.js`, `src/game/IsoCamera.js`

The light and the discovery sense; the dithered wall dissolve; the orthographic
follow camera and the screen-relative input basis.

**The torch does not burn out** — an early fuel mechanic was dropped. Its job is
*discovery*: as an undiscovered passage comes into range the flame stirs, flares,
and cools from amber toward blue-white, so hunting a secret is a hot-and-cold
game you play by watching your own light rather than by walking into every wall.

**Architecture Invariant:** embers widen that sense on a `sqrt` curve, never
linearly. There are 18 embers in a run and a linear bonus would grow the radius
past 12 units, popping every secret on the level without the player ever hunting
for one. The rendering constraints
these three live under are unusually sharp and are collected in
[systems/RENDERING.md](systems/RENDERING.md).

### `src/game/Chronicle.js`, `src/game/Narrator.js`

`Chronicle` records what the player has done **in words a model can use** — how
far he has walked with nothing to show for it, that he has begun retreading his
own footprints, which cavern he has climbed into. `Narrator` turns that into
requests, prefetches the next beat behind the current one, and decides when each
surfaces.

**API Boundary.** `Narrator` is the only thing in `src/` that talks to the
story endpoint, and it only ever receives finished prose. See
[systems/STORY.md](systems/STORY.md).

### `src/game/Ambience.js`, `src/game/Choir.js`, `src/audio/vocal-tract-processor.js`

A generated score and a physically-modelled choir. The worklet processor is the
only file in the repo that runs off the main thread, and it is loaded by URL
rather than imported. See [systems/AUDIO.md](systems/AUDIO.md).

### `src/game/HUD.js`, `src/game/Minimap.js`

The DOM overlay and the fog-of-war map. The HUD is plain DOM over the canvas;
the minimap is its own 2D canvas with a per-level `explored` mask that only ever
grows.

**Architecture Invariant:** the minimap never draws anything the player has not
seen, and never draws a way onward that is still sealed. A map that spoils what
is ahead removes the reason to explore.

It is kept **north-up rather than rotating with the camera**. The camera pivots
freely, and a map that spins with it never lets you build a mental picture of the
cave; a fixed map plus a facing arrow does. The ragged edge of the explored area
is the useful part — it is the frontier.

### `server.mjs`

The production server, and what the container runs: static `dist/` plus the story
endpoint. It mounts the **same** handler the dev server does —
`tools/story-plugin.mjs` exports `createStoryHandler()`, and the Vite plugin is a
thin wrapper around it.

**Architecture Invariant:** there is one story handler, not two. If you change
request handling, change it there and both mount points follow.
[adr/0011](adr/0011-serve-the-container-with-a-node-server.md)

### `tools/`

- `story-plugin.mjs` — Vite middleware exposing `POST /api/story/next`. Mounted
  on both the dev server and `vite preview`.
- `validate_levels.mjs` — the generator invariants, checked independently.
- `build_assets.sh` — headless Blender rebuild of the `.glb` files.
- `gen_levels.mjs` — **legacy, not run.** Superseded by `LevelGen.js`.

### `blender/`

`lib_build.py` (shared bmesh helpers), `build_character.py` (the rigged boy and
his three clips), `build_props.py` (pickups, stairs, the archway), and
`build_cavern.py` (**no longer built** — kept as the reference implementation for
the floor-height port), plus `preview.py` / `preview_pose.py` for eyeballing
assets from the CLI.

`model.blend` is a saved session committed for inspection. **The build never
reads it** — `npm run assets` runs Blender with `--factory-startup` and rebuilds
from the Python, so edits made in the .blend do not survive.

**Architecture Invariant:** the scripts are the source of truth for every asset.
Anything in a `.blend` is an output. See [systems/ASSETS.md](systems/ASSETS.md).

## Architecture Invariants

The rules that span files. Breaking one of these does not produce a local bug; it
produces a bug somewhere else entirely.

**The API key never reaches the browser.** Anything under `src/` is served to the
client and readable in devtools. All model calls go through
`tools/story-plugin.mjs`, which runs in the Vite server process. The client
receives finished prose and nothing else. `.env` and `.env.*` are gitignored.
[adr/0006](adr/0006-keep-the-api-key-server-side.md)

**Nothing optional may break startup.** No credentials, no network, no
AudioWorklet support — the game still boots and plays. The story falls back to
written beats; the choir falls back to additive synthesis. Narration and sound
are flourishes and must never be why the game fails to start.

**Python and JS must agree where they describe the same thing.** Currently that
is floor height (`Grid.js` ↔ `build_cavern.py`), verified bit-identical. If you
add a second such pairing, say so here.

**The game climbs.** Level 0 is the deepest cavern and the end-game is escape.
`>` is the way *up* and is walkable — he steps onto a staircase rather than
around a shaft. Any code or comment phrased as a descent is stale and wrong.
[adr/0002](adr/0002-climb-instead-of-descend.md)

**A cavern is not finishable until every secret on it is found.** The way onward
is not merely locked, it is *absent* — not rendered, not lit, not on the map, not
audible to the choir. This is why every secret must be reachable, and why
`npm run check` refuses levels where one is not.
[adr/0003](adr/0003-gate-the-way-up-on-full-discovery.md)

**Systems are leaves; `main.js` is the trunk.** See the code map above.

**`dependencies` is what the server needs at runtime; `devDependencies` is
everything else.** The container installs with `--omit=dev`, so this distinction
is load-bearing rather than cosmetic — `vite` and `three` are build-only, while
`@anthropic-ai/sdk` and `zod` are imported by the running server.
[DEPLOYMENT.md](DEPLOYMENT.md#dependency-hygiene)

## Cross-Cutting Concerns

### Determinism and parity

The generator takes a seed and is deterministic given one. Failures print the
seed so they can be reproduced with `generateLevels(seed)`. The Python↔JS floor
height port was verified by generating both and comparing values, not by looking
at the result.

### Measurement over impression

This project is visual and audible, and most of its worst bugs were things that
*looked* fine. The standing rule is that a claim about behaviour should come with
a number: foot-slide ratio (5.91 → 1.00), noise-to-voice ratio (1.48 → far below
1), formant frequencies against published vowel data (F1 413Hz / F2 853Hz), 900
generated levels with 0 uncompletable.

Two lessons about the measuring itself, both learned the hard way:

- **A metric can be silently invalid.** `preserveDrawingBuffer: false` made pixel
  readback return a blank buffer, so "0% blown pixels" meant nothing at all.
- **Test harness artefacts masquerade as product bugs.** A stale Vite module
  instance made a working fix look broken; a straight-line walk into a wall
  looked like a broken mechanic.

See [WORKFLOWS.md](WORKFLOWS.md) for how to actually run these checks.

### Failure policy

Every optional subsystem degrades rather than throwing. The story middleware maps
failures to specific status codes (503 no credentials, 400 org key without a
workspace, 429 rate limit) and the client treats any of them as "use the written
beats". Audio catches worklet load failure and swaps in the fallback choir.

### Performance shape

The frame budget goes almost entirely to rendering; generation is a one-time
~10ms and the story is prefetched off the critical path. The two things that
have actually threatened frame rate are shadow work from the carried light and
per-frame geometry tests — both addressed by the constraints in
[systems/RENDERING.md](systems/RENDERING.md).

### Testing

`npm run check` validates the generator and builds. Everything else is verified
by driving the real game in a browser and asserting on real state — the pattern
is written up in [WORKFLOWS.md](WORKFLOWS.md#verifying-a-change-in-the-browser).
