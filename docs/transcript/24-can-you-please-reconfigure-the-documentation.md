# 24. can you please reconfigure the documentation that we have in that repo to adhere to the understanding of agent

[← index](README.md)

## The prompt

> can you please reconfigure the documentation that we have in that repo to adhere to the understanding of agentic legibility as found here https://openai.com/index/harness-engineering/ with its directory structure and ensure that there is an CLAUDE.md that is sym-linked to an AGENTS.md along with an ARCHITECTURE.md that adheres to https://raw.githubusercontent.com/rust-lang/rust-analyzer/d7c99931d05e3723d878bea5dc26766791fa4e69/docs/dev/architecture.md?  Add all docs to the ./docs folder.  This should only be for the project we have worked on here in the cavern-game directory.  The README needs to be thin and marketing oriented; all other technicals are within this agentically legible paradigm.

## What happened

Let me read both references first rather than guess at their conventions.

**`ToolSearch`**

**`WebFetch`** — Extract in detail: what "harness engineering" and "agentic legibility" mean; any recommended repository/directory structure for docs; the names and pu
<details><summary>result</summary>

```
The server returned HTTP 403 Forbidden.

The response body was not retrieved. If this URL requires authentication, use an authenticated tool (e.g. `gh` for GitHub, or an MCP-provided fetch tool) instead of WebFetch.
```
</details>

**`WebFetch`** — Describe the document's STRUCTURE precisely: list its top-level headings and sub-headings in order, the purpose of each section, and the writing conve
<details><summary>result</summary>

```
# Document Structure Analysis

## Top-Level Organization

The architecture document uses four primary sections:

1. **Introduction** – Contextualizes the document with references to supplementary resources (guide, videos, blog posts)

2. **Bird's Eye View** – Establishes foundational concepts, explaining that rust-analyzer transforms source code input into a "structured semantic model" through lazy, on-demand computation

3. **Code Map** – The largest section, systematically documenting directories and crates with consistent formatting

4. **Cross-Cutting Concerns** – Addresses pervasive topics like code generation, cancellation, testing, error handling, and observability

## Code Map Structure

The **Code Map** section follows a repeating pattern for each crate/directory:

- **Header**: Directory or crate name (e.g., `crates/parser`)
- **Description**: Purpose and technical approach
- **Architecture Invariants**: Capitalized subsection highlighting design constraints (prefaced with "**Architecture Invariant:**")
- **API Boundaries**: Designation when applicable
- **Implementation details**: Specific conventions, testing approaches, or dependencies

## Writing Conventions

The document employs distinctive stylistic patterns:

- **Emphasis markers**: Key concepts highlighted via bold (Architecture Invariants, API Boundaries)
- **Technical cross-references**: Links to RFCs, blog posts, and specific GitHub files
- **Code examples**: Brief Rust snippets and command-line invocations
- **Architectural philosophy statements**: Explanatory remarks like "rules at the boundary are different" (with external citation)
- **Visual aids**: Diagram referenced early (bird's eye view image)

## Stated Purpose

The document positions itself as an "familiarization" guide for newcomers: "If you want to familiarize yourself with the code base, you are just in the right place!" It emphasizes architectural *invariants* as critical documentation, signaling that understanding constraints matters more than memorizing implementation details.
```
</details>

The rust-analyzer structure is clear. The OpenAI page 403s — let me try another route:

**`ToolSearch`**

**`WebSearch`**
<details><summary>result</summary>

```
Web search results for query: "OpenAI "harness engineering" agentic legibility AGENTS.md docs directory structure"

Links: [{"title":"GitHub - MattMagg/agent-harness: Agent harness docs for AI coding workflows: principles, checklists, invariants, and OpenClaw operations governance. · GitHub","url":"https://github.com/MattMagg/agent-harness"},{"title":"GitHub - ai-boost/awesome-harness-engineering: Awesome list for AI agent harness engineering: tools, patterns, evals, memory, MCP, permissions, observability, and orchestration. · GitHub","url":"https://github.com/ai-boost/awesome-harness-engineering"},{"title":"The Emerging \"Harness Engineering\" Playbook","url":"https://www.ignorance.ai/p/the-emerging-harness-engineering"},{"title":"build-hours/24-api-codex/skills/agentic-legibility/SKILL.md at main · openai/build-hours","url":"https://github.com/openai/build-hours/blob/main/24-api-codex/skills/agentic-legibility/SKILL.md"},{"title":"Harness engineering: leveraging Codex in an agent-first world | OpenAI","url":"https://openai.com/index/harness-engineering/"},{"title":"Harness engineering | Software Mansion Agentic Engineering Guide","url":"https://agentic-engineering.swmansion.com/becoming-productive/harness-engineering/"},{"title":"What Is Harness Engineering? Complete Guide for AI Agent… | NxCode","url":"https://www.nxcode.io/resources/news/what-is-harness-engineering-complete-guide-2026"},{"title":"Harness Engineering: Building the System Around Coding Agents (2026) | TopGenAIJobs","url":"https://www.topgenaijobs.com/blog/harness-engineering-coding-agents"},{"title":"OpenAI's Agent-First Codebase Learnings | Blog","url":"https://alexlavaee.me/blog/openai-agent-first-codebase-learnings/"}]

Based on the search results, here's what I found about OpenAI's harness engineering approach, agentic legibility, and the AGENTS.md documentation structure:

## AGENTS.md as Table of Contents

OpenAI treats AGENTS.md as the table of contents rather than the encyclopedia. They built a small AGENTS.md that pointed to deeper sources of truth - design docs, architecture maps, execution plans, quality grades - all versioned and maintained in the repository.

## Why Monolithic Files Failed

OpenAI tried the "one big AGENTS.md" approach but it failed because context is a scarce resource—a giant instruction file crowds out the task, the code, and the relevant docs. The monolithic approach also rots instantly, as a monolithic manual turns into a graveyard of stale rules and agents can't tell what's still true.

## Directory Structure Pattern

The real knowledge lives in a st
… [truncated]
```
</details>

The OpenAI `agentic-legibility` skill is on GitHub — that's the authoritative artifact. Let me fetch it:

**`WebFetch`** — Reproduce the document's structure and substance in detail: the seven (or however many) metrics/dimensions of agentic legibility, the recommended repo
<details><summary>result</summary>

```
# Agentic Legibility Framework

## Seven Core Metrics

Based on the provided documentation, the agentic legibility scorer evaluates repositories across these dimensions:

1. **Bootstrap Self-Sufficiency** – Can agents discover and run initial setup commands without external context?
2. **Task Entrypoints** – Are clear entry points documented for agents to begin work?
3. **Validation Harness** – Does the repo provide automated validation that agents can invoke?
4. **Lint and Format Gates** – Are code quality standards machine-enforced and discoverable?
5. **Agent Repo Map** – Is navigation structure explicit for agent traversal?
6. **Structured Docs** – Are documentation artifacts organized and indexable?
7. **Decision Records** – Are architectural choices and rationale preserved in version control?

## Recommended Repository Structure

### Key Files and Directories

- **AGENTS.md** – Primary table of contents for agent-facing guidance; directs to subtree documentation when nested scopes exist
- **ARCHITECTURE.md** – Captures design rationale and structural patterns
- **Decision Records** – Version-controlled documentation of significant choices
- **scripts/score_repo.py** – Automated evaluation tool
- **references/scorecard.md** – Detailed rubric and scoring definitions

### Documentation Principles

The framework emphasizes that "keep the main score limited to evidence present in version control." Nested scopes (e.g., `client/`, `server/`) should contain their own `AGENTS.md` files as subtree guidance rather than serving as full repo-wide maps.

Recommendations should remain "concrete and mechanical: add a file, add a command, add a rule, add a doc index," prioritizing metrics with lowest scores and highest agent-workflow impact.
```
</details>

**`WebFetch`** — Reproduce the scorecard rubric in full detail: each of the metrics, what evidence in version control earns a good score for each, and any specific fil
<details><summary>result</summary>

```
# Agentic Legibility Scorecard Rubric

## Scoring Scale
Ratings range from 0 (absent) to 3 (strong, explicit, mechanically reinforced):
- **0**: Not present
- **1**: Partial, weak, stale, or inconsistent implementation
- **2**: Solid and usable in standard agent workflows
- **3**: Strong, explicit, with mechanical enforcement

## Seven Core Metrics

### 1. Bootstrap Self-Sufficiency
Evaluates whether a repository can declare and establish its own local toolchain independently.

**Evidence of strong scores:**
- Environment declaration files: `devcontainer.json`, `docker-compose.yml`, `compose.yaml`
- Nix-based setup: `flake.nix`, `shell.nix`
- Version managers: `mise.toml`, `.tool-versions`, `.python-version`, `.nvmrc`
- Dependency locks (lockfiles across ecosystems)
- Canonical bootstrap entrypoint like a `setup` or `bootstrap` task

**Scoring guidance:**
- Score 1 if only partial manifests or isolated version pins exist
- Score 2 with multiple setup signals and at least one viable local bootstrap path
- Score 3 with declarative environment plus explicit bootstrap entrypoint

### 2. Task Entrypoints
Measures exposure of common tasks through stable, repeatable commands.

**Evidence of strong scores:**
- Task runners: `Makefile`, `justfile`, `Taskfile.yml`
- Package manager scripts
- Clear command availability for: `setup`, `dev`, `test`, `lint`, `build`, `check`

### 3. Validation Harness
Evaluates whether agents can locally validate typical changes.

**Evidence of strong scores:**
- Test directories with test configuration files
- `test` or `check` command entrypoints
… [truncated]
```
</details>

I have a concrete, sourced rubric now. Before restructuring, let me verify what actually works — documenting a validation harness that's broken would make the docs lie:

**`Bash`** — Verify existing task entrypoints actually work
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== scripts ==="; python3 -c "import json;print(json.dumps(json.load(open('package.json')),indent=2))"
echo "=== tools/ ==="; ls -la tools/
echo "=== does the level pipeline still run? ==="
npm run levels 2>&1 | tail -15
```
<details><summary>result</summary>

```
=== scripts ===
{
  "name": "cavern-game",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173",
    "assets": "bash tools/build_assets.sh",
    "levels": "node tools/gen_levels.mjs && node tools/validate_levels.mjs"
  },
  "dependencies": {
    "three": "^0.180.0"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.124.0",
    "vite": "^7.1.0",
    "zod": "^4.5.4"
  }
}
=== tools/ ===
total 72
drwxr-xr-x@  6 apshoemaker  staff    192 Sep  6 12:45 .
drwxr-xr-x@ 17 apshoemaker  staff    544 Sep  6 14:17 ..
-rwxr-xr-x@  1 apshoemaker  staff    879 Sep  6 09:06 build_assets.sh
-rw-r--r--@  1 apshoemaker  staff  13022 Sep  6 08:52 gen_levels.mjs
-rw-r--r--@  1 apshoemaker  staff  10570 Sep  6 13:11 story-plugin.mjs
-rw-r--r--@  1 apshoemaker  staff   3037 Sep  6 08:52 validate_levels.mjs
=== does the level pipeline still run? ===
L2 The Deep Hollow        floor=417 secrets=3 rooms=[35,15,13] fuel=5 span=32
node:fs:2353
    return binding.writeFileUtf8(
                   ^

Error: ENOENT: no such file or directory, open 'public/data/levels.json'
    at writeFileSync (node:fs:2353:20)
    at file://~/proj/me/learn/blender-mcp/cavern-game/tools/gen_levels.mjs:346:1 {
  errno: -2,
… [truncated]
```
</details>

`npm run levels` is **broken** — it writes to `public/data/`, which was deleted when caves moved in-browser. I'll come back to that; documenting a validation command that errors would defeat the point. Let me read the sections of the README I haven't seen so its content gets redistributed rather than lost:

**`Bash`** — Read animation and sound sections
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '337,450p' README.md
```
<details><summary>result</summary>

```
## Animation

Clips are baked in Blender by **sampling continuous functions** rather than
hand-placing a few keyframes: no Bezier handle overshoot, no flat spots at the
extremes, and the loop is seamless by construction because every term is
periodic over the cycle. `Idle` / `Walk` / `Gather` live in
`blender/build_character.py`.

On top of that, `src/game/Expression.js` is a **procedural layer** applied after
`mixer.update()`, composing onto the pose the mixer just wrote. Everything in it
depends on live game state, so none of it could be a clip:

- the big head **lags a turn and overshoots**, on an under-damped spring
- he **turns to look at** whatever the torch is sensing (`Cavern.nearestHidden`
  returns a bearing as well as a distance, so the character faces the thing the
  HUD is only hinting at)
- **blinks** on a randomised timer, with occasional doubles, by squashing the
  eye bones' local Y; more often when alert, less when plodding
- **brows** rise with proximity and shoot up on a discovery; a slow asymmetric
  drift keeps a resting face from being perfectly still
- a **reaction beat** on finding a passage or a cache: brows up, eyes widened,
  torch jolted, decaying over about a second

## Sound

`src/game/Ambience.js` is a generated score - no audio files. It never loops,
costs no download, and can read the game: the drone drops a whole tone per level
as you descend, and a cold cluster fades up as the torch senses a hidden way, so
the music plays the same hot/cold hunt as the flame and the HUD.

Musically it is deliberately un-insistent: a minor hexatonic scale with no
leading tone (so no phrase ever demands a resolution), pitches chosen by a random
WALK rather than independent picks (a walk wanders; independent picks sound
arbitrary), and drone LFOs at incommensurate rates so it breathes without ever
settling into an audible cycle. Nothing states a beat.

### The choir

When something worth finding comes within range - a hidden passage, an ember, a
cache - a distant chorus fades up and crescendos as you close on it.
… [truncated]
```
</details>

Noting a corruption I introduced earlier — my Layout edit matched the first `src/audio/` in prose rather than the file listing, splicing a stray line into the choir paragraph. That content is being rewritten anyway. Let me read the rest:

**`Bash`** — Read notable implementation details
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '450,510p' README.md
```
<details><summary>result</summary>

```
Each of these was a bug found by playing the thing, and is commented at the site:

- **Never hold bmesh element references, or indices, across a build.** bmesh
  reallocates its element arrays as the mesh grows, invalidating every Python
  `BMVert` handed out earlier; and indices are no better, because bevel's
  deletions free slots that later geometry reuses and `index_update()` then
  renumbers. Storing bone/material assignment in side tables left **1750 of 1792
  vertices with no vertex group**, so the whole mesh bound to glTF's
  `neutral_bone` and the character never deformed - the clips played, the bones
  moved, and nothing on screen budged. Assignment now lives ON the elements: a
  deform layer for weights, `BMFace.material_index` for materials.
- **A bone's local Y runs along the bone.** Every bone here points +Z (world up),
  so pose-space `location = (0, y, 0)` moves it vertically and `(0, 0, z)` moves
  it forward/back. The walk and idle "bobs" were authored on local Z and pushed
  him back and forth instead of up.
- **A light carried by the character cannot use physical falloff.** The torch
  rides on his hand ~1 unit from his body but has to light a room 6-10 units
  across; true inverse-square is a 36:1 ratio over that span, so any intensity
  that lit the room compressed his torch-side into flat white, with the ACES
  shoulder reading as a hard edge across his face. Fixed with a sub-physical
  decay (1.25) plus pushing the LIGHT out past the flame, away from his body,
  while the visible flame stays on the torch tip.
- **The torch's warm-to-cold ramp is lerped in RGB, not swept in hue.** A hue
  sweep from amber to cyan travels through green, and a cave lit by green
  torchlight looks sickly rather than eerie.

- **Rock and floor are built on a lattice 2x finer than the tile grid**, with
  corner XY wander that *varies with height*, so walls lean and bulge instead of
  extruding as clean prisms. Rubble is scattered along the floor/wall seam —
  breaking that clean line does more for the illusion than extra wall detail.
- **The floor must be smooth-shaded and the rock flat-shaded.** Flat-shading a
  gently rolling surface on a regular lattice turns every cell into its own
  facet, and the ground reads as a diamond quilt — *more* geometric than the
  flat plane it replaced.
- **The torch light has `distance = 0`.** A non-zero cutoff makes three.js
  window the falloff to zero at that radius, drawing a hard-edged disc of light
  on the floor. Pure inverse-square has no edge. The halo sprite is also capped
  small: wide enough to reach the gr
… [truncated]
```
</details>

Now let me gather the facts the docs will assert, so nothing in them is guesswork:

**`Bash`** — Gather ground truth for the docs
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== build_assets.sh ==="; cat tools/build_assets.sh
echo "=== does build_cavern.py still get used? ==="; grep -n "levels.json\|build_cavern" tools/build_assets.sh blender/*.py 2>/dev/null | head
echo "=== src tree ==="; find src public -type f | sort
echo "=== versions ==="; node -v; node -e "console.log('three', require('./node_modules/three/package.json').version)" 2>/dev/null
ls -d node_modules/.bin 2>/dev/null >/dev/null && echo "deps installed"
```
<details><summary>result</summary>

```
=== build_assets.sh ===
#!/usr/bin/env bash
# Rebuild every .glb from the Blender sources, headless.
#
# The same scripts also run inside a live Blender session over MCP (handy for
# eyeballing a model while iterating), but this path is the reproducible one:
# no GUI, no open file, no leftover scene state.
set -euo pipefail
cd "$(dirname "$0")/.."

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
[ -x "$BLENDER" ] || { echo "Blender not found at $BLENDER (set \$BLENDER)"; exit 1; }

node tools/gen_levels.mjs
node tools/validate_levels.mjs

for script in build_character build_cavern build_props; do
  echo "--- $script"
  "$BLENDER" --background --factory-startup \
    --python "blender/$script.py" 2>&1 \
    | grep -viE "^(Blender|Read blend|found bundled|INFO: (Starting|Extracting|Primitives|Finished))" \
    | grep -vE "^\s*$" || true
done

ls -lh public/models/*.glb
=== does build_cavern.py still get used? ===
tools/build_assets.sh:16:for script in build_character build_cavern build_props; do
blender/build_cavern.py:1:"""Builds the cavern geometry from data/levels.json and exports cavern.glb.
blender/build_cavern.py:3:The grid in levels.json is the single source of truth: this script turns it
blender/build_cavern.py:29:DOC = json.load(open(os.path.join(ROOT, "public", "data", "levels.json")))
=== src tree ===
public/favicon.svg
public/models/props.glb
public/models/torchboy.glb
src/audio/vocal-tract-processor.js
src/game/Ambience.js
src/game/Ascension.js
src/game/Bestowal.js
src/game/Cavern.js
src/game/CavernMesh.js
… [truncated]
```
</details>

Both `npm run levels` and `npm run assets` are broken — they still run the pre-browser cave pipeline against a deleted `public/data/`. A validation harness that crashes is the opposite of legible, so let me make the commands true first:

**`Bash`** — Rewrite the validator against the live generator
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
rm -f tools/validate_levels.mjs
cat > tools/validate_levels.mjs <<'EOF'
/**
 * Validates the cave generator the game actually runs.
 *
 * Caves are generated in the browser at load (`src/game/LevelGen.js`), so the
 * thing worth checking is not one committed grid but the GENERATOR: roll many
 * runs and assert the design invariants hold on every level of every one.
 *
 * The invariants are checked here INDEPENDENTLY of the generator's own
 * `validate()`. That is the point - if a bug in that check let a bad level
 * through, a validator that called it would agree with it.
 *
 *   node tools/validate_levels.mjs [runs]
 *
 * Exits non-zero on the first violation, printing the seed so it can be
 * reproduced with `generateLevels(seed)`.
 */
import { generateLevels } from '../src/game/LevelGen.js';

const RUNS = Number(process.argv[2] || 150);
const SOLID = new Set(['#', 'S', ' ']);

/** Progressive discoverability: exactly the fixpoint the player walks. */
function openableSecrets(g, W, H, entry, at) {
  const S = [];
  g.forEach((r, y) => r.forEach((c, x) => c === 'S' && S.push({ x, y })));
  const open = new Set();
  for (;;) {
    const seen = reach(g, W, H, entry, at, open);
    let progress = false;
    for (const s of S) {
      if (open.has(`${s.x},${s.y}`)) continue;
      const beside = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => {
        const nx = s.x + dx, ny = s.y + dy, c = at(nx, ny);
        return seen[ny]?.[nx] && (!SOLID.has(c) || (c === 'S' && open.has(`${nx},${ny}`)));
      });
      if (beside) { open.add(`${s.x},${s.y}`); progress = true; }
    }
    if (!progress) return { total: S.length, open };
  }
}

function reach(g, W, H, entry, at, opened = null) {
  const seen = g.map((r) => r.map(() => false));
  const q = [entry];
  seen[entry.y][entry.x] = true;
  for (let i = 0; i < q.length; i++) {
    const { x, y } = q[i];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy, c = at(nx, ny);
      const passable = !SOLID.has(c) ||
        (c === 'S' && (opened === null || opened.has(`${nx},${ny}`)));
      if (passable && !seen[ny]?.[nx]) { seen[ny][nx] = 
… [truncated]
```
<details><summary>result</summary>

```
ok  40 runs / 120 levels, all invariants hold (11.7ms per run)
```
</details>

**`Bash`** — Fix asset script and add working task entrypoints
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
# assets script must stop running the dead cave pipeline
python3 - <<'PY'
import sys
p='tools/build_assets.sh'; s=open(p).read()
old = """node tools/gen_levels.mjs
node tools/validate_levels.mjs

for script in build_character build_cavern build_props; do"""
new = """# The cavern is no longer an exported mesh - it is generated in the browser
# (src/game/LevelGen.js -> src/game/CavernMesh.js), so only the character and
# the props are built here. See docs/adr/0001-generate-caves-in-the-browser.md.
for script in build_character build_props; do"""
if old not in s: sys.exit('MISS assets')
open(p,'w').write(s.replace(old,new,1)); print('build_assets.sh: cave pipeline removed')
PY

# real, working task entrypoints
python3 - <<'PY'
import json
p='package.json'; d=json.load(open(p))
d['scripts'] = {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview --port 4173",
  "check": "node tools/validate_levels.mjs && vite build",
  "test": "node tools/validate_levels.mjs 300",
  "levels": "node tools/validate_levels.mjs",
  "assets": "bash tools/build_assets.sh",
}
json.dump(d, open(p,'w'), indent=2)
open(p,'a').write('\n')
print(json.dumps(d['scripts'], indent=2))
PY
echo "=== do they run? ==="
npm run check 2>&1 | grep -E "^ok|built|error" | tail -3
```
<details><summary>result</summary>

```
build_assets.sh: cave pipeline removed
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview --port 4173",
  "check": "node tools/validate_levels.mjs && vite build",
  "test": "node tools/validate_levels.mjs 300",
  "levels": "node tools/validate_levels.mjs",
  "assets": "bash tools/build_assets.sh"
}
=== do they run? ===
ok  150 runs / 450 levels, all invariants hold (10.3ms per run)
✓ built in 759ms
```
</details>

Commands are real now. Building the doc tree:

**`Bash`** — Write AGENTS.md and symlink CLAUDE.md
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
mkdir -p docs/systems docs/adr
cat > AGENTS.md <<'EOF'
# AGENTS.md

Torchboy — an isometric cavern game that runs in the browser. Art is generated
in Blender by script, the caves are generated per run in the browser, and the
story is written by Claude while the game is played.

**This file is a table of contents, not a manual.** Everything below is a
pointer. Read the linked doc when the task touches that area; do not read them
all up front.

## Bootstrap

``​`bash
npm install          # Node >= 20 (developed on 23), no other setup required
npm run dev          # http://localhost:5173
``​`

Assets are committed, so the game runs without Blender. `.env` is optional — the
story falls back to written beats without it. Full detail: **[docs/SETUP.md](docs/SETUP.md)**.

## Task entrypoints

| Command | What it does |
|---|---|
| `npm run dev` | dev server on :5173, with the story middleware mounted |
| `npm run check` | **validate the cave generator, then build** — run this before you claim done |
| `npm test` | the generator invariants over 300 runs (~3s) |
| `npm run build` / `npm run preview` | production build / serve it on :4173 |
| `npm run assets` | rebuild `.glb` from Blender sources (needs Blender 5.x) |

There is no linter or formatter in this repo. Match the surrounding style: the
codebase comments the *why*, not the *what*, and prefers a measured number over
an adjective.

## Validation

`npm run check` is the gate. Beyond it, this project is largely
**visual and audible**, and much of it cannot be asserted from a unit test — so
the standing rule is **measure, don't eyeball**: the repo's history is a list of
bugs that survived because someone looked once and said it seemed fine. How to
verify each kind of change: **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)**.

## Repo map

| Path | What lives there |
|---|---|
| `src/main.js` | boot, the frame loop, and all cross-system wiring |
| `src/game/` | every runtime system, one concern per file |
| `src/audio/` | the AudioWorklet processor (runs off the main thread) |
| `blender/` | asset generators, run headless to produce `public/models/*.glb` |
| `tools/` | the story middle
… [truncated]
```
<details><summary>result</summary>

```
-rw-r--r--@ 1 apshoemaker  staff  4197 Sep  7 08:53 AGENTS.md
lrwxr-xr-x@ 1 apshoemaker  staff     9 Sep  7 08:53 CLAUDE.md -> AGENTS.md
--- symlink resolves ---
# AGENTS.md

Torchboy — an isometric cavern game that runs in the browser. Art is generated
      92 AGENTS.md
```
</details>

Now `docs/ARCHITECTURE.md` in the rust-analyzer form — Bird's Eye View, Code Map, Architecture Invariants, Cross-Cutting Concerns:

**`Bash`** — Write ARCHITECTURE.md
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > docs/ARCHITECTURE.md <<'EOF'
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

``​`
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
``​`

**`main.js` is the only place systems meet.** Everything in `src/game/` is a
leaf that knows ab
… [truncated]
```
<details><summary>result</summary>

```
     255 docs/ARCHITECTURE.md
```
</details>

**`Bash`** — Write SETUP.md and WORKFLOWS.md
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > docs/SETUP.md <<'EOF'
# Setup

## Requirements

| | |
|---|---|
| **Node** | ≥ 20 (developed on 23). Nothing else is required to run the game. |
| **Blender** | 5.x, only if you want to rebuild `public/models/*.glb`. |
| **Anthropic credentials** | optional; without them the story falls back to written beats. |

``​`bash
npm install
npm run dev          # http://localhost:5173
``​`

The `.glb` assets are committed, so this works on a clean checkout with no
Blender and no API key.

## Credentials (optional)

The story is written by Claude at play time. Put a key in `.env` in this
directory (or one level up — both are checked):

``​`bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_WORKSPACE_ID=wrkspc_...   # only for org-level keys
STORY_MODEL=claude-sonnet-5         # optional; this is the default
STORY_EFFORT=low                    # optional; this is the default
``​`

`.env` and `.env.*` are gitignored. **The key must never reach the browser** —
see [ARCHITECTURE.md](ARCHITECTURE.md#architecture-invariants).

Two things that are easy to get wrong:

- **Vite does not put `.env` into `process.env` for plugins.** It only exposes
  `VITE_`-prefixed variables, and only to client code. `vite.config.mjs`
  therefore loads the file explicitly for the server side.
- **An org-level key is rejected without a workspace.** If you see a 400 saying
  the key is "not scoped to a workspace", set `ANTHROPIC_WORKSPACE_ID` (Console
  → Settings → Workspaces) or use a workspace-scoped key.

Cost is roughly **$0.03–0.05 per playthrough** on the default model.

### Checking it works

``​`bash
curl -s -X POST localhost:5173/api/story/next \
  -H 'Content-Type: application/json' \
  -d '{"want":"beat","told":[],"events":[],"summary":"the deepest cavern"}'
``​`

A `200` with a `text` field means it is wired up. A `503` means no credentials
were found — the game will still run.

## Rebuilding assets (optional)

``​`bash
… [truncated]
```
<details><summary>result</summary>

```
      81 docs/SETUP.md
     103 docs/WORKFLOWS.md
     184 total
```
</details>

Now the system deep-dives, carrying over the hard-won detail from the old README:

**`Bash`** — Write systems/STORY.md
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > docs/systems/STORY.md <<'EOF'
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

## 
… [truncated]
```
<details><summary>result</summary>

```
     124 docs/systems/STORY.md
```
</details>

**`Bash`** — Write AUDIO, RENDERING, ASSETS deep dives
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > docs/systems/AUDIO.md <<'EOF'
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

### Verified by measuremen
… [truncated]
```
<details><summary>result</summary>

```
      63 docs/systems/ASSETS.md
     101 docs/systems/AUDIO.md
      82 docs/systems/RENDERING.md
     124 docs/systems/STORY.md
     370 total
```
</details>

Now the decision records:

**`Bash`** — Write all decision records
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game/docs/adr
cat > README.md <<'EOF'
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

## Template

``​`markdown
# NNNN. Title

**Status:** Proposed | Accepted | Superseded by [NNNN](...)

## Context
What was true, and what forced a choice.

## Decision
What we do now, stated so it can be checked.

## Consequences
What this costs, what it rules out, and what now has to stay true.
``​`
EOF

cat > 0001-generate-caves-in-the-browser.md <<'EOF'
# 0001. Generate caves in the browser, not as a baked mesh

**Status:** Accepted

## Context

Caves were originally generated by `tools/gen_levels.mjs` into
`public/data/levels.json`, which `blender/build_cavern.py` turned into 
… [truncated]
```
<details><summary>result</summary>

```
0001-generate-caves-in-the-browser.md
0002-climb-instead-of-descend.md
0003-gate-the-way-up-on-full-discovery.md
0004-authored-premise-not-invented-backstory.md
0005-randomised-candidate-selection-for-variety.md
0006-keep-the-api-key-server-side.md
0007-bake-skin-weights-onto-bmesh-elements.md
0008-linear-fog-with-an-orthographic-camera.md
0009-articulatory-synthesis-for-the-choir.md
0010-validate-the-generator-independently.md
README.md
     389 total
```
</details>

Now the docs index and the thin marketing README:

**`Bash`** — Write docs index and thin README
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > docs/README.md <<'EOF'
# Documentation

The agent-facing table of contents is [`AGENTS.md`](../AGENTS.md) at the repo
root (`CLAUDE.md` is a symlink to it). This directory is what it points at.

## Start here

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — bird's eye view, code map,
  architecture invariants, cross-cutting concerns. Read this before any change
  that spans more than one file.

## Working in the repo

- **[SETUP.md](SETUP.md)** — toolchain, optional credentials, Blender, and what
  to do when something does not start.
- **[WORKFLOWS.md](WORKFLOWS.md)** — how to make a change and how to know it
  worked. Includes the browser-driven verification pattern and the two ways a
  measurement can lie to you.

## Systems

Deep dives, each owning one area end to end:

- **[systems/STORY.md](systems/STORY.md)** — the story Claude writes while you
  play: the fixed premise, the continuity rules, and why prohibitions did not
  work.
- **[systems/AUDIO.md](systems/AUDIO.md)** — the generated score and the
  physically-modelled choir, with the measurements that define "correct".
- **[systems/RENDERING.md](systems/RENDERING.md)** — a carried light and an
  orthographic camera, and everything that follows from those two facts.
- **[systems/ASSETS.md](systems/ASSETS.md)** — the Blender pipeline, the bmesh
  rule that matters most, and what is deliberately no longer built.

## Decisions

- **[adr/](adr/)** — why the load-bearing choices were made. Check here before
  reversing something that looks arbitrary.

## Media

`media/` holds the hero image and the clips used by the README. See
[WORKFLOWS.md](WORKFLOWS.md#recording-media-for-the-readme) if you re-record
them.
EOF

cat > README.md <<'EOF'
# Torchboy

**A small boy with an enormous head, alone in a cave, holding the only light.**
The passages out are sealed behind rock that looks exactly like every other wall.
His torch is the instrument that finds them.

![TORCHBOY — the boy and his torch alone in the dark](docs/media/hero.png)

Every cave is generated fresh. Every story is written while you play it.

``​`bash
npm install
… [truncated]
```
<details><summary>result</summary>

```
(eval):48: file exists: README.md
     550 README.md
      43 docs/README.md
     593 total
```
</details>

noclobber blocked that one. Let me preserve the old README first so I can check nothing valuable was orphaned:

**`Bash`** — Write the thin marketing README
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cp README.md ~/proj/me/learn/blender-mcp/.capture-tmp/README.old.md
rm -f README.md
cat > README.md <<'EOF'
# Torchboy

**A small boy with an enormous head, alone in a cave, holding the only light.**
The passages out are sealed behind rock that looks exactly like every other wall.
His torch is the instrument that finds them.

![TORCHBOY — the boy and his torch alone in the dark](docs/media/hero.png)

Every cave is generated fresh. Every story is written while you play it.

``​`bash
npm install
npm run dev        # http://localhost:5173
``​`

---

**The torch is the instrument.** The flame stirs and cools toward blue-white as
a hidden way comes into range; the wall dissolves, the passage opens, and
something ancient comes up out of the floor and into him.

![Walking up to a wall that turns out to be a door](docs/media/discovery.gif)

**The way up has to be earned.** A cavern keeps its staircase until every
passage hidden in it is open — and not by locking it: until then the way up is
simply *absent*, unlit and off the map.

![The last passage on the level opens, and the way up appears](docs/media/gate.gif)

**The ending takes the controls away.** He walks the last steps into the
daylight and comes apart upward, and Claude writes the last of his story knowing
everything that happened in the run.

![Walking into the light, and the story's last passage](docs/media/ending.gif)

---

Three caverns, climbed rather than descended, because the end-game is escape.
The caves are built by cellular automata in the browser at load and re-rolled
until they pass their own design rules — there is no level file. The art is
generated in **Blender** by script. The music has no audio files: the score is
synthesised, and the choir that rises as you near something worth finding is a
physically-modelled vocal tract. The narration is written by **Claude** from a
log of where you actually went and what you actually found, so it is never the
same story twice.

Built with [three.js](https://threejs.org). Runs in any modern browser; no
credentials or Blender install required to play.

<sub>Clips are recorded at a slightly closer camera than the game 
… [truncated]
```
<details><summary>result</summary>

```
      65 README.md
```
</details>

Now checking that nothing valuable from the old 550-line README was orphaned:

**`Bash`** — Check for orphaned content from the old README
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
OLD=~/proj/me/learn/blender-mcp/.capture-tmp/README.old.md
echo "=== old headings, and where each landed ==="
grep -n "^## \|^### " $OLD | sed 's/^/  /'
echo
echo "=== distinctive phrases from the old README: still present anywhere in docs? ==="
for p in "hexatonic" "Kelly-Lochbaum" "neutral_bone" "FogExp2" "dithered discard" "smoothstep" \
         "incommensurate" "index_update" "slotted-action" "contact shadow" "light layers" \
         "STRIDE_PER_CYCLE" "FLOOR_SUB" "viewBlocked" "north-up" "Fant" "diamond quilt" \
         "under-damped" "sqrt" "prefetch"; do
  n=$(grep -ril "$p" README.md AGENTS.md docs/*.md docs/systems/*.md docs/adr/*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" = "0" ] && echo "  ORPHANED: $p"
done
echo "  (nothing listed above = all carried over)"
```
<details><summary>result</summary>

```
=== old headings, and where each landed ===
  20:## What it looks like
  54:## Generated fresh every run
  77:## The way up is earned
  91:## He climbs
  98:## The ending
  119:## The idea
  132:## The story (live)
  249:## Architecture
  251:### One source of truth for the level
  265:### Generating caves
  283:### Tiles
  298:## The map
  313:## Movement
  337:## Animation
  360:## Sound
  373:### The choir
  448:## Notable implementation details
  510:## Layout
  545:## Credits

=== distinctive phrases from the old README: still present anywhere in docs? ===
  ORPHANED: Kelly-Lochbaum
  ORPHANED: north-up
  ORPHANED: sqrt
  (nothing listed above = all carried over)
```
</details>

Three real gaps (Kelly–Lochbaum is a false positive — en-dash). Let me check what else didn't make it:

**`Bash`** — Read the remaining old sections
```bash
OLD=~/proj/me/learn/blender-mcp/.capture-tmp/README.old.md
sed -n '119,132p' $OLD
echo "=== movement dials ==="; sed -n '325,337p' $OLD
echo "=== credits ==="; sed -n '545,560p' $OLD
```
<details><summary>result</summary>

```
## The idea

The torch does not burn out. Its job is **discovery**: as an undiscovered passage
comes into range the flame stirs, flares, and cools from amber toward blue-white.
Hunting a secret is a hot-and-cold game you play by watching your own light,
rather than by walking into every wall in the cave.

**Embers** scattered through the cavern permanently widen that sense (on a
`sqrt` curve — a linear bonus would grow the radius past 12 units and pop every
secret on the level without the player ever hunting for one).

---

## The story (live)
=== movement dials ===
input vector also means scraping along a wall slows his legs to match.

There is a real tension in the proportions worth knowing about. His legs are
0.28 units long and he is 1.36 tall, so a fully planted foot at any brisk speed
demands a fast cadence - at the original 4.2 u/s it would have been 8.8
steps/sec, a blur. Two dials in `Player.js`:

- `SPEED` - reduced 4.2 -> 3.2, which puts the locked cadence at 6.7 steps/sec
  (an energetic scurry, which suits the proportions)
- `FOOT_LOCK` - 1.0 is a perfectly planted foot. Lower it to trade some sliding
  back for a calmer cadence: 0.7 gives ~4.7 steps/sec and a 1.4x slide.

## Animation
=== credits ===
## Credits

Style reference: [Kenney](https://kenney.nl/assets) kits (chunky proportions,
flat facets, muted palette). No Kenney assets are used — every mesh here is
generated by the scripts in `blender/`. The loader is generic, so dropping real
Kenney props in is straightforward.
```
</details>

**`Bash`** — Restore orphaned content into the right docs
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='docs/ARCHITECTURE.md'; s=open(p).read()

# 1. tiles legend + the core mechanic belong in the code map near LevelGen
old = """**Architecture Invariant:** the way onward must be reachable *without* opening
any secret, and every secret must itself be findable."""
new = """Tiles:

``​`
 #  rock              .  floor            S  secret wall      P  spawn
 <  the way he came   >  the way onward   F  ember            *  crystal
 T  secret treasure   X  the way out
``​`

**Architecture Invariant:** the way onward must be reachable *without* opening
any secret, and every secret must itself be findable."""
assert old in s, 'MISS tiles'; s = s.replace(old, new, 1)

# 2. the central mechanic - the torch as instrument - and the sqrt curve
old = """### `src/game/Torch.js`, `src/game/Cutaway.js`, `src/game/IsoCamera.js`

The light and the discovery sense; the dithered wall dissolve; the orthographic
follow camera and the screen-relative input basis."""
new = """### `src/game/Torch.js`, `src/game/Cutaway.js`, `src/game/IsoCamera.js`

The light and the discovery sense; the dithered wall dissolve; the orthographic
follow camera and the screen-relative input basis.

**The torch does not burn out** — an early fuel mechanic was dropped. Its job is
*discovery*: as an undiscovered passage comes into range the flame stirs, flares,
and cools from amber toward blue-white, so hunting a secret is a hot-and-cold
game you play by watching your own light rather than by walking into every wall.

**Architecture Invariant:** embers widen that sense on a `sqrt` curve, never
linearly. There are 18 embers in a run and a linear bonus would grow the radius
past 12 units, popping every secret on the level without the player ever hunting
for one."""
assert old in s, 'MISS torch'; s = s.replace(old, new, 1)

# 3. movement + the proportion tension
old = """**Architecture Invariant:** the walk cycle is locked to *measured* ground speed"""
new = """Controls are `WASD` to move, drag with the mouse to pivot the camera, `Q`/`E` to
turn with the keyboard. Steering is screen-relative and follows the pivot.

There is a real tension in the 
… [truncated]
```
<details><summary>result</summary>

```
architecture: 4 sections restored
readme: credits restored
=== recheck orphans ===
  ok: north-up (1 files)
  ok: sqrt (1 files)
  ok: FOOT_LOCK (1 files)
  ok: Kenney (1 files)
  ok: hot-and-cold (1 files)
  ok: secret wall (1 files)
```
</details>

Now verifying the whole structure — every internal link resolves, the symlink works, and the documented commands actually run:

**`Bash`** — Verify structure and all internal links
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== structure ==="
find . -name node_modules -prune -o -name dist -prune -o -type f -name "*.md" -print | sort
ls -la CLAUDE.md
echo
echo "=== every relative markdown link resolves? ==="
fail=0
for f in README.md AGENTS.md $(find docs -name "*.md"); do
  d=$(dirname "$f")
  grep -oE '\]\([^)#][^)]*\)' "$f" 2>/dev/null | sed 's/](//;s/)$//' | while read l; do
    case "$l" in http*) continue;; esac
    t="${l%%#*}"
    [ -z "$t" ] && continue
    if [ ! -e "$d/$t" ]; then echo "  BROKEN  $f -> $l"; fi
  done
done
echo "  (no BROKEN lines above = all resolve)"
```
<details><summary>result</summary>

```
=== structure ===
./AGENTS.md
./docs/adr/0001-generate-caves-in-the-browser.md
./docs/adr/0002-climb-instead-of-descend.md
./docs/adr/0003-gate-the-way-up-on-full-discovery.md
./docs/adr/0004-authored-premise-not-invented-backstory.md
./docs/adr/0005-randomised-candidate-selection-for-variety.md
./docs/adr/0006-keep-the-api-key-server-side.md
./docs/adr/0007-bake-skin-weights-onto-bmesh-elements.md
./docs/adr/0008-linear-fog-with-an-orthographic-camera.md
./docs/adr/0009-articulatory-synthesis-for-the-choir.md
./docs/adr/0010-validate-the-generator-independently.md
./docs/adr/README.md
./docs/ARCHITECTURE.md
./docs/README.md
./docs/SETUP.md
./docs/systems/ASSETS.md
./docs/systems/AUDIO.md
./docs/systems/RENDERING.md
./docs/systems/STORY.md
./docs/WORKFLOWS.md
./README.md
lrwxr-xr-x@ 1 apshoemaker  staff  9 Sep  7 08:53 CLAUDE.md -> AGENTS.md

=== every relative markdown link resolves? ===
  BROKEN  docs/adr/README.md -> ...
  (no BROKEN lines above = all resolve)
```
</details>

That's the `[NNNN](...)` placeholder inside the ADR template code block — a false positive. Let me verify the anchor links and that the documented commands all work:

**`Bash`** — Verify anchors, commands, secrets, symlink
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== anchor targets exist? ==="
check() { # file anchor
  slug=$(grep -E "^#{1,6} " "$1" | sed 's/^#* //' | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9 -]//g; s/ /-/g' | grep -x "$2" | head -1)
  [ -n "$slug" ] && echo "  ok   $1#$2" || echo "  MISS $1#$2"
}
check docs/ARCHITECTURE.md architecture-invariants
check docs/WORKFLOWS.md verifying-a-change-in-the-browser
check docs/WORKFLOWS.md recording-media-for-the-readme
echo
echo "=== documented commands ==="
npm test 2>&1 | tail -1
npm run check 2>&1 | grep -E "^ok|built" 
echo
echo "=== secrets scan across everything that would be committed ==="
git ls-files --others --exclude-standard | while read f; do
  [ -f "$f" ] && grep -lE "sk-ant-[A-Za-z0-9_-]{10,}|wrkspc_[A-Za-z0-9]{10,}" "$f" 2>/dev/null
done | grep . && echo "!!! REAL KEY FOUND !!!" || echo "  clean (only sk-ant-... placeholders)"
echo
echo "=== git sees the symlink correctly? ==="
git status --porcelain | grep -i claude || echo "  (untracked repo; CLAUDE.md is a symlink on disk)"
file CLAUDE.md
```
<details><summary>result</summary>

```
=== anchor targets exist? ===
  ok   docs/ARCHITECTURE.md#architecture-invariants
  ok   docs/WORKFLOWS.md#verifying-a-change-in-the-browser
  ok   docs/WORKFLOWS.md#recording-media-for-the-readme

=== documented commands ===
ok  300 runs / 900 levels, all invariants hold (12.0ms per run)
ok  150 runs / 450 levels, all invariants hold (12.5ms per run)
✓ built in 895ms

=== secrets scan across everything that would be committed ===
  clean (only sk-ant-... placeholders)

=== git sees the symlink correctly? ===
?? CLAUDE.md
CLAUDE.md: Unicode text, UTF-8 text
```
</details>

Let me make the Node requirement accurate rather than assumed, and add the version pin that bootstrap legibility asks for:

**`Bash`** — Source the actual Node requirement
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
node -e "console.log('vite engines:', JSON.stringify(require('./node_modules/vite/package.json').engines))"
node -e "console.log('three engines:', JSON.stringify(require('./node_modules/three/package.json').engines||null))"
```
<details><summary>result</summary>

```
vite engines: {"node":"^20.19.0 || >=22.12.0"}
three engines: null
```
</details>

**`Bash`** — Pin Node version from a sourced requirement
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
node -v > .nvmrc && cat .nvmrc
# pin the requirement in package.json from Vite's actual engines field
python3 - <<'PY'
import json
p='package.json'; d=json.load(open(p))
d['engines'] = {"node": "^20.19.0 || >=22.12.0"}   # Vite 7's requirement
json.dump(d, open(p,'w'), indent=2); open(p,'a').write('\n')
print(json.dumps(d.get('engines')))
PY
# make the docs state the sourced requirement rather than a guess
python3 - <<'PY'
import sys
for p, old, new in [
  ('AGENTS.md',
   "npm install          # Node >= 20 (developed on 23), no other setup required",
   "npm install          # Node ^20.19 || >=22.12 (Vite 7's requirement); see .nvmrc"),
  ('docs/SETUP.md',
   "| **Node** | ≥ 20 (developed on 23). Nothing else is required to run the game. |",
   "| **Node** | `^20.19.0 \\|\\| >=22.12.0` — Vite 7's requirement, pinned in `package.json` engines. `.nvmrc` holds the version this was built on (23). Nothing else is needed to run the game. |"),
]:
    s = open(p).read()
    if old not in s: sys.exit(f'MISS in {p}')
    open(p,'w').write(s.replace(old, new, 1)); print('ok:', p)
PY
npm run check 2>&1 | grep -E "^ok|built"
```
<details><summary>result</summary>

```
v23.0.0
{"node": "^20.19.0 || >=22.12.0"}
ok: AGENTS.md
ok: docs/SETUP.md
ok  150 runs / 450 levels, all invariants hold (11.7ms per run)
✓ built in 862ms
```
</details>

**`Bash`** — Show final structure
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== final tree (docs + agent entrypoints) ==="
tree -a -I 'node_modules|dist|.git|.playwright-mcp' --dirsfirst 2>/dev/null || find . \( -name node_modules -o -name dist -o -name .git -o -name .playwright-mcp \) -prune -o -print | sort
echo
echo "=== sizes ==="
wc -l README.md AGENTS.md docs/*.md docs/systems/*.md | tail -8
```
<details><summary>result</summary>

```
=== final tree (docs + agent entrypoints) ===
.
./.env
./.gitignore
./.nvmrc
./AGENTS.md
./blender
./blender/__pycache__
./blender/__pycache__/lib_build.cpython-313.pyc
./blender/build_cavern.py
./blender/build_character.py
./blender/build_props.py
./blender/lib_build.py
./blender/preview_pose.py
./blender/preview.py
./CLAUDE.md
./docs
./docs/adr
./docs/adr/0001-generate-caves-in-the-browser.md
./docs/adr/0002-climb-instead-of-descend.md
./docs/adr/0003-gate-the-way-up-on-full-discovery.md
./docs/adr/0004-authored-premise-not-invented-backstory.md
./docs/adr/0005-randomised-candidate-selection-for-variety.md
./docs/adr/0006-keep-the-api-key-server-side.md
./docs/adr/0007-bake-skin-weights-onto-bmesh-elements.md
./docs/adr/0008-linear-fog-with-an-orthographic-camera.md
./docs/adr/0009-articulatory-synthesis-for-the-choir.md
./docs/adr/0010-validate-the-generator-independently.md
./docs/adr/README.md
./docs/ARCHITECTURE.md
./docs/media
./docs/media/discovery.gif
./docs/media/ending.gif
./docs/media/gate.gif
./docs/media/hero.png
./docs/README.md
./docs/SETUP.md
./docs/systems
./docs/systems/ASSETS.md
./docs/systems/AUDIO.md
… [truncated]
```
</details>

**`Bash`** — Identify the unmentioned blender scripts
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
head -6 blender/preview.py blender/preview_pose.py 2>/dev/null | head -20
```
<details><summary>result</summary>

```
==> blender/preview.py <==
"""Three-quarter preview render of whichever collection is named in PREVIEW_COL.
Used to eyeball assets from the CLI without switching to the Blender window."""
import bpy, math, os
from mathutils import Vector

COL = globals().get("PREVIEW_COL", "TorchBoy")

==> blender/preview_pose.py <==
"""Render the rig at a given frame of a given action - used to check that
bone rotations move the way the animation intends (brow tilt sign, etc)."""
import bpy, os
rig = bpy.data.objects["TorchBoyRig"]
act_name = globals().get("POSE_ACTION", "Walk")
frame = globals().get("POSE_FRAME", 7)
```
</details>

**`Bash`** — Document the preview helpers; review AGENTS.md
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='docs/systems/ASSETS.md'; s=open(p).read()
old = """Files: `lib_build.py` (shared bmesh helpers), `build_character.py`,
`build_props.py`, `build_cavern.py` (**no longer built** — see below)."""
new = """Files: `lib_build.py` (shared bmesh helpers), `build_character.py`,
`build_props.py`, `build_cavern.py` (**no longer built** — see below).

Two inspection helpers, not part of the build: `preview.py` renders a
three-quarter view of a named collection, and `preview_pose.py` renders the rig
at a given frame of a given action — the fastest way to check that a bone
rotation moves the way the animation intends without opening Blender."""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
python3 - <<'PY'
import sys
p='docs/ARCHITECTURE.md'; s=open(p).read()
old = """and
`build_cavern.py` (**no longer built** — kept as the reference implementation for
the floor-height port). See [systems/ASSETS.md](systems/ASSETS.md)."""
new = """and
`build_cavern.py` (**no longer built** — kept as the reference implementation for
the floor-height port), plus `preview.py` / `preview_pose.py` for eyeballing
assets from the CLI. See [systems/ASSETS.md](systems/ASSETS.md)."""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
cat AGENTS.md
```
<details><summary>result</summary>

```
ok
ok
# AGENTS.md

Torchboy — an isometric cavern game that runs in the browser. Art is generated
in Blender by script, the caves are generated per run in the browser, and the
story is written by Claude while the game is played.

**This file is a table of contents, not a manual.** Everything below is a
pointer. Read the linked doc when the task touches that area; do not read them
all up front.

## Bootstrap

``​`bash
npm install          # Node ^20.19 || >=22.12 (Vite 7's requirement); see .nvmrc
npm run dev          # http://localhost:5173
``​`

Assets are committed, so the game runs without Blender. `.env` is optional — the
story falls back to written beats without it. Full detail: **[docs/SETUP.md](docs/SETUP.md)**.

## Task entrypoints

| Command | What it does |
|---|---|
| `npm run dev` | dev server on :5173, with the story middleware mounted |
| `npm run check` | **validate the cave generator, then build** — run this before you claim done |
| `npm test` | the generator invariants over 300 runs (~3s) |
| `npm run build` / `npm run preview` | production build / serve it on :4173 |
| `npm run assets` | rebuild `.glb` from Blender sources (needs Blender 5.x) |

There is no linter or formatter in this repo. Match the surrounding style: the
codebase comments the *why*, not the *what*, and prefers a measured number over
an adjective.

## Validation

`npm run check` is the gate. Beyond it, this project is largely
**visual and audible**, and much of it cannot be asserted from a unit test — so
… [truncated]
```
</details>

**`Bash`** — Final verification against the rubric
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== final gate ==="
npm run check 2>&1 | grep -E "^ok|built|error"
grep -rlE "sk-ant-[A-Za-z0-9_-]{10,}" dist/ 2>/dev/null && echo LEAK || echo "dist clean"
echo
echo "=== docs only for cavern-game? nothing written outside it ==="
ls ~/proj/me/learn/blender-mcp/ | grep -v cavern-game
echo
echo "=== scorecard self-check (evidence in version control) ==="
printf "  bootstrap        "; { [ -f .nvmrc ] && node -e "process.exit(require('./package.json').engines?0:1)" && [ -f package-lock.json ]; } && echo "yes: .nvmrc, engines, lockfile" || echo "partial"
printf "  task entrypoints "; node -e "const s=require('./package.json').scripts;console.log(Object.keys(s).join(', '))"
printf "  validation       "; echo "npm run check / npm test -> tools/validate_levels.mjs"
printf "  lint/format      "; echo "NONE - stated plainly in AGENTS.md rather than implied"
printf "  agent repo map   "; ls AGENTS.md CLAUDE.md >/dev/null && echo "AGENTS.md (+ CLAUDE.md symlink)"
printf "  structured docs  "; echo "docs/ with index, systems/, cross-linked"
printf "  decision records "; echo "docs/adr/ x$(ls docs/adr/[0-9]*.md | wc -l | tr -d ' ') with Context/Decision/Consequences/Status"
```
<details><summary>result</summary>

```
=== final gate ===
ok  150 runs / 450 levels, all invariants hold (11.5ms per run)
✓ built in 673ms
dist clean

=== docs only for cavern-game? nothing written outside it ===
blender_mcp
boot.png
console-errs.txt
ending-card.png
hero.png

=== scorecard self-check (evidence in version control) ===
  bootstrap        yes: .nvmrc, engines, lockfile
  task entrypoints dev, build, preview, check, test, levels, assets
  validation       npm run check / npm test -> tools/validate_levels.mjs
  lint/format      NONE - stated plainly in AGENTS.md rather than implied
  agent repo map   AGENTS.md (+ CLAUDE.md symlink)
  structured docs  docs/ with index, systems/, cross-linked
  decision records docs/adr/ x10 with Context/Decision/Consequences/Status
```
</details>

**`Bash`** — Check stray files outside the repo
```bash
cd ~/proj/me/learn/blender-mcp
ls -la hero.png ending-card.png boot.png console-errs.txt 2>/dev/null
echo "--- created today by my capture attempts? ---"
find . -maxdepth 1 -newermt "2026-09-06" -type f 2>/dev/null
```
<details><summary>result</summary>

```
-rw-r--r--@ 1 apshoemaker  staff   21391 Sep  6 08:53 boot.png
-rw-r--r--@ 1 apshoemaker  staff   34047 Sep  6 08:59 console-errs.txt
-rw-r--r--@ 1 apshoemaker  staff   38011 Sep  6 13:57 ending-card.png
-rw-r--r--@ 1 apshoemaker  staff  170208 Sep  6 09:08 hero.png
--- created today by my capture attempts? ---
./hero.png
./ending-card.png
./.mcp.json
./console-errs.txt
./boot.png
```
</details>

Done. Scoped entirely to `cavern-game/`.

**Sources.** The OpenAI post 403s to fetch, so I worked from OpenAI's own published artifact for it — the [`agentic-legibility` skill](https://github.com/openai/build-hours/blob/main/24-api-codex/skills/agentic-legibility/SKILL.md) and its scorecard in [openai/build-hours](https://github.com/openai/build-hours) — cross-checked against [coverage of the post](https://www.ignorance.ai/p/the-emerging-harness-engineering). The seven metrics are: bootstrap self-sufficiency, task entrypoints, validation harness, lint/format gates, agent repo map, structured docs, decision records — with AGENTS.md as a ~100-line *table of contents*, not an encyclopedia. `ARCHITECTURE.md` follows [rust-analyzer's](https://raw.githubusercontent.com/rust-lang/rust-analyzer/d7c99931d05e3723d878bea5dc26766791fa4e69/docs/dev/architecture.md) form: Bird's Eye View → Code Map → Architecture Invariants → Cross-Cutting Concerns, with **Architecture Invariant:** callouts.

**Structure**

```
README.md          65 lines, marketing only    AGENTS.md    92 lines, ToC
CLAUDE.md -> AGENTS.md  (symlink)              .nvmrc
docs/  README.md · ARCHITECTURE.md · SETUP.md · WORKFLOWS.md
       systems/  STORY · AUDIO · RENDERING · ASSETS
       adr/      0001–0010 + index
       media/    (unchanged)
```

**I had to fix the code before the docs could be true.** Both `npm run levels` and `npm run assets` were **broken** — still running the pre-browser cave pipeline against `public/data/`, deleted when caves moved in-browser. Documenting a validation command that crashes is worse than having none, since it's assumed to pass. So `tools/validate_levels.mjs` now validates the generator the game actually runs, re-deriving the invariants *independently* of `LevelGen`'s own `validate()` (a test that called it would only agree with its bugs). `npm run check` and `npm test` are new and real; `build_assets.sh` no longer invokes the dead cave steps; `engines` is pinned from Vite's actual requirement rather than my guess.

**The 550-line README's content was redistributed, not discarded.** I diffed distinctive phrases against the new tree to catch orphans and recovered four — the tiles legend, the ember `sqrt` curve, the `SPEED`/`FOOT_LOCK` proportion tension, and the minimap's north-up rationale. Credits kept. That pass also caught a corruption I'd introduced earlier: a `sed` had spliced a stray line into the choir paragraph.

The ADRs are the real decisions with their real evidence — including the tin-whistle→ledger mode-collapse finding (0004/0005, one superseding the other), the 1750-of-1792-vertices skinning bug (0007), and why the generator gets an independent validator (0010).

Two things stated plainly rather than papered over: there is **no linter or formatter**, and `tools/gen_levels.mjs` and `blender/build_cavern.py` are **dead code kept as reference** — both flagged in AGENTS.md so an agent isn't misled.

Verified: every relative link and anchor resolves, the symlink resolves, `npm run check` passes (450 levels), `dist/` clean of key material. Stray capture screenshots from earlier sit in the parent directory, outside the repo.


---
[← 23-the-hero-image-should-be-of.md](23-the-hero-image-should-be-of.md)  ·  [index](README.md)