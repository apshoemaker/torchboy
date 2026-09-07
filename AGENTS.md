# AGENTS.md

Torchboy — an isometric cavern game that runs in the browser. Art is generated
in Blender by script, the caves are generated per run in the browser, and the
story is written by Claude while the game is played.

**This file is a table of contents, not a manual.** Everything below is a
pointer. Read the linked doc when the task touches that area; do not read them
all up front.

## Bootstrap

```bash
npm install          # Node ^20.19 || >=22.12 (Vite 7's requirement); see .nvmrc
npm run dev          # http://localhost:5173
```

Or in a container, which needs no Node on the host at all:

```bash
docker compose up --build      # http://localhost:8080
```

Assets are committed, so the game runs without Blender. `.env` is optional — the
story falls back to written beats without it; `cp .env.example .env` documents
every variable the project reads. Full detail: **[docs/SETUP.md](docs/SETUP.md)**.

## Task entrypoints

| Command | What it does |
|---|---|
| `npm run dev` | dev server on :5173, with the story middleware mounted |
| `npm run check` | **lint, format-check, validate the cave generator, build** — run this before you claim done |
| `npm run lint` / `npm run format` | ESLint (correctness) / Prettier (writes) |
| `npm test` | the generator invariants over 300 runs (~3s) |
| `npm run build` / `npm run preview` | production build / serve it on :4173 |
| `npm start` | serve a built `dist/` the way the container does (:8080) |
| `docker compose up --build` | the container: client + story endpoint (:8080) |
| `npm run assets` | rebuild `.glb` from Blender sources (needs Blender 5.x) |

ESLint enforces correctness (not style) and Prettier owns formatting; both run
in `npm run check` and in CI. Beyond what they check, match the surrounding
style: the codebase comments the *why*, not the *what*, and prefers a measured
number over an adjective.

## Validation

`npm run check` is the gate. Beyond it, this project is largely
**visual and audible**, and much of it cannot be asserted from a unit test — so
the standing rule is **measure, don't eyeball**: the repo's history is a list of
bugs that survived because someone looked once and said it seemed fine. How to
verify each kind of change: **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)**.

## Repo map

| Path | What lives there |
|---|---|
| `server.mjs` | the production server: static `dist/` + the story endpoint |
| `src/main.js` | boot, the frame loop, and all cross-system wiring |
| `src/game/` | every runtime system, one concern per file |
| `src/audio/` | the AudioWorklet processor (runs off the main thread) |
| `blender/` | asset generators, run headless to produce `public/models/*.glb` |
| `tools/` | the story middleware, the asset build, the generator validator |
| `docs/` | everything below |

## Documentation

Start at **[docs/README.md](docs/README.md)**. Directly:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — bird's eye view, code map,
  architecture invariants, cross-cutting concerns. **Read this first** for any
  change that spans more than one file.
- **[docs/SETUP.md](docs/SETUP.md)** — toolchain, credentials, Blender.
- **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)** — how to make and verify a change.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — the container, and the
  dependency rule that will bite you if you ignore it.
- **[docs/systems/](docs/systems/)** — deep dives: story, audio, rendering, assets.
- **[docs/adr/](docs/adr/)** — why the load-bearing decisions were made. Check
  here before reversing something that looks arbitrary; most of it isn't.
- **[docs/HOW-THIS-WAS-BUILT.md](docs/HOW-THIS-WAS-BUILT.md)** and
  **[docs/transcript/](docs/transcript/)** — how this repo was built, agentically,
  and the full session log. Useful if you want to know why a thing is the way it
  is and the ADRs do not say.

## Invariants worth knowing before you touch anything

These are the ones that bite. Each is expanded, with its evidence, in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#architecture-invariants).

1. **The Anthropic API key never reaches the browser.** Everything under `src/`
   ships to the client. Model calls go through `tools/story-plugin.mjs` only.
2. **Nothing optional may break startup.** No story credentials, no audio
   worklet, no network — the game still plays. Narration and sound are
   flourishes and must fail soft.
3. **`Grid.js` and `blender/build_cavern.py` must agree bit-for-bit** on floor
   height, or the player floats above or sinks into the ground.
4. **A cavern is not finishable until every secret on it is found**, so every
   secret must be *findable*. `npm run check` enforces this; do not weaken it.
5. **The game climbs.** Level 0 is the deepest; `>` is the way *up* and is
   walkable. Anything phrased as a descent is stale.
6. **`dependencies` is what the *server* needs at runtime.** The container
   installs `--omit=dev`, so putting a `server.mjs` import under
   `devDependencies` builds an image that crashes on boot. Build-only packages
   (`vite`, `three`) belong in `devDependencies`.

## Known dead code

Not wired to anything, kept only as reference. Do not extend, and do not assume
it runs:

- `tools/gen_levels.mjs` — the original Node cave generator, superseded by
  `src/game/LevelGen.js`.
- `blender/build_cavern.py` — superseded by `src/game/CavernMesh.js`, but still
  the reference implementation for the floor-height port (invariant 3).
- `blender/model.blend` — a **saved session**, committed so you can open the rig
  and look at it. The build runs `--factory-startup` and never reads it, so
  edits made in this file are discarded by the next `npm run assets`. To change
  an asset, change the script.
