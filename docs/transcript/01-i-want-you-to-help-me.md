# 1. I want you to help me create a game that is isometric in nature in a cavern that is dimly lit and has secret p

[← index](README.md)

## The prompt

> I want you to help me create a game that is isometric in nature in a cavern that is dimly lit and has secret passage ways that are only revealed when you are close enough.  The character that you are playing as is a small boy with a giant head whose only light source is a torch that must be refueled regularly.  I want you to create the isometric and character artifacts in blender, but the game needs to be usable from a browser using three.js.  I like this vibe here https://threejs.org/examples/#webgl_animation_keyframes and like the multi level approach, so let's explore that vibe.

## What happened

I'll start by getting oriented — checking the working directory and whether Blender is actually connected before planning anything.

**`Bash`** — Inspect working directory and tooling
```bash
ls -la && echo "---NODE---" && node --version 2>/dev/null; npm --version 2>/dev/null; echo "---BLENDER---" && ls /Applications | grep -i blender; which blender
```
<details><summary>result</summary>

```
Exit code 1
total 8
drwxr-xr-x@  5 apshoemaker  staff   160 Sep  6 08:09 .
drwxr-xr-x@ 70 apshoemaker  staff  2240 Sep  6 07:52 ..
drwxr-xr-x@  3 apshoemaker  staff    96 Sep  6 08:18 .claude
-rw-r--r--@  1 apshoemaker  staff   228 Sep  6 08:10 .mcp.json
drwxr-xr-x@ 13 apshoemaker  staff   416 Sep  6 08:09 blender_mcp
---NODE---
v23.0.0
10.9.0
---BLENDER---
Blender.app
blender not found
```
</details>

**`Bash`** — Check memory and Blender process
```bash
cat ~/.claude/projects/-Users-apshoemaker-proj-me-learn-blender-mcp/memory/blender-official-mcp-setup.md 2>/dev/null; echo "---MCP JSON---"; cat .mcp.json; echo "---PS---"; ps aux | grep -i blender | grep -v grep | head -5
```
<details><summary>result</summary>

```
---
name: blender-official-mcp-setup
description: This project uses Blender's official Lab MCP server (cloned repo), not the PyPI blender-mcp; requires a local mcp<2 pin.
metadata:
  type: project
---

As of 2026-09-06, `~/proj/me/learn/blender-mcp` targets Blender 5.2.1's **official** MCP stack:
the bundled `lab_blender_org/mcp` extension plus the server cloned to `./blender_mcp/` and run via
`uv --directory .../blender_mcp/mcp run blender-mcp`.

Two traps that will recur:
- The official server's package AND entry point are both named `blender-mcp`, but it is **not on PyPI**.
  `uvx blender-mcp` silently installs ahujasid's unrelated community server, whose wire protocol
  (bare JSON) is incompatible with the official addon (NUL-delimited JSON) — it connects to port 9876,
  gets no reply, and hangs the MCP handshake until the client times out.
- Upstream `mcp/pyproject.toml` has an unpinned `mcp[cli]>=1.2.0` that resolves to mcp 2.x, where
  `FastMCP` was renamed `MCPServer`, so it crashes on import. A local edit pins `,<2`
  (backup at `pyproject.toml.orig`). **A `git pull` will revert this — re-apply the pin.**

**Why:** the name collision makes the wrong server look like the right one, and both failures present
identically as a connection timeout rather than an error.

**How to apply:** if the blender MCP server times out, check which server is configured and re-check the
mcp pin before debugging Blender itself.
---MCP JSON---
{
  "mcpServers": {
    "blender": {
      "command": "uv",
      "args": [
        "--directory",
        "~/proj/me/learn/blender-mcp/blender_mcp/mcp",
        "run",
        "blender-mcp"
      ]
    }
  }
}
---PS---
… [truncated]
```
</details>

**`ToolSearch`**
<details><summary>result</summary>

```




```
</details>

**`blender/execute_blender_code`**
```python

import bpy, sys
result = {
    "blender": bpy.app.version_string,
    "python": sys.version.split()[0],
    "file": bpy.data.filepath,
    "objects": [o.name for o in bpy.data.objects],
    "scene": bpy.context.scene.name,
    "gltf_addon": "io_scene_gltf2" in dir(bpy.ops.export_scene) or hasattr(bpy.ops.export_scene, "gltf"),
}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"blender":"5.2.1 LTS","python":"3.13.13","file":"","objects":["Camera","Cube","Light"],"scene":"Scene","gltf_addon":true}}
```
</details>

Blender 5.2.1 is live and connected, scene is default-empty. Here's my plan before I start generating:

**Architecture — one source of truth for level layout.** A `levels.json` of tile grids drives *both* the Blender geometry build *and* the browser's collision/secret-passage logic. That way the mesh you see and the walls you bump into can't drift apart.

Let me scaffold the project.

**`Bash`** — Scaffold cavern-game project
```bash
mkdir -p cavern-game/{blender,src/game,public/models,data} && cd cavern-game && cat > package.json <<'EOF'
{
  "name": "cavern-game",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173"
  },
  "dependencies": {
    "three": "^0.180.0"
  },
  "devDependencies": {
    "vite": "^7.1.0"
  }
}
EOF
echo ok && pwd
```
<details><summary>result</summary>

```
ok
~/proj/me/learn/blender-mcp/cavern-game
```
</details>

Now the shared level data. Caverns should look carved, not drawn, so I'll generate them with cellular automata and then place features on the result — baked to a stable JSON that both Blender and the browser consume.

**`Bash`** — Write and run cavern level generator
```bash
mkdir -p tools && cat > tools/gen_levels.mjs <<'EOF'
/**
 * Cavern level generator.
 *
 * Produces data/levels.json - the single source of truth consumed by BOTH
 * blender/build_cavern.py (geometry) and src/game/Level.js (collision, secrets).
 * Output is baked, so the geometry in the .glb and the collision grid in the
 * browser can never drift apart.
 *
 * Pipeline per level:
 *   1. random fill -> cellular-automata smoothing  = organic cave shape
 *   2. flood fill  -> largest region is "main", everything else is a pocket
 *   3. pockets big enough become SECRET ROOMS, joined to main by one `S` tile
 *   4. features (spawn, stairs, fuel, crystals, treasure) placed by distance
 *
 * Tiles:  ' ' void  '#' rock  '.' floor  'S' secret wall  'P' spawn
 *         '>' stairs down  '<' stairs up  'F' fuel cache  '*' crystal  'T' treasure
 */

const W = 40, H = 32;

// ---------------------------------------------------------------- rng
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- gen
function genCave(rnd, fillPct, steps) {
  let g = [];
  for (let y = 0; y < H; y++) {
    g[y] = [];
    for (let x = 0; x < W; x++) {
      const edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      g[y][x] = edge || rnd() < fillPct ? 1 : 0; // 1 = rock
    }
  }
  for (let s = 0; s < steps; s++) {
    const n = g.map((r) => r.slice());
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            c += g[y + dy][x + dx];
          }
        n[y][x] = c > 4 ? 1 : c < 4 ? 0 : g[y][x];
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) n[y][x] = 1;
      }
    }
    g = n;
  }
  return g;
}

… [truncated]
```
<details><summary>result</summary>

```
L0 The Threshold          floor=623 secrets=0 rooms=[] fuel=4 span=44
L1 The Weeping Gallery    floor=565 secrets=0 rooms=[] fuel=4 span=36
L2 The Deep Hollow        floor=417 secrets=1 rooms=[35] fuel=5 span=41

wrote data/levels.json  (40x32, 3 levels)
```
</details>

Only level 2 happened to leave a natural pocket — CA smoothing merges everything. Hoping for secrets isn't a design. I'll carve them deliberately into solid rock instead.

**`Bash`** — Add deliberate secret room carving
```bash
python3 - <<'PYEOF'
import re
p='tools/gen_levels.mjs'
s=open(p).read()

carve = '''
/**
 * Deliberately carve a secret room into solid rock beside the main region.
 * CA smoothing reliably merges all open space into one blob, so natural
 * sealed pockets are rare - we cannot leave secrets to chance.
 *
 * 1. find a disc of tiles that is ENTIRELY rock (so we do not eat the cave)
 * 2. carve it out as the room
 * 3. tunnel back through rock to the main region, leaving the LAST tile
 *    before the main region as `S` - the wall the player must stand near
 */
function carveSecretRoom(g, labels, mainId, rnd, radius) {
  const inB = (x, y) => x > 1 && y > 1 && x < W - 2 && y < H - 2;

  // --- candidate centres: solid rock with a fully-rock disc around them
  const centres = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (g[y][x] !== 1) continue;
      let clear = true;
      for (let dy = -radius; dy <= radius && clear; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx, ny = y + dy;
          if (!inB(nx, ny) || g[ny][nx] !== 1) { clear = false; break; }
        }
      if (clear) centres.push({ x, y });
    }
  }
  if (!centres.length) return null;

  // prefer a centre close to the cave, so the tunnel stays short
  const centre = centres[Math.floor(rnd() * centres.length)];

  const room = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      room.push({ x: centre.x + dx, y: centre.y + dy });
    }

  // --- BFS through ROCK from the room out to a tile touching the main region
  const prev = new Map();
  const key = (x, y) => y * W + x;
  const q = room.map((c) => ({ ...c }));
  const seen = new Set(q.map((c) => key(c.x, c.y)));
  let hit = null;
  for (let i = 0; i < q.length && !hit; i++) {
    const { x, y } = q[i];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inB(nx, ny) || seen.has(key(nx, ny))) continue;
      if (g[ny][nx] !== 1) continue;                
… [truncated]
```
<details><summary>result</summary>

```
patched
L0 The Threshold          floor=665 secrets=2 rooms=[29,13] fuel=4 span=46
L1 The Weeping Gallery    floor=608 secrets=3 rooms=[29,13,13] fuel=4 span=28
L2 The Deep Hollow        floor=430 secrets=3 rooms=[35,13,13] fuel=5 span=38

wrote data/levels.json  (40x32, 3 levels)
```
</details>

Now let me verify the invariant that actually matters: with `S` treated as solid, the rewards must be **unreachable** — otherwise the "secret" is just a room.

**`Bash`** — Validate secret-passage invariants
```bash
cat > tools/validate_levels.mjs <<'EOF'
/**
 * Asserts the design invariants of data/levels.json.
 * Run after every regeneration - a secret you can walk into is not a secret.
 */
import { readFileSync } from 'node:fs';
const doc = JSON.parse(readFileSync('data/levels.json', 'utf8'));
const SOLID = new Set(['#', 'S', ' ']);
let fail = 0;
const bad = (m) => { console.error('  FAIL ' + m); fail++; };

for (const lv of doc.levels) {
  const g = lv.grid.map((r) => r.split(''));
  const H = g.length, W = g[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : g[y][x]);
  const find = (ch) => { const o = []; g.forEach((r, y) => r.forEach((c, x) => c === ch && o.push({ x, y }))); return o; };

  console.log(`\nL${lv.index} ${lv.name}`);
  if (new Set(lv.grid.map((r) => r.length)).size !== 1) bad('ragged rows');

  const entry = [...find('P'), ...find('<')];
  if (entry.length !== 1) bad(`expected 1 entry, got ${entry.length}`);

  // reachability with S SOLID (what the player sees at first)
  const reach = (secretsPassable) => {
    const seen = g.map((r) => r.map(() => false));
    const q = [entry[0]];
    if (!entry[0]) return seen;
    seen[entry[0].y][entry[0].x] = true;
    for (let i = 0; i < q.length; i++) {
      const { x, y } = q[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, c = at(nx, ny);
        const open = !SOLID.has(c) || (secretsPassable && c === 'S');
        if (open && !seen[ny][nx]) { seen[ny][nx] = true; q.push({ x: nx, y: ny }); }
      }
    }
    return seen;
  };
  const closed = reach(false), opened = reach(true);

  // 1. exit must be reachable WITHOUT any secret - the game is never blocked
  const exit = [...find('>'), ...find('T')];
  for (const e of exit) {
    if (lv.index === doc.levels.length - 1 && at(e.x, e.y) === 'T') continue; // final goal may be secret-gated? check below
    if (!closed[e.y][e.x]) bad(`exit at ${e.x},${e.y} needs a secret to reach`);
  }

  // 2. every secret room reward must be UNREACHABLE until its wall is found
  const rewards = [...find('T'), ...find('F')];
  let gated = 0;
  for (const r of rewards) {
    if (!opened[r.y][r.x]
… [truncated]
```
<details><summary>result</summary>

```
Exit code 1

L0 The Threshold
  FAIL no reward is actually gated behind a secret
  FAIL secret wall at 10,5 opens nothing new
  FAIL secret wall at 32,6 opens nothing new
  floor=647 secrets=2 gated rewards=0/6 fuel=5 crystals=10

L1 The Weeping Gallery
  FAIL secret wall at 8,2 opens nothing new
  FAIL secret wall at 26,5 opens nothing new
  floor=601 secrets=3 gated rewards=1/7 fuel=6 crystals=12

L2 The Deep Hollow
  FAIL secret wall at 19,6 opens nothing new
  floor=454 secrets=3 gated rewards=2/9 fuel=7 crystals=14

6 FAILURE(S)
```
</details>

Good — the validator earned its keep. The carved rooms touch the cave directly (I required the disc to be rock, but not a buffer around it), so the `S` wall gates nothing. Let me rewrite the carver to self-verify.

**`Bash`** — Rewrite carver with self-verification
```bash
python3 - <<'PYEOF'
p='tools/gen_levels.mjs'
s=open(p).read()

start = s.index('/**\n * Deliberately carve a secret room')
end = s.index('function buildLevel(seed, opts) {')
new_fn = '''/**
 * Deliberately carve a secret room into solid rock beside the main cave.
 *
 * CA smoothing reliably merges all open space into one blob, so natural sealed
 * pockets are rare - secrets cannot be left to chance. The room is only valid
 * if it is UNREACHABLE while its `S` wall is treated as solid, so the carve is
 * verified before it is kept and rolled back otherwise.
 */
function carveSecretRoom(g, rnd, radius) {
  const inB = (x, y) => x > 1 && y > 1 && x < W - 2 && y < H - 2;
  const disc = (cx, cy, r) => {
    const o = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r) o.push({ x: cx + dx, y: cy + dy });
    return o;
  };

  // current main cave, recomputed each call (earlier carves changed the map)
  const { labels, regions: regs } = regions(g);
  if (!regs.length) return null;
  let mainId = 0;
  regs.forEach((r, i) => { if (r.length > regs[mainId].length) mainId = i; });
  const isMain = (x, y) => inB(x, y) && labels[y][x] === mainId;
  const touchesMain = (x, y) =>
    [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => isMain(x + dx, y + dy));

  // candidate centres: the room disc AND a one-tile buffer ring must be solid
  // rock, so carving cannot break straight through into the open cave.
  const centres = [];
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++)
      if (disc(x, y, radius + 1).every((c) => inB(c.x, c.y) && g[c.y][c.x] === 1))
        centres.push({ x, y });
  for (let i = centres.length - 1; i > 0; i--) {         // shuffle
    const j = Math.floor(rnd() * (i + 1));
    [centres[i], centres[j]] = [centres[j], centres[i]];
  }

  for (const centre of centres) {
    const room = disc(centre.x, centre.y, radius);

    // BFS out through rock. A tunnel tile may never touch the main cave -
    // only the terminal tile may, and that one stays solid as the `S` wall.
    const key = (x, y) => y * W + x;
    const prev = new Map();
    const q = room.map((c) => ({ ...c 
… [truncated]
```
<details><summary>result</summary>

```
Exit code 1
rewrote carveSecretRoom
L0 The Threshold          floor=623 secrets=0 rooms=[] fuel=4 span=44
L1 The Weeping Gallery    floor=565 secrets=3 rooms=[29,14,13] fuel=4 span=37
L2 The Deep Hollow        floor=417 secrets=3 rooms=[35,15,13] fuel=5 span=32

wrote data/levels.json  (40x32, 3 levels)

L0 The Threshold
  FAIL no reward is actually gated behind a secret
  floor=607 secrets=0 gated rewards=0/4 fuel=4 crystals=10

L1 The Weeping Gallery
  FAIL exit at 34,9 needs a secret to reach
  floor=600 secrets=3 gated rewards=3/7 fuel=6 crystals=12

L2 The Deep Hollow
  floor=456 secrets=3 gated rewards=3/9 fuel=7 crystals=14

2 FAILURE(S)
```
</details>

**`Bash`** — Dump level 1 grid to diagnose exit placement
```bash
node -e "
const doc=JSON.parse(require('fs').readFileSync('data/levels.json','utf8'));
const lv=doc.levels[1];
lv.grid.forEach((r,y)=>console.log(String(y).padStart(2),r));
console.log('char at 34,9 =', JSON.stringify(lv.grid[9][34]));
"
```
<details><summary>result</summary>

```
 0 ########################################
 1 ########################################
 2 #########F........######################
 3 #####.###......*...#####################
 4 ####...##...........#############.######
 5 ###.....##...........##########.....####
 6 ####..F####................####.....####
 7 ####S.#####.................##.......###
 8 ###F.######.................F##.....####
 9 ##....#####........#..........S...T.####
10 ##.....###........###..........##.######
11 ##.................#...........#########
12 ##.........................#...#########
13 ###........................##*.#########
14 ###............*..*........#...#########
15 ###........*...................#########
16 ###.......*....................#########
17 ####...*.......................#########
18 #####...........................########
19 ######.....................##.*..#######
20 #######....................##.....######
21 ########...........*......###......#####
22 #########.....<...........###.......####
23 ##########............*..#####....*..###
24 ##########.............#####..S##....###
25 ##########.............####...####...###
26 ##########..............##.F...###...###
27 ###########..............##...###.....##
28 #################...*....###.#####....##
29 ####################...F###########.>###
30 ########################################
31 ########################################
char at 34,9 = "T"
```
</details>

Two real issues, one of them mine: `T` is doing double duty as both secret treasure and final goal, so the validator flagged L1's treasure as an unreachable exit. I'll give the goal its own tile, and let the carver fall back to a smaller room when L0's rock is too thin.

**`Bash`** — Separate goal tile from treasure; retry carving
```bash
python3 - <<'PYEOF'
p='tools/gen_levels.mjs'; s=open(p).read()

# 'X' = final goal (distinct from 'T' secret treasure)
s = s.replace("""minSecret: 5, maxSecret: 40, entry: '<', exit: 'T', ambient: '#120f1c', fog: 0.08 },""",
              """minSecret: 5, maxSecret: 40, entry: '<', exit: 'X', ambient: '#120f1c', fog: 0.08 },""",1)
s = s.replace("""'F': 'fuel cache', '*': 'crystal', 'T': 'treasure',""",
              """'F': 'fuel cache', '*': 'crystal', 'T': 'secret treasure', 'X': 'the way out',""",1)
s = s.replace(""" *         '>' stairs down  'F' fuel cache  '*' crystal  'T' treasure""",
              """ *         '>' stairs down  'F' fuel  '*' crystal  'T' secret treasure  'X' goal""",1)

# carver: fall back to a smaller room when thick rock is scarce
s = s.replace("""    const r = carveSecretRoom(g, rnd, n === 0 ? 3 : 2);
    if (!r) break;""",
"""    const r = (n === 0 ? [3, 2] : [2, 3])
      .reduce((acc, rad) => acc || carveSecretRoom(g, rnd, rad), null);
    if (!r) break;""",1)

s = s.replace("{ name: 'The Threshold', seed: 20260906, fill: 0.44,",
              "{ name: 'The Threshold', seed: 20260906, fill: 0.46,",1)
open(p,'w').write(s); print('gen patched')

p='tools/validate_levels.mjs'; s=open(p).read()
s = s.replace("""  const exit = [...find('>'), ...find('T')];
  for (const e of exit) {
    if (lv.index === doc.levels.length - 1 && at(e.x, e.y) === 'T') continue; // final goal may be secret-gated? check below
    if (!closed[e.y][e.x]) bad(`exit at ${e.x},${e.y} needs a secret to reach`);
  }""",
"""  const exit = [...find('>'), ...find('X')];
  if (exit.length !== 1) bad(`expected 1 exit, got ${exit.length}`);
  for (const e of exit)
    if (!closed[e.y][e.x]) bad(`exit at ${e.x},${e.y} needs a secret to reach`);""",1)
open(p,'w').write(s); print('validator patched')
PYEOF
node tools/gen_levels.mjs && node tools/validate_levels.mjs
```
<details><summary>result</summary>

```
gen patched
validator patched
L0 The Threshold          floor=560 secrets=2 rooms=[13,13] fuel=4 span=64
L1 The Weeping Gallery    floor=565 secrets=3 rooms=[29,14,13] fuel=4 span=37
L2 The Deep Hollow        floor=417 secrets=3 rooms=[35,15,13] fuel=5 span=32

wrote data/levels.json  (40x32, 3 levels)

L0 The Threshold
  floor=568 secrets=2 gated rewards=2/6 fuel=5 crystals=10

L1 The Weeping Gallery
  floor=600 secrets=3 gated rewards=3/7 fuel=6 crystals=12

L2 The Deep Hollow
  floor=456 secrets=3 gated rewards=3/8 fuel=7 crystals=14

all invariants hold
```
</details>

All invariants hold — 8 genuinely sealed secret rooms. Now the Blender assets. Starting with the character, built with `bmesh` (deterministic and context-safe) and rigged with explicit weights.

**`Bash`** — Write shared bmesh helper library
```bash
cat > blender/lib_build.py <<'PYEOF'
"""Shared bmesh helpers for the cavern-game asset builds.

Everything is built with bmesh rather than bpy.ops.mesh.primitive_* so the
scripts are deterministic and do not depend on operator context - they behave
identically in the GUI session and in `blender --background`.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler


def purge(collection_name):
    """Remove a collection and everything in it, so builds are idempotent."""
    col = bpy.data.collections.get(collection_name)
    if col:
        for ob in list(col.objects):
            data = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if data and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Armature):
                    bpy.data.armatures.remove(data)
        bpy.data.collections.remove(col)
    col = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(col)
    return col


def material(name, color, roughness=0.9, metallic=0.0, emission=None, emission_strength=0.0):
    """Create or update a Principled material. glTF reads base color/emission."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = (*color, 1.0)
    return mat


# ---------------------------------------------------------------- primitives
def bm_rbox(bm, size, loc=(0, 0, 0), bevel=0.06, segments=3, rot=None):
    """Rounded box - the stylised base shape for the whole character."""
    sx, sy, sz = (s / 2.0 for s in size)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=(sx * 2, sy * 2, sz * 2), ve
… [truncated]
```
<details><summary>result</summary>

```
lib_build.py written:      153 lines
```
</details>

Now the character — a big-headed boy modeled in his torch-holding rest pose, rigidly weighted per part.

**`Bash`** — Write character build script
```bash
cat >> blender/lib_build.py <<'PYEOF'


def bm_limb(bm, p0, p1, width, bevel=0.045, segments=2, taper=1.0):
    """A rounded box spanning p0 -> p1. Used for arms, legs and the torch shaft.

    to_track_quat does the orientation maths so limbs can be authored as pairs
    of world-space points instead of hand-derived Euler angles.
    """
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    length = d.length
    verts = bm_rbox(bm, (width, width, length), bevel=bevel, segments=segments)
    if taper != 1.0:
        for v in verts:
            t = (v.co.z + length / 2) / length          # 0 at p0, 1 at p1
            k = 1.0 + (taper - 1.0) * t
            v.co.x *= k
            v.co.y *= k
    quat = d.to_track_quat('Z', 'Y')
    bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=quat.to_matrix())
    bmesh.ops.translate(bm, verts=verts, vec=(p0 + p1) / 2)
    return verts


def stash(obj, action):
    """Park an action in its own NLA track - the shape the glTF exporter wants
    in order to emit every action as a separate animation clip."""
    ad = obj.animation_data or obj.animation_data_create()
    track = ad.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, int(action.frame_range[0]), action)
    track.mute = True
    action.use_fake_user = True


def new_action(obj, name):
    """Start a fresh action on obj, handling Blender 4.4+ action slots."""
    ad = obj.animation_data or obj.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    if hasattr(ad, "action_slot"):
        slot = act.slots.new(id_type='OBJECT', name=obj.name) \
            if not len(act.slots) else act.slots[0]
        ad.action_slot = slot
    return act
PYEOF
cat > blender/build_character.py <<'PYEOF'
"""Builds TORCHBOY: a small boy with an enormous head, carrying a lit torch.

Run inside Blender. Produces one skinned mesh + armature with three clips
(Idle / Walk / Refuel) and exports public/models/torchboy.glb.

Conventions that the browser side depends on:
  * the character FACES -Y in Blender, which becomes +Z after the glTF
    Y-up conversion - so three.js can aim him with atan2(dx, dz).
  * a bone named `flame`
… [truncated]
```
<details><summary>result</summary>

```
written
```
</details>

Good reference — Kenney's kits (Mini Dungeon, Nature Kit) are chunky, flat-shaded and CC0, and that readability is exactly right for an isometric cave. Since you asked for the artifacts to be built in Blender, I'm treating Kenney as a *style* reference (chunky proportions, flat facets, saturated-but-muted palette) rather than importing meshes. Easy to swap in real Kenney props later if you'd rather — the loader is generic.

Now running the character build:

**`blender/execute_blender_code`**
```python

import os
p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py"
g = {"__file__": p, "__name__": "__main__"}
try:
    exec(compile(open(p).read(), p, "exec"), g)
    result = g.get("result", {"ok": True})
except Exception as e:
    import traceback
    result = {"error": str(e), "tb": traceback.format_exc()[-2000:]}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"error":"'Action' object has no attribute 'fcurves'","tb":"Traceback (most recent call last):\n  File \"<string>\", line 6, in <module>\n  File \"~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py\", line 245, in <module>\n    animate(rig)\n    ~~~~~~~^^^^^\n  File \"~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py\", line 181, in animate\n    cyclic(act)\n    ~~~~~~^^^^^\n  File \"~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py\", line 160, in cyclic\n    for fc in action.fcurves:\n              ^^^^^^^^^^^^^^\nAttributeError: 'Action' object has no attribute 'fcurves'\n"}}
```
</details>

Blender 5.x moved F-Curves into slotted action channelbags — `action.fcurves` is gone. Let me confirm the actual shape rather than guess:

**`blender/execute_blender_code`**
```python

import bpy
a = bpy.data.actions.get("Idle")
info = {"actions": [x.name for x in bpy.data.actions]}
if a:
    info["layers"] = len(a.layers)
    L0 = a.layers[0]
    s = L0.strips[0]
    info["strip_type"] = s.type
    info["strip_attrs"] = [x for x in dir(s) if "channel" in x.lower()]
    cbs = getattr(s, "channelbags", None)
    info["channelbags"] = len(cbs) if cbs is not None else None
    if cbs:
        info["fcurves_in_cb0"] = len(cbs[0].fcurves)
        info["sample_path"] = cbs[0].fcurves[0].data_path
    info["slots"] = [sl.name_display for sl in a.slots]
result = info

```
<details><summary>result</summary>

```
{"status":"ok","result":{"actions":["Idle"],"layers":1,"strip_type":"KEYFRAME","strip_attrs":["channelbag","channelbags"],"channelbags":1,"fcurves_in_cb0":18,"sample_path":"pose.bones[\"root\"].rotation_euler","slots":["TorchBoyRig"]}}
```
</details>

Confirmed: `strip.channelbags[0].fcurves`. Patching with a version-tolerant accessor, and clearing stale actions so reruns stay idempotent:

**`Bash`** — Patch for Blender 5.x slotted actions
```bash
python3 - <<'PYEOF'
p='blender/lib_build.py'; s=open(p).read()
s += '''

def fcurves_of(action):
    """Blender 5.x moved F-Curves into slotted-action channelbags; 4.x kept
    action.fcurves. Support both so the build runs on either."""
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                out.extend(cb.fcurves)
    return out


def drop_actions(names):
    """Remove actions left behind by a previous run so names stay clean."""
    for a in list(bpy.data.actions):
        base = a.name.split(".")[0]
        if base in names:
            a.use_fake_user = False
            bpy.data.actions.remove(a)
'''
open(p,'w').write(s)

p='blender/build_character.py'; s=open(p).read()
s = s.replace("    for fc in action.fcurves:", "    for fc in L.fcurves_of(action):",1)
s = s.replace("def animate(rig):\n    Z = (0, 0, 0)",
              "def animate(rig):\n    Z = (0, 0, 0)\n    if rig.animation_data:\n        rig.animation_data.action = None\n        for t in list(rig.animation_data.nla_tracks):\n            rig.animation_data.nla_tracks.remove(t)\n    L.drop_actions({\"Idle\", \"Walk\", \"Refuel\"})",1)
open(p,'w').write(s)
print("patched")
PYEOF
grep -n "fcurves_of\|drop_actions" blender/build_character.py
```
<details><summary>result</summary>

```
patched
160:    for fc in L.fcurves_of(action):
173:    L.drop_actions({"Idle", "Walk", "Refuel"})
```
</details>

**`blender/execute_blender_code`**
```python

import os
p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py"
g = {"__file__": p, "__name__": "__main__"}
try:
    exec(compile(open(p).read(), p, "exec"), g)
    result = g.get("result", {"ok": True})
except Exception as e:
    import traceback
    result = {"error": str(e), "tb": traceback.format_exc()[-2000:]}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"verts":1434,"tris":2784,"bones":["root","hips","spine","head","arm.R","torch","flame","arm.L","leg.R","leg.L"],"actions":["Idle","Refuel","Walk"],"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb","bytes":197508},"stdout":"INFO Draco is available, use library at /Applications/Blender.app/Contents/Resources/5.2/scripts/addons_core/io_scene_gltf2/libbf_intern_draco_bridge.dylib\nINFO MeshOptimizer is available, use library at /Applications/Blender.app/Contents/Resources/5.2/scripts/addons_core/io_scene_gltf2/libbf_intern_meshopt_bridge.dylib\n08:38:01 | INFO: Starting glTF 2.0 export\n08:38:01 | INFO: Extracting primitive: TorchBoyMesh\n08:38:01 | INFO: Primitives created: 9\n08:38:01 | INFO: Finished glTF 2.0 export in 0.12506604194641113 s\n\n"}
```
</details>

Character exported — 2784 tris, 10 bones, 3 clips. Let me actually look at him rather than assume:

**`blender/execute_blender_code`**
```python

import bpy, math, os
from mathutils import Vector

scene = bpy.context.scene
# isolate the character for the preview
for ob in scene.objects:
    ob.hide_render = not (ob.users_collection and bpy.data.collections["TorchBoy"] in ob.users_collection)

cam = bpy.data.objects.get("PreviewCam")
if not cam:
    cd = bpy.data.cameras.new("PreviewCam"); cam = bpy.data.objects.new("PreviewCam", cd)
    scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.3
cam.location = (2.6, -3.2, 2.4)
cam.rotation_euler = (math.radians(63), 0, math.radians(39))
cam.hide_render = False
scene.camera = cam

for n, loc, e in (("K", (3, -4, 5), 400), ("F", (-4, -2, 2), 120), ("R", (0, 4, 3), 200)):
    lo = bpy.data.objects.get("prev_"+n)
    if not lo:
        ld = bpy.data.lights.new("prev_"+n, 'AREA'); lo = bpy.data.objects.new("prev_"+n, ld)
        scene.collection.objects.link(lo)
    lo.data.energy = e; lo.data.size = 4; lo.location = loc
    lo.rotation_euler = (Vector((0,0,1.0)) - Vector(loc)).to_track_quat('-Z','Y').to_euler()
    lo.hide_render = False

scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 600; scene.render.resolution_y = 700
scene.render.film_transparent = False
scene.world = scene.world or bpy.data.worlds.new("W")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.06,0.07,0.09,1
… [truncated]
```
<details><summary>result</summary>

```
{"status":"error","message":"Traceback (most recent call last):\n  File \"~/Library/Application Support/Blender/5.2/extensions/lab_blender_org/mcp/mcp_to_blender_server.py\", line 230, in _execute_code\n    exec(code, namespace)\n    ~~~~^^^^^^^^^^^^^^^^^\n  File \"<string>\", line 29, in <module>\nTypeError: bpy_struct: item.attr = val: enum \"BLENDER_EEVEE_NEXT\" not found in ('BLENDER_EEVEE', 'BLENDER_WORKBENCH', 'CYCLES')\n"}
```
</details>

Switching to a spherical head. Adding a dome helper for the hair cap so it sits properly on a sphere:

**`Bash`** — Make the head spherical
```bash
python3 - <<'PYEOF'
p='blender/lib_build.py'; s=open(p).read()
s = s.replace('''def stash(obj, action):''', '''def bm_dome(bm, radius, loc=(0, 0, 0), cut=0.0, subdiv=3, scale=(1, 1, 1)):
    """An icosphere with everything below `cut` (relative to loc) sliced off.
    Used for hair sitting as a cap on a spherical skull."""
    verts = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)["verts"]
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, vec=scale, verts=verts)
    doomed = [v for v in verts if v.co.z < cut]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    verts = [v for v in verts if v.is_valid]
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


def stash(obj, action):''', 1)
open(p,'w').write(s); print('lib: bm_dome added')

p='blender/build_character.py'; s=open(p).read()

s = s.replace('''HEAD_SZ  = (0.74, 0.64, 0.70)            # deliberately absurd next to the body''',
              '''HEAD_R   = 0.37                          # a true sphere, absurd next to the body''',1)

old_head = s[s.index('    # -------------------------------------------------------------- the head'):s.index('    # -------------------------------------------------------------- the body')]
new_head = '''    # -------------------------------------------------------------- the head
    # a true sphere - the whole silhouette is this ball balanced on a small body
    P.add(L.bm_sphere(bm, HEAD_R, HEAD_C, subdiv=3), "skin", "head")

    # hair: a dome cap sliced off the same sphere, a hair's breadth larger
    P.add(L.bm_dome(bm, HEAD_R + 0.022, HEAD_C + Vector((0, 0.02, 0.0)),
                    cut=0.10, subdiv=3), "hair", "head")
    P.add(L.bm_limb(bm, HEAD_C + Vector((0.05, 0.14, HEAD_R + 0.01)),
                    HEAD_C + Vector((0.09, 0.27, HEAD_R + 0.16)), 0.085, taper=0.25),
          "hair", "head")

    # eyes, seated on the front of the sphere (-Y) so they bulge very slightly
    for sx in (-1, 1):
        P.add(L.bm_sphere(bm, 0.075, HEAD_C + Vector((0.150 * sx, -0.300, 0.03)),
                          subdiv=2, scale=(1.0, 0.62, 1.15)), "eye", "head")
    # ears, flat discs on the equator
    for sx 
… [truncated]
```
<details><summary>result</summary>

```
lib: bm_dome added
character: spherical head
24:HEAD_R   = 0.37                          # a true sphere, absurd next to the body
60:    P.add(L.bm_sphere(bm, HEAD_R, HEAD_C, subdiv=3), "skin", "head")
63:    P.add(L.bm_dome(bm, HEAD_R + 0.022, HEAD_C + Vector((0, 0.02, 0.0)),
65:    P.add(L.bm_limb(bm, HEAD_C + Vector((0.05, 0.14, HEAD_R + 0.01)),
66:                    HEAD_C + Vector((0.09, 0.27, HEAD_R + 0.16)), 0.085, taper=0.25),
75:        P.add(L.bm_sphere(bm, 0.085, HEAD_C + Vector((HEAD_R * 0.94 * sx, 0.01, -0.03)),
```
</details>

**`Bash`** — Write preview render script
```bash
cat > blender/preview.py <<'PYEOF'
"""Three-quarter preview render of whichever collection is named in PREVIEW_COL.
Used to eyeball assets from the CLI without switching to the Blender window."""
import bpy, math, os
from mathutils import Vector

COL = globals().get("PREVIEW_COL", "TorchBoy")
OUTPATH = globals().get("PREVIEW_OUT", "/tmp/preview.png")
ORTHO = globals().get("PREVIEW_ORTHO", 2.4)
CAMLOC = globals().get("PREVIEW_CAMLOC", (2.6, -3.2, 2.4))
AIM = Vector(globals().get("PREVIEW_AIM", (0, 0, 0.8)))
RES = globals().get("PREVIEW_RES", (620, 720))

scene = bpy.context.scene
target = bpy.data.collections.get(COL)
for ob in scene.objects:
    keep = ob.name.startswith("prev_") or ob.name == "PreviewCam"
    ob.hide_render = not (keep or (target and target in ob.users_collection))

cam = bpy.data.objects.get("PreviewCam")
if not cam:
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = ORTHO
cam.location = CAMLOC
cam.rotation_euler = (AIM - Vector(CAMLOC)).to_track_quat('-Z', 'Y').to_euler()
cam.hide_render = False
scene.camera = cam

for n, loc, e, sz in (("key", (3, -4, 5), 600, 5), ("fill", (-4, -2, 2), 150, 6),
                      ("rim", (0, 4.5, 3), 320, 4)):
    lo = bpy.data.objects.get("prev_" + n)
    if not lo:
        lo = bpy.data.objects.new("prev_" + n, bpy.data.lights.new("prev_" + n, 'AREA'))
        scene.collection.objects.link(lo)
    lo.data.energy, lo.data.size = e, sz
    lo.location = loc
    lo.rotation_euler = (AIM - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    lo.hide_render = False

scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = OUTPATH
if not scene.world:
    scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)
scene.view_settings.view_transform = 'AgX'
bpy.ops.render.render(write_still=True)
result = {"rendered": OUTPATH}
PYEOF
echo ok
```
<details><summary>result</summary>

```
ok
```
</details>

**`blender/execute_blender_code`**
```python

import os, traceback
base = "~/proj/me/learn/blender-mcp/cavern-game/blender/"
out = {}
try:
    p = base + "build_character.py"
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    out["build"] = g.get("result")
    p2 = base + "preview.py"
    g2 = {"__file__": p2, "PREVIEW_COL": "TorchBoy", "PREVIEW_OUT": "/tmp/torchboy.png",
          "PREVIEW_ORTHO": 2.2, "PREVIEW_CAMLOC": (2.4, -3.0, 2.2), "PREVIEW_AIM": (0, 0, 0.78)}
    exec(compile(open(p2).read(), p2, "exec"), g2)
    out["preview"] = g2.get("result")
except Exception as e:
    out["error"] = traceback.format_exc()[-1800:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"build":{"verts":1349,"tris":2591,"bones":["root","hips","spine","head","arm.R","torch","flame","arm.L","leg.R","leg.L"],"actions":["Idle","Refuel","Walk"],"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb","bytes":192608},"preview":{"rendered":"/tmp/torchboy.png"}},"stdout":"08:39:05 | INFO: Starting glTF 2.0 export\n08:39:05 | INFO: Extracting primitive: TorchBoyMesh\n08:39:05 | INFO: Primitives created: 9\n08:39:06 | INFO: Finished glTF 2.0 export in 0.1420290470123291 s\n\n"}
```
</details>

**`Read`**

Charming silhouette. Three real defects: the hair cap has a jagged edge (slicing an icosphere gives a ragged boundary), the palette is washed out, and AgX is desaturating the preview. Fixing all three:

**`Bash`** — Clean hairline, darker palette, neutral preview transform
```bash
python3 - <<'PYEOF'
p='blender/lib_build.py'; s=open(p).read()
s = s.replace('def stash(obj, action):', '''def bm_uvdome(bm, radius, loc=(0, 0, 0), ring=4, u=24, v=12, scale=(1, 1, 1)):
    """A spherical cap with a CLEAN circular edge.

    Slicing an icosphere leaves a ragged zig-zag boundary, which reads as a
    jagged hairline. A UV sphere's vertices sit on fixed latitudes, so cutting
    exactly at ring `ring` (counted from the north pole) gives a clean rim.
    """
    verts = bmesh.ops.create_uvsphere(
        bm, u_segments=u, v_segments=v, radius=radius)["verts"]
    cut = radius * math.cos(math.pi * ring / v)
    doomed = [x for x in verts if x.co.z < cut - 1e-4]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    verts = [x for x in verts if x.is_valid]
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, vec=scale, verts=verts)
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


def stash(obj, action):''', 1)
open(p,'w').write(s); print('lib: bm_uvdome')

p='blender/build_character.py'; s=open(p).read()

# darker, more saturated palette - a dim cavern eats washed-out colour
s = s.replace('''    "skin":   ((0.88, 0.68, 0.53), 0.75),
    "hair":   ((0.13, 0.09, 0.07), 0.85),
    "shirt":  ((0.25, 0.36, 0.34), 0.90),
    "pants":  ((0.17, 0.16, 0.20), 0.90),
    "boot":   ((0.11, 0.10, 0.11), 0.75),
    "eye":    ((0.03, 0.03, 0.05), 0.35),
    "wood":   ((0.26, 0.17, 0.11), 0.95),
    "wrap":   ((0.42, 0.34, 0.24), 0.95),''',
'''    "skin":   ((0.86, 0.60, 0.44), 0.70),
    "hair":   ((0.055, 0.035, 0.028), 0.88),
    "shirt":  ((0.13, 0.31, 0.30), 0.88),
    "pants":  ((0.10, 0.09, 0.13), 0.90),
    "boot":   ((0.055, 0.048, 0.055), 0.70),
    "eye":    ((0.02, 0.02, 0.03), 0.30),
    "wood":   ((0.20, 0.12, 0.07), 0.95),
    "wrap":   ((0.36, 0.27, 0.17), 0.95),''', 1)

# clean-edged hair cap with a front fringe
s = s.replace('''    # hair: a dome cap sliced off the same sphere, a hair's breadth larger
    P.add(L.bm_dome(bm, HEAD_R + 0.022, HEAD_C + Vector((0, 0.02, 0.0)),
                    cut=0.10, subdiv=3), "hair", "head")''',
'''    # hair: a clean-rimmed cap, plus a fringe that dips over the brow
… [truncated]
```
<details><summary>result</summary>

```
lib: bm_uvdome
character: palette + clean hairline
50:scene.view_settings.view_transform = ('Khronos PBR Neutral' if 'Khronos PBR Neutral' in [e.identifier for e in type(scene.view_settings).bl_rna.properties['view_transform'].enum_items] else 'Standard')
```
</details>

**`blender/execute_blender_code`**
```python

import traceback
base = "~/proj/me/learn/blender-mcp/cavern-game/blender/"
out = {}
try:
    for p, extra in ((base+"build_character.py", {}),
                     (base+"preview.py", {"PREVIEW_COL": "TorchBoy", "PREVIEW_OUT": "/tmp/torchboy.png",
                                          "PREVIEW_ORTHO": 2.2, "PREVIEW_CAMLOC": (2.4, -3.0, 2.2),
                                          "PREVIEW_AIM": (0, 0, 0.78)})):
        g = {"__file__": p, "__name__": "__main__"}; g.update(extra)
        exec(compile(open(p).read(), p, "exec"), g)
        out[p.split("/")[-1]] = g.get("result")
except Exception as e:
    out["error"] = traceback.format_exc()[-1800:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"build_character.py":{"verts":1486,"tris":2832,"bones":["root","hips","spine","head","arm.R","torch","flame","arm.L","leg.R","leg.L"],"actions":["Idle","Refuel","Walk"],"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb","bytes":200132},"preview.py":{"rendered":"/tmp/torchboy.png"}},"stdout":"08:39:59 | INFO: Starting glTF 2.0 export\n08:39:59 | INFO: Extracting primitive: TorchBoyMesh\n08:39:59 | INFO: Primitives created: 9\n08:39:59 | INFO: Finished glTF 2.0 export in 0.12011218070983887 s\n\n","stderr":"~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:48: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.use_nodes = True\n"}
```
</details>

**`Read`**

Hairline is clean. But my preview lights are blowing out the albedo — the pants read mid-gray when they're actually near-black. Fixing the preview exposure, and tilting the hair cap forward so it dips at the brow instead of reading like a helmet:

**`Bash`** — Fix preview exposure and hair tilt
```bash
python3 - <<'PYEOF'
p='blender/preview.py'; s=open(p).read()
s = s.replace('''for n, loc, e, sz in (("key", (3, -4, 5), 600, 5), ("fill", (-4, -2, 2), 150, 6),
                      ("rim", (0, 4.5, 3), 320, 4)):''',
'''# modest energies: over-lighting flattens albedo and hides the real palette
for n, loc, e, sz in (("key", (3, -4, 5), 110, 5), ("fill", (-4, -2, 2), 22, 6),
                      ("rim", (0, 4.5, 3), 48, 4)):''',1)
open(p,'w').write(s); print('preview exposure')

p='blender/build_character.py'; s=open(p).read()
s = s.replace('''    # hair: a clean-rimmed cap, plus a fringe that dips over the brow
    P.add(L.bm_uvdome(bm, HEAD_R + 0.024, HEAD_C, ring=4, u=28, v=14), "hair", "head")
    P.add(L.bm_uvdome(bm, HEAD_R + 0.020, HEAD_C + Vector((0, 0, -0.085)),
                      ring=3, u=28, v=14, scale=(1.0, 0.62, 1.0)), "hair", "head")''',
'''    # hair: a clean-rimmed cap, tilted forward so the hairline dips over the
    # brow and rides up at the nape - a flat cut reads like a helmet
    cap = L.bm_uvdome(bm, HEAD_R + 0.024, HEAD_C, ring=5, u=28, v=14)
    bmesh.ops.rotate(bm, verts=cap, cent=HEAD_C,
                     matrix=Euler((-0.34, 0, 0), 'XYZ').to_matrix())
    P.add(cap, "hair", "head")''',1)
s = s.replace('from mathutils import Vector\n', 'from mathutils import Vector, Euler\n',1)
open(p,'w').write(s); print('character: tilted hair')
PYEOF
grep -n "^from mathutils" blender/build_character.py
```
<details><summary>result</summary>

```
preview exposure
character: tilted hair
13:from mathutils import Vector, Euler
```
</details>

**`blender/execute_blender_code`**
```python

import traceback
base = "~/proj/me/learn/blender-mcp/cavern-game/blender/"
out = {}
try:
    for p, extra in ((base+"build_character.py", {}),
                     (base+"preview.py", {"PREVIEW_COL": "TorchBoy", "PREVIEW_OUT": "/tmp/torchboy.png",
                                          "PREVIEW_ORTHO": 2.2, "PREVIEW_CAMLOC": (2.4, -3.0, 2.2),
                                          "PREVIEW_AIM": (0, 0, 0.78)})):
        g = {"__file__": p, "__name__": "__main__"}; g.update(extra)
        exec(compile(open(p).read(), p, "exec"), g)
        out[p.split("/")[-1]] = g.get("result")
except Exception:
    out["error"] = traceback.format_exc()[-1800:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"build_character.py":{"verts":1429,"tris":2748,"bones":["root","hips","spine","head","arm.R","torch","flame","arm.L","leg.R","leg.L"],"actions":["Idle","Refuel","Walk"],"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb","bytes":197120},"preview.py":{"rendered":"/tmp/torchboy.png"}},"stdout":"08:40:33 | INFO: Starting glTF 2.0 export\n08:40:33 | INFO: Extracting primitive: TorchBoyMesh\n08:40:33 | INFO: Primitives created: 9\n08:40:33 | INFO: Finished glTF 2.0 export in 0.11910700798034668 s\n\n","stderr":"~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:49: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.node_tree.nodes[\"Background\"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)\n"}
```
</details>

**`Read`**

He reads well now — dark swept hair, proper albedo. Moving to the cavern. This script turns the tile grids into geometry via a shared corner lattice, so jittered wall tops seam perfectly and secret walls are visually indistinguishable from real rock.

**`Bash`** — Write cavern build script
```bash
cat > blender/build_cavern.py <<'PYEOF'
"""Builds the cavern geometry from data/levels.json and exports cavern.glb.

The grid in levels.json is the single source of truth: this script turns it
into meshes, and src/game/Level.js turns the SAME file into collision. Nothing
about the layout is authored twice.

Key ideas:
  * a shared CORNER LATTICE gives every tile corner one jittered height, so
    neighbouring wall tops and floor tiles seam perfectly instead of stepping.
  * only rock tiles NEAR floor are built - the solid interior of the map is
    never seen and would be tens of thousands of wasted triangles.
  * each secret wall is its own object (`L0_secret_12_7`) so the game can fade
    one individually, but it shares the lattice and material with ordinary
    rock, so it is genuinely indistinguishable until revealed.

Axis mapping (documented because the browser side must match exactly):
    tile (tx, ty)  ->  Blender (  (tx - W/2)*TS,  -(ty - H/2)*TS,  -level*DROP )
    glTF Y-up flip ->  three.js (  x,  y_blender_z,  -y_blender  )
    so in three.js:   x = (tx - W/2)*TS,   z = (ty - H/2)*TS
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_build as L
import importlib; importlib.reload(L)

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DOC = json.load(open(os.path.join(ROOT, "data", "levels.json")))

TS      = DOC["tileSize"]
WALL_H  = DOC["wallHeight"]
DROP    = DOC["levelDrop"]
W, H    = DOC["width"], DOC["height"]
FLOOR_D = 0.75                  # floor slab thickness
SOLID   = set("#S ")
WALKABLE = set(".PFT*<>X")


def hsh(x, y, salt=0):
    """Deterministic 0..1 hash - identical geometry on every rebuild."""
    n = (x * 374761393 + y * 668265263 + salt * 2654435761) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF


def corner(cx, cy):
    return ((cx - W / 2) * TS, -(cy - H / 2) * TS)


def tile_centre(tx, ty):
    return ((tx - W / 2 + 0.5) * TS, -(ty - H / 2 + 0.5) * TS)


class Grid:
    def __init__(self, rows):
        self.rows =
… [truncated]
```
<details><summary>result</summary>

```
written
```
</details>

Three character notes — mohawk, smaller eyes, and expressive eyebrows. Eyebrows need their own bones to animate, so I'll add `brow.L`/`brow.R` to the rig and drive them in the walk cycle.

**`Bash`** — Add mohawk, smaller eyes, eyebrow bones
```bash
python3 - <<'PYEOF'
p='blender/build_character.py'; s=open(p).read()

# ---- mohawk replaces the cap, smaller eyes, add eyebrows
old = s[s.index("    # hair: a clean-rimmed cap"):s.index("    # ears, flat discs on the equator")]
new = '''    # hair: a mohawk - a row of tapered spikes along the crest of the skull,
    # leaning back, tallest in the middle.
    SPIKES = 8
    for k in range(SPIKES):
        u = k / (SPIKES - 1)                       # 0 = brow, 1 = nape
        a = -0.80 + u * 1.75                       # angle along the crest
        d = Vector((0, -math.sin(a), math.cos(a)))
        lean = (d + Vector((0, 0.30, 0))).normalized()
        hgt = 0.10 + 0.27 * math.sin(math.pi * u) ** 0.7
        base = HEAD_C + d * (HEAD_R - 0.03)
        P.add(L.bm_limb(bm, base, base + lean * (0.06 + hgt), 0.115, taper=0.10),
              "hair", "head")

    # eyes: small and dark - the eyebrows carry the expression, not the eyes
    for sx in (-1, 1):
        P.add(L.bm_sphere(bm, 0.052, HEAD_C + Vector((0.150 * sx, -0.315, 0.02)),
                          subdiv=2, scale=(1.0, 0.60, 1.15)), "eye", "head")

    # eyebrows: separate objects on their own bones so they can act
    for sx, bone in ((-1, "brow.R"), (1, "brow.L")):
        P.add(L.bm_rbox(bm, (0.125, 0.048, 0.032),
                        HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z)),
                        bevel=0.013, segments=2), "hair", bone)

'''
s = s.replace(old, new, 1)

s = s.replace("HEAD_R   = 0.37 ", "BROW_Z   = 0.128                         # brow height above head centre\nHEAD_R   = 0.37 ", 1)

# ---- brow bones
s = s.replace('''    bone("arm.R", SH_R, HAND_R, "spine")''',
'''    for sx, nm in ((-1, "brow.R"), (1, "brow.L")):
        bh = HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z))
        bone(nm, bh, bh + Vector((0, 0, 0.07)), "head")
    bone("arm.R", SH_R, HAND_R, "spine")''', 1)
open(p,'w').write(s); print('mohawk + small eyes + brow bones')
PYEOF
grep -n "BROW_Z\|brow\|SPIKES" blender/build_character.py | head -20
```
<details><summary>result</summary>

```
mohawk + small eyes + brow bones
6:Conventions that the browser side depends on:
24:BROW_Z   = 0.128                         # brow height above head centre
65:    SPIKES = 8
66:    for k in range(SPIKES):
67:        u = k / (SPIKES - 1)                       # 0 = brow, 1 = nape
76:    # eyes: small and dark - the eyebrows carry the expression, not the eyes
81:    # eyebrows: separate objects on their own bones so they can act
82:    for sx, bone in ((-1, "brow.R"), (1, "brow.L")):
84:                        HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z)),
145:    for sx, nm in ((-1, "brow.R"), (1, "brow.L")):
146:        bh = HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z))
```
</details>

**`Bash`** — Add eyebrow animation and pose-preview helper
```bash
python3 - <<'PYEOF'
p='blender/build_character.py'; s=open(p).read()

s = s.replace('''            "arm.R": ((0.030 * amp, 0, 0), None),
            "arm.L": ((-0.045 * amp, 0, 0.02 * amp), None),
        })''',
'''            "arm.R": ((0.030 * amp, 0, 0), None),
            "arm.L": ((-0.045 * amp, 0, 0.02 * amp), None),
            # brow bones point +Z, so local Y raises and local Z tilts the brow
            "brow.L": ((0, 0, -0.07 * amp), (0, 0.008 * amp, 0)),
            "brow.R": ((0, 0,  0.07 * amp), (0, 0.008 * amp, 0)),
        })''', 1)

s = s.replace('''            "arm.R": ((-0.10 * p, 0, 0), None),   # braced: torch must stay up
            "arm.L": ((0.42 * p, 0, 0), None),
        })''',
'''            "arm.R": ((-0.10 * p, 0, 0), None),   # braced: torch must stay up
            "arm.L": ((0.42 * p, 0, 0), None),
            # set determined (inner ends down), bobbing with the stride and
            # cocking slightly out of sync so he does not read as a puppet
            "brow.L": ((0, 0,  0.15 + 0.07 * p), (0, 0.011 * bob + 0.005 * p, 0)),
            "brow.R": ((0, 0, -0.15 + 0.07 * p), (0, 0.011 * bob - 0.005 * p, 0)),
        })''', 1)

s = s.replace('''            "leg.R": ((0.22 * t, 0, 0), None),
            "leg.L": ((0.22 * t, 0, 0), None),
        })''',
'''            "leg.R": ((0.22 * t, 0, 0), None),
            "leg.L": ((0.22 * t, 0, 0), None),
            "brow.L": ((0, 0,  0.34 * t), (0, -0.012 * t, 0)),   # furrowed
            "brow.R": ((0, 0, -0.34 * t), (0, -0.012 * t, 0)),
        })''', 1)
open(p,'w').write(s); print('brow animation added')
PYEOF
python3 - <<'PYEOF'
# render a neutral + a mid-walk pose so the brow tilt sign can be checked visually
open('blender/preview_pose.py','w').write('''"""Render the rig at a given frame of a given action - used to check that
bone rotations move the way the animation intends (brow tilt sign, etc)."""
import bpy, os
rig = bpy.data.objects["TorchBoyRig"]
act_name = globals().get("POSE_ACTION", "Walk")
frame = globals().get("POSE_FRAME", 7)
ad = rig.animation_data
act = bpy.data.actions[act_name]
ad.action = act
if hasattr(ad, "action_slot") and len(act.slots):
    ad.action_slot = a
… [truncated]
```
<details><summary>result</summary>

```
brow animation added
ok
```
</details>

**`blender/execute_blender_code`**
```python

import traceback
base = "~/proj/me/learn/blender-mcp/cavern-game/blender/"
out = {}
def run(p, extra=None):
    g = {"__file__": p, "__name__": "__main__"}
    if extra: g.update(extra)
    exec(compile(open(p).read(), p, "exec"), g)
    return g.get("result")
try:
    out["build"] = run(base+"build_character.py")
    # front-on close-up of the face at a walk pose, to judge brows/eyes/mohawk
    run(base+"preview_pose.py", {"POSE_ACTION": "Walk", "POSE_FRAME": 7})
    out["face"] = run(base+"preview.py", {
        "PREVIEW_COL": "TorchBoy", "PREVIEW_OUT": "/tmp/tb_face.png",
        "PREVIEW_ORTHO": 1.15, "PREVIEW_CAMLOC": (0.9, -2.6, 1.55),
        "PREVIEW_AIM": (0, 0, 1.02), "PREVIEW_RES": (620, 620)})
    out["full"] = run(base+"preview.py", {
        "PREVIEW_COL": "TorchBoy", "PREVIEW_OUT": "/tmp/tb_full.png",
        "PREVIEW_ORTHO": 2.2, "PREVIEW_CAMLOC": (2.4, -3.0, 2.2),
        "PREVIEW_AIM": (0, 0, 0.78)})
except Exception:
    out["error"] = traceback.format_exc()[-1800:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"build":{"verts":1792,"tris":3468,"bones":["root","hips","spine","head","brow.R","brow.L","arm.R","torch","flame","arm.L","leg.R","leg.L"],"actions":["Idle","Refuel","Walk"],"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb","bytes":238672},"face":{"rendered":"/tmp/tb_face.png"},"full":{"rendered":"/tmp/tb_full.png"}},"stdout":"08:44:38 | INFO: Starting glTF 2.0 export\n08:44:38 | INFO: Extracting primitive: TorchBoyMesh\n08:44:38 | INFO: Primitives created: 9\n08:44:38 | INFO: Finished glTF 2.0 export in 0.14249610900878906 s\n\n","stderr":"~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:49: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.node_tree.nodes[\"Background\"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)\n~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:49: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.node_tree.nodes[\"Background\"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)\n"}
```
</details>

**`Read`**

Mohawk reads clearly, eyes are smaller, and the brows are tilted inner-down — confirming the determined "walk" set works. Checking the full body:

**`Read`**

He's got real personality. Now the cavern:

**`blender/execute_blender_code`**
```python

import traceback
p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_cavern.py"
try:
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    result = g.get("result")
except Exception:
    result = {"error": traceback.format_exc()[-2500:]}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"levels":[{"level":0,"name":"The Threshold","floors":586,"walls":493,"secrets":2,"spikes":25,"crystals":10,"tris":3346},{"level":1,"name":"The Weeping Gallery","floors":621,"walls":406,"secrets":3,"spikes":29,"crystals":12,"tris":3228},{"level":2,"name":"The Deep Hollow","floors":480,"walls":404,"secrets":3,"spikes":23,"crystals":14,"tris":2882}],"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/cavern.glb","kb":828},"stdout":"08:44:57 | INFO: Starting glTF 2.0 export\n08:44:57 | INFO: Extracting primitive: L0_crystal\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L0_deco\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L0_floor\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L0_rock\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L0_secret_10_5\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L0_secret_34_5\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L1_crystal\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L1_deco\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L1_floor\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L1_rock\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L1_secret_4_7\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L1_secret_30_9\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L1_secret_30_24\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L2_crystal\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L2_deco\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L2_floor\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L2_rock\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L2_secret_8_9\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L2_secret_27_8\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Extracting primitive: L2_secret_29_11\n08:44:57 | INFO: Primitives created: 1\n08:44:57 | INFO: Finished glTF 2.0 export in 0.02052927017211914 s\n\n"}
```
</details>

~9.5k tris for all three levels, secret walls exported as individually-named objects. Let me look at the cavern:

**`blender/execute_blender_code`**
```python

import traceback
base = "~/proj/me/learn/blender-mcp/cavern-game/blender/"
def run(p, extra=None):
    g = {"__file__": p, "__name__": "__main__"}
    if extra: g.update(extra)
    exec(compile(open(p).read(), p, "exec"), g)
    return g.get("result")
out = {}
try:
    out["over"] = run(base+"preview.py", {
        "PREVIEW_COL": "Cavern", "PREVIEW_OUT": "/tmp/cav_over.png",
        "PREVIEW_ORTHO": 92, "PREVIEW_CAMLOC": (55, -66, 58),
        "PREVIEW_AIM": (0, 0, -9), "PREVIEW_RES": (900, 700)})
    out["close"] = run(base+"preview.py", {
        "PREVIEW_COL": "Cavern", "PREVIEW_OUT": "/tmp/cav_close.png",
        "PREVIEW_ORTHO": 26, "PREVIEW_CAMLOC": (14, -18, 16),
        "PREVIEW_AIM": (-6, 6, 0), "PREVIEW_RES": (900, 700)})
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"over":{"rendered":"/tmp/cav_over.png"},"close":{"rendered":"/tmp/cav_close.png"}},"stderr":"~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:49: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.node_tree.nodes[\"Background\"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)\n~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:49: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.node_tree.nodes[\"Background\"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)\n"}
```
</details>

**`Read`**

Cavern geometry works — jagged rock, glowing crystals, undulating floor. Now the props, then the browser game:

**`Bash`** — Write props build script
```bash
cat > blender/build_props.py <<'PYEOF'
"""Pickups and markers, exported as props.glb.

These are separate from cavern.glb because the game CLONES them per grid tile
and animates them (bobbing, spinning, consuming). Baking them into the level
mesh would make them static and unpickable.

Root object names are the contract with src/game/Props.js:
    Prop_Fuel  Prop_Treasure  Prop_StairsDown  Prop_StairsUp  Prop_Exit
"""
import bpy, bmesh, os, sys, math
from mathutils import Vector, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_build as L
import importlib; importlib.reload(L)

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def emit(bm, name, col, mats, mapping):
    """mapping: list of (verts, material-name)."""
    order, face_mat = [], {}
    bm.faces.ensure_lookup_table()
    for verts, mname in mapping:
        if mname not in order:
            order.append(mname)
        for v in verts:
            if not v.is_valid:
                continue
            for f in v.link_faces:
                face_mat[f.index] = order.index(mname)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in order:
        me.materials.append(mats[m])
    for f in me.polygons:
        f.material_index = face_mat.get(f.index, 0)
        f.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def build():
    col = L.purge("Props")
    M = {
        "glass":  L.material("pr_glass", (0.30, 0.22, 0.12), 0.25),
        "oil":    L.material("pr_oil", (1.0, 0.52, 0.12), 0.30,
                             emission=(1.0, 0.46, 0.10), emission_strength=4.0),
        "cork":   L.material("pr_cork", (0.32, 0.22, 0.13), 0.95),
        "iron":   L.material("pr_iron", (0.16, 0.15, 0.16), 0.55, metallic=0.85),
        "wood":   L.material("pr_wood", (0.22, 0.14, 0.09), 0.92),
        "gold":   L.material("pr_gold", (1.0, 0.78, 0.30), 0.30, metallic=0.9,
                             emission=(1.0, 0.72, 0.24), emission_strength=2.2),
        "stone":  L.material("pr_stone", (0.115, 0.108, 0.120), 
… [truncated]
```
<details><summary>result</summary>

```
written
```
</details>

**`blender/execute_blender_code`**
```python

import traceback
base = "~/proj/me/learn/blender-mcp/cavern-game/blender/"
def run(p, extra=None):
    g = {"__file__": p, "__name__": "__main__"}
    if extra: g.update(extra)
    exec(compile(open(p).read(), p, "exec"), g)
    return g.get("result")
out = {}
try:
    out["build"] = run(base+"build_props.py")
    # lay them out in a row for a contact sheet
    import bpy
    for i, n in enumerate(["Prop_Fuel","Prop_Treasure","Prop_StairsDown","Prop_StairsUp","Prop_Exit"]):
        bpy.data.objects[n].location = (i*2.2 - 4.4, 0, 0)
    out["sheet"] = run(base+"preview.py", {
        "PREVIEW_COL": "Props", "PREVIEW_OUT": "/tmp/props.png",
        "PREVIEW_ORTHO": 12, "PREVIEW_CAMLOC": (6, -10, 7),
        "PREVIEW_AIM": (0, 0, 0.9), "PREVIEW_RES": (1000, 460)})
    for n in ["Prop_Fuel","Prop_Treasure","Prop_StairsDown","Prop_StairsUp","Prop_Exit"]:
        bpy.data.objects[n].location = (0, 0, 0)
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"build":{"props":["Prop_Fuel","Prop_Treasure","Prop_StairsDown","Prop_StairsUp","Prop_Exit"],"tris":{"Prop_Fuel":192,"Prop_Treasure":490,"Prop_StairsDown":784,"Prop_StairsUp":490,"Prop_Exit":392},"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/props.glb","kb":247},"sheet":{"rendered":"/tmp/props.png"}},"stdout":"08:46:23 | INFO: Starting glTF 2.0 export\n08:46:23 | INFO: Extracting primitive: Prop_Exit\n08:46:23 | INFO: Primitives created: 2\n08:46:23 | INFO: Extracting primitive: Prop_Fuel\n08:46:23 | INFO: Primitives created: 3\n08:46:23 | INFO: Extracting primitive: Prop_StairsDown\n08:46:23 | INFO: Primitives created: 1\n08:46:23 | INFO: Extracting primitive: Prop_StairsUp\n08:46:23 | INFO: Primitives created: 1\n08:46:23 | INFO: Extracting primitive: Prop_Treasure\n08:46:23 | INFO: Primitives created: 3\n08:46:23 | INFO: Finished glTF 2.0 export in 0.01154780387878418 s\n\n","stderr":"~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:49: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.node_tree.nodes[\"Background\"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)\n"}
```
</details>

**`Read`**

The flask's glowing oil is sealed inside an opaque glass shell — invisible, which is fatal for a pickup you must find in the dark. Making the body itself the glowing element:

**`Bash`** — Make fuel flask glow visibly
```bash
python3 - <<'PYEOF'
p='blender/build_props.py'; s=open(p).read()
s = s.replace('''    m.append((L.bm_sphere(bm, 0.17, (0, 0, 0.17), subdiv=2, scale=(1, 1, 0.95)), "glass"))
    m.append((L.bm_cyl(bm, 0.062, 0.16, (0, 0, 0.34), segments=8), "glass"))
    m.append((L.bm_cyl(bm, 0.070, 0.06, (0, 0, 0.43), segments=8), "cork"))
    m.append((L.bm_sphere(bm, 0.115, (0, 0, 0.15), subdiv=2), "oil"))   # glowing contents
    m.append((L.bm_cyl(bm, 0.185, 0.035, (0, 0, 0.055), segments=10), "iron"))''',
'''    # the BODY is the glowing oil - a pickup sealed inside an opaque shell is
    # invisible in a dark cave, which defeats the point of hiding it
    m.append((L.bm_sphere(bm, 0.17, (0, 0, 0.17), subdiv=2, scale=(1, 1, 0.95)), "oil"))
    m.append((L.bm_cyl(bm, 0.062, 0.16, (0, 0, 0.34), segments=8), "glass"))
    m.append((L.bm_cyl(bm, 0.070, 0.06, (0, 0, 0.43), segments=8), "cork"))
    for a in (0.0, math.pi / 2):                       # iron straps over the glass
        m.append((L.bm_rbox(bm, (0.40, 0.035, 0.055), (0, 0, 0.17),
                            bevel=0.012, rot=(0, 0, a)), "iron"))
    m.append((L.bm_cyl(bm, 0.185, 0.035, (0, 0, 0.055), segments=10), "iron"))''', 1)
open(p,'w').write(s); print('flask fixed')
PYEOF
grep -n "bevel=0.012, rot" blender/build_props.py
```
<details><summary>result</summary>

```
flask fixed
73:                            bevel=0.012, rot=(0, 0, a)), "iron"))
```
</details>

**`blender/execute_blender_code`**
```python

import traceback
p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_props.py"
try:
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    result = g.get("result")
except Exception:
    result = {"error": traceback.format_exc()[-1200:]}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"props":["Prop_Fuel","Prop_Treasure","Prop_StairsDown","Prop_StairsUp","Prop_Exit"],"tris":{"Prop_Fuel":308,"Prop_Treasure":490,"Prop_StairsDown":784,"Prop_StairsUp":490,"Prop_Exit":392},"glb":"~/proj/me/learn/blender-mcp/cavern-game/public/models/props.glb","kb":262},"stdout":"08:46:48 | INFO: Starting glTF 2.0 export\n08:46:48 | INFO: Extracting primitive: Prop_Exit\n08:46:48 | INFO: Primitives created: 2\n08:46:48 | INFO: Extracting primitive: Prop_Fuel\n08:46:48 | INFO: Primitives created: 4\n08:46:48 | INFO: Extracting primitive: Prop_StairsDown\n08:46:48 | INFO: Primitives created: 1\n08:46:48 | INFO: Extracting primitive: Prop_StairsUp\n08:46:48 | INFO: Primitives created: 1\n08:46:48 | INFO: Extracting primitive: Prop_Treasure\n08:46:48 | INFO: Primitives created: 3\n08:46:48 | INFO: Finished glTF 2.0 export in 0.01874685287475586 s\n\n"}
```
</details>

All assets built. Installing deps and writing the browser game:

**`Bash`** — Install three.js and vite
```bash
npm install --silent 2>&1 | tail -3; echo "---"; ls node_modules/three/package.json && node -e "console.log('three', require('./node_modules/three/package.json').version)"
```
<details><summary>result</summary>

```
(node:40916) ExperimentalWarning: Support for loading ES Module in require() is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
---
node_modules/three/package.json
three 0.180.0
```
</details>

**`Bash`** — Write Grid and verify tile/world mapping
```bash
cat > src/game/Grid.js <<'EOF'
/**
 * The level grid: collision, tile queries, and floor height.
 *
 * This reads the SAME data/levels.json that blender/build_cavern.py used to
 * generate the meshes, so collision can never disagree with what is drawn.
 * The hash and floor_z functions below are deliberate ports of the Python
 * ones - the player must stand on the exact surface Blender built.
 */

export const SOLID_CHARS = new Set(['#', ' ']);
export const SECRET = 'S';

export class Grid {
  constructor(doc) {
    this.doc = doc;
    this.tileSize = doc.tileSize;
    this.drop = doc.levelDrop;
    this.W = doc.width;
    this.H = doc.height;
    this.levels = doc.levels.map((lv) => ({ ...lv, rows: lv.grid }));
  }

  char(level, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return '#';
    return this.levels[level].rows[ty][tx];
  }

  /** Secret walls are solid until revealed - that is the whole mechanic. */
  isSolid(level, tx, ty, revealed) {
    const c = this.char(level, tx, ty);
    if (c === SECRET) return !(revealed && revealed.has(`${level}:${tx},${ty}`));
    return SOLID_CHARS.has(c);
  }

  find(level, ch) {
    const out = [];
    const rows = this.levels[level].rows;
    for (let ty = 0; ty < this.H; ty++)
      for (let tx = 0; tx < this.W; tx++)
        if (rows[ty][tx] === ch) out.push({ tx, ty });
    return out;
  }

  // ------------------------------------------------------------ transforms
  tileToWorld(level, tx, ty) {
    return {
      x: (tx - this.W / 2 + 0.5) * this.tileSize,
      z: (ty - this.H / 2 + 0.5) * this.tileSize,
      y: -level * this.drop,
    };
  }

  worldToTile(x, z) {
    return {
      tx: Math.floor(x / this.tileSize + this.W / 2),
      ty: Math.floor(z / this.tileSize + this.H / 2),
    };
  }

… [truncated]
```
<details><summary>result</summary>

```
file://~/proj/me/learn/blender-mcp/cavern-game/[eval1]:3
const doc=JSON.parse(require('fs').readFileSync('data/levels.json','utf8'));
               ^

ReferenceError: require is not defined in ES module scope, you can use import instead
    at file://~/proj/me/learn/blender-mcp/cavern-game/[eval1]:3:16

Node.js v23.0.0
```
</details>

**`Bash`** — Test Grid mapping and hash
```bash
cat > /tmp/gridtest.mjs <<'EOF'
import { readFileSync } from 'node:fs';
import { Grid } from './src/game/Grid.js';
const doc = JSON.parse(readFileSync('data/levels.json', 'utf8'));
const g = new Grid(doc);
const p = g.find(0, 'P')[0];
const w = g.tileToWorld(0, p.tx, p.ty);
console.log('spawn tile', p, '-> world x=' + w.x + ' z=' + w.z + ' y=' + w.y);
console.log('roundtrip  ', g.worldToTile(w.x, w.z));
console.log('floorH     ', g.floorHeight(0, w.x, w.z).toFixed(6));
console.log('L1 y       ', g.levelY(1));
// hash samples for cross-checking against Blender's Python
const samples = [[0,0,11],[7,3,11],[19,25,29],[40,32,29],[3,17,77]];
console.log('JS hashes  ', samples.map(([x,y,s]) => Grid.hsh(x,y,s).toFixed(9)).join(' '));
console.log('JS cornerZ ', [[0,0],[7,3],[19,25]].map(([a,b])=>Grid.cornerZ(a,b).toFixed(9)).join(' '));
EOF
node /tmp/gridtest.mjs
```
<details><summary>result</summary>

```
Exit code 1
node:internal/modules/run_main:122
    triggerUncaughtException(
    ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/private/tmp/src/game/Grid.js' imported from /private/tmp/gridtest.mjs
Did you mean to import "../..~/proj/me/learn/blender-mcp/cavern-game/src/game/Grid.js"?
    at finalizeResolution (node:internal/modules/esm/resolve:257:11)
    at moduleResolve (node:internal/modules/esm/resolve:913:10)
    at defaultResolve (node:internal/modules/esm/resolve:1037:11)
    at ModuleLoader.defaultResolve (node:internal/modules/esm/loader:650:12)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:599:25)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:582:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:241:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:132:49) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///private/tmp/src/game/Grid.js'
}

Node.js v23.0.0
```
</details>

**`Bash`** — Run grid test with absolute path
```bash
mkdir -p <scratch>
SP=<scratch>
sed 's#./src/game/Grid.js#~/proj/me/learn/blender-mcp/cavern-game/src/game/Grid.js#' /tmp/gridtest.mjs > $SP/gridtest.mjs
node $SP/gridtest.mjs
```
<details><summary>result</summary>

```
spawn tile { tx: 17, ty: 25 } -> world x=-5 z=19 y=0
roundtrip   { tx: 17, ty: 25 }
floorH      0.028560
L1 y        -9
JS hashes   0.494336949 0.345767853 0.025260201 0.364893231 0.021895753
JS cornerZ  0.053867390 -0.008341130 0.033695633
```
</details>

Verifying the JS hash port produces bit-identical values to the Python one — if it drifts, the player floats above or sinks into the floor:

**`blender/execute_blender_code`**
```python

import math
def hsh(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2654435761) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF
def floor_z(cx, cy):
    return (hsh(cx, cy, 11) - 0.5) * 0.20 + math.sin(cx * 0.45) * 0.055 + math.cos(cy * 0.38) * 0.055
result = {
    "hashes": [round(hsh(*s), 9) for s in [(0,0,11),(7,3,11),(19,25,29),(40,32,29),(3,17,77)]],
    "cornerZ": [round(floor_z(a,b), 9) for a,b in [(0,0),(7,3),(19,25)]],
}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"hashes":[0.494336949,0.345767853,0.025260201,0.364893231,0.021895753],"cornerZ":[0.05386739,-0.00834113,0.033695633]}}
```
</details>

Bit-identical — the player will stand exactly on the Blender-generated surface. Now the game modules:

**`Bash`** — Write Input and IsoCamera
```bash
node -e "const p=require('./node_modules/three/package.json'); console.log(Object.keys(p.exports))" 2>/dev/null | head -5
cat > src/game/Input.js <<'EOF'
/** Keyboard + on-screen thumbstick, normalised to a single {x, y} vector. */
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.pad = { x: 0, y: 0, active: false };
    this.onAction = () => {};

    addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyE') this.onAction();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // touch: drag anywhere to steer
    let origin = null;
    const start = (e) => {
      const t = e.touches ? e.touches[0] : e;
      origin = { x: t.clientX, y: t.clientY };
      this.pad.active = true;
    };
    const move = (e) => {
      if (!origin) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(len, 60) / 60 / len;
      this.pad.x = dx * k; this.pad.y = dy * k;
      e.preventDefault();
    };
    const end = () => { origin = null; this.pad.x = this.pad.y = 0; this.pad.active = false; };
    dom.addEventListener('touchstart', start, { passive: true });
    dom.addEventListener('touchmove', move, { passive: false });
    dom.addEventListener('touchend', end);
  }

  /** @returns {{x:number, y:number}} y is "up the screen" */
  axis() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.pad.active) { x += this.pad.x; y -= this.pad.y; }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
}
EOF
cat > src/game/IsoCamera.js <<'EOF'
import * as THREE from 'three';

/**
 * Orthographic isometric camera with damped follow.

… [truncated]
```
<details><summary>result</summary>

```
[
  '.',
  './examples/fonts/*',
  './examples/jsm/*',
  './addons',
written
```
</details>

**`Bash`** — Write Torch module
```bash
cat > src/game/Torch.js <<'EOF'
import * as THREE from 'three';

/**
 * The torch: the player's only light, and a resource that runs out.
 *
 * Fuel drives light range AND the radius at which secret passages reveal
 * themselves, so keeping the torch fed is what makes exploring possible.
 * The light is parented to the `flame` bone exported from Blender, so it
 * tracks the animation without any per-frame bookkeeping here.
 */
export const FUEL_MAX = 100;

export class Torch {
  constructor(scene) {
    this.fuel = FUEL_MAX;
    this.burnRate = 1.45;              // units/sec -> ~69s on a full torch
    this.out = false;
    this.darkSeconds = 0;

    this.light = new THREE.PointLight(0xffb066, 0, 26, 1.55);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.006;
    this.light.shadow.camera.near = 0.15;
    this.light.shadow.camera.far = 24;

    // a soft additive halo so the flame itself reads as a source, not a dot
    const tex = Torch.glowTexture();
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xffb266, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    }));
    this.halo.scale.setScalar(1.5);

    this.anchor = null;
    this._t = 0;
    this._flick = 1;
    scene.add(this.light, this.halo);
  }

  /** Attach to the `flame` bone of the loaded character. */
  attachTo(node) { this.anchor = node; }

  get fraction() { return Math.max(0, this.fuel) / FUEL_MAX; }

  /** Secrets reveal further out with a brighter torch - fuel buys vision. */
  get revealRadius() { return this.out ? 1.5 : 2.3 + this.fraction * 2.3; }

  refuel(amount) {
    this.fuel = Math.min(FUEL_MAX, this.fuel + amount);
    this.out = false;
    this.darkSeconds = 0;
  }

  update(dt) {
    this.fuel -= this.burnRate * dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.out = true;
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

**`Bash`** — Write Cutaway and Cavern modules
```bash
cat > src/game/Cutaway.js <<'EOF'
import * as THREE from 'three';

/**
 * Dissolves rock that sits between the camera and the player.
 *
 * An isometric camera with 3-unit walls hides the character constantly - he
 * walks behind a wall and simply vanishes. Rather than shorten the walls (which
 * would ruin the cavern silhouette) we punch a soft hole through anything
 * nearer the camera than the player and close to him on screen.
 *
 * The hole is DITHERED rather than alpha-blended: a screen-door discard needs
 * no transparency sorting, so it cannot produce the depth artefacts that
 * blending a big merged rock mesh against itself would.
 */
const uniforms = {
  uFocusView: { value: new THREE.Vector3(0, 0, -1) },
  uCutRadius: { value: 3.1 },
  uCutStrength: { value: 1.0 },
};

export function cutawayUniforms() { return uniforms; }

export function applyCutaway(material) {
  if (material.userData.__cutaway) return material;
  material.userData.__cutaway = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFocusView = uniforms.uFocusView;
    shader.uniforms.uCutRadius = uniforms.uCutRadius;
    shader.uniforms.uCutStrength = uniforms.uCutStrength;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutView;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\n  vCutView = mvPosition.xyz;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCutView;
uniform vec3 uFocusView;
uniform float uCutRadius;
uniform float uCutStrength;
// 4x4 ordered dither - stable under camera motion, unlike hashed noise
float cutBayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
  m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
  m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  // view space
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

**`Bash`** — Write Player and Props modules
```bash
cat > src/game/Player.js <<'EOF'
import * as THREE from 'three';

/**
 * The boy. Movement + collision against the grid, and an animation state
 * machine over the three clips exported from Blender.
 *
 * The model faces -Y in Blender, which the glTF Y-up conversion turns into
 * +Z, so atan2(dx, dz) aims him correctly with no correction offset.
 */
const SPEED = 4.2;
const RADIUS = 0.42;

export class Player {
  constructor(gltf, grid) {
    this.grid = grid;
    this.root = gltf.scene;
    this.root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      if (o.isSkinnedMesh) o.frustumCulled = false;   // skinned bounds go stale
    });

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      this.actions[clip.name] = a;
    }
    this.actions.Refuel?.setLoop(THREE.LoopOnce, 1);
    if (this.actions.Refuel) this.actions.Refuel.clampWhenFinished = true;

    this.state = null;
    this.play('Idle', 0);
    this.mixer.addEventListener('finished', () => { this.busy = false; });

    this.flame = this.root.getObjectByName('flame');
    this.level = 0;
    this.busy = false;
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.moving = false;
  }

  play(name, fade = 0.22) {
    const next = this.actions[name];
    if (!next || this.state === name) return;
    const prev = this.actions[this.state];
    next.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.state = name;
  }

  playOnce(name) {
    const a = this.actions[name];
    if (!a) return;
    this.busy = true;
    a.reset().setEffectiveWeight(1).play();
    const prev = this.actions[this.state];
    if (prev && prev !== a) prev.crossFadeTo(a, 0.15, false);
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

One gap in the "multi-level" read: the floor is solid at the stairs, so you can never see the level below. Let me cut an actual shaft — the stairs descend through a hole, and `>` becomes a pit you step up to rather than walk onto.

**`Bash`** — Cut stair shafts through the floor
```bash
python3 - <<'PYEOF'
p='blender/build_cavern.py'; s=open(p).read()
s = s.replace('''        floors = [(x, y) for y in range(g.h) for x in range(g.w) if g.walkable(x, y)]''',
'''        floors = [(x, y) for y in range(g.h) for x in range(g.w) if g.walkable(x, y)]
        # the stairs-down tile is left UNFLOORED: the hole is what lets you see
        # the level below, which is the whole point of stacking them. The game
        # treats '>' as solid, so the player steps up to the shaft, not into it.
        slab = [t for t in floors if g.at(*t) != '>']''',1)
s = s.replace("        build_slab(bm, floors, floor_z, -FLOOR_D)",
              "        build_slab(bm, slab, floor_z, -FLOOR_D)",1)
open(p,'w').write(s); print('cavern: stair shaft')

p='src/game/Grid.js'; s=open(p).read()
s = s.replace("export const SOLID_CHARS = new Set(['#', ' ']);",
"""// '>' is the stair shaft - an unfloored hole. Solid so the player steps up to
// it rather than walking out over nothing; descent triggers on proximity.
export const SOLID_CHARS = new Set(['#', ' ', '>']);""",1)
open(p,'w').write(s); print('grid: > solid')
PYEOF
grep -n "slab" blender/build_cavern.py | head
```
<details><summary>result</summary>

```
cavern: stair shaft
grid: > solid
35:FLOOR_D = 0.75                  # floor slab thickness
94:def build_slab(bm, tiles, top_fn, bottom_z, inset=0.0):
206:        slab = [t for t in floors if g.at(*t) != '>']
218:        build_slab(bm, slab, floor_z, -FLOOR_D)
222:        build_slab(bm, walls, wall_z, -FLOOR_D, inset=0.30)
229:            build_slab(bm, [(x, y)], wall_z, -FLOOR_D, inset=0.30)
```
</details>

**`Bash`** — Write HUD module
```bash
cat > src/game/HUD.js <<'EOF'
/** DOM overlay: fuel, level name, discoveries, toasts, and the fade. */
export class HUD {
  constructor() {
    this.el = {
      fuel: document.getElementById('fuel-fill'),
      fuelWrap: document.getElementById('fuel'),
      level: document.getElementById('level-name'),
      found: document.getElementById('found'),
      toast: document.getElementById('toast'),
      fade: document.getElementById('fade'),
      hint: document.getElementById('hint'),
      loading: document.getElementById('loading'),
    };
    this._toastT = 0;
  }

  setLevel(name, index, total) {
    this.el.level.textContent = `${index + 1}/${total} · ${name}`;
  }

  setFound(found, total) {
    this.el.found.textContent = `${found}/${total}`;
  }

  setFuel(frac, out) {
    this.el.fuel.style.width = `${Math.max(0, frac) * 100}%`;
    this.el.fuelWrap.classList.toggle('low', frac < 0.2 && !out);
    this.el.fuelWrap.classList.toggle('out', out);
  }

  toast(msg, seconds = 2.6) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this._toastT = seconds;
  }

  hint(msg) {
    this.el.hint.textContent = msg || '';
    this.el.hint.classList.toggle('show', !!msg);
  }

  fade(alpha) { this.el.fade.style.opacity = alpha; }

  ready() { this.el.loading.classList.add('gone'); }

  progress(p, label) {
    const bar = this.el.loading.querySelector('.bar span');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const t = this.el.loading.querySelector('.what');
    if (t && label) t.textContent = label;
  }

  update(dt) {
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.el.toast.classList.remove('show');
    }
  }
}
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

**`Bash`** — Write main.js game bootstrap and loop
```bash
cat > src/main.js <<'EOF'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Grid } from './game/Grid.js';
import { Cavern } from './game/Cavern.js';
import { Player } from './game/Player.js';
import { Props } from './game/Props.js';
import { Torch, FUEL_MAX } from './game/Torch.js';
import { IsoCamera } from './game/IsoCamera.js';
import { Input } from './game/Input.js';
import { HUD } from './game/HUD.js';
import { updateCutaway, cutawayUniforms } from './game/Cutaway.js';

const FUEL_PER_FLASK = 42;
const DARK_GRACE = 12;         // seconds you can stumble before the cave takes you

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const hud = new HUD();
const input = new Input(canvas);
const cam = new IsoCamera(innerWidth / innerHeight, { viewSize: 21 });
const clock = new THREE.Clock();

// a barely-there cool ambient: enough to read silhouettes, not enough to explore by
const ambient = new THREE.HemisphereLight(0x2b3a54, 0x0a0a10, 0.32);
scene.add(ambient);

const game = {
  level: 0, found: 0, totalSecrets: 0, treasures: 0,
  stairLock: false, transition: 0, won: false, dead: false, t: 0,
};

// ------------------------------------------------------------------ loading
const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

async function boot() {
  hud.progress(0.05, 'reading the map');
  const doc = await fetch('data/levels.json').then((r) => r.json());
  const grid = new Grid(doc);

  hud.progress(0.25, 'carving the cavern');
  const cavGltf = await load('models/cavern.glb');
  hud.progress(0.6, 'lighting the torch');
  const boyGltf = await load('models/torchboy.glb');
  hud.prog
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

**`Bash`** — Move level data under public/ for serving
```bash
mkdir -p public/data && git init -q 2>/dev/null; \
sed -i '' "s#'data/levels.json'#'public/data/levels.json'#" tools/gen_levels.mjs tools/validate_levels.mjs && \
sed -i '' 's#os.path.join(ROOT, "data", "levels.json")#os.path.join(ROOT, "public", "data", "levels.json")#' blender/build_cavern.py && \
node tools/gen_levels.mjs && node tools/validate_levels.mjs && rmdir data 2>/dev/null; ls public/data
```
<details><summary>result</summary>

```
L0 The Threshold          floor=560 secrets=2 rooms=[13,13] fuel=4 span=64
L1 The Weeping Gallery    floor=565 secrets=3 rooms=[29,14,13] fuel=4 span=37
L2 The Deep Hollow        floor=417 secrets=3 rooms=[35,15,13] fuel=5 span=32

wrote data/levels.json  (40x32, 3 levels)

L0 The Threshold
  floor=568 secrets=2 gated rewards=2/6 fuel=5 crystals=10

L1 The Weeping Gallery
  floor=600 secrets=3 gated rewards=3/7 fuel=6 crystals=12

L2 The Deep Hollow
  floor=456 secrets=3 gated rewards=3/8 fuel=7 crystals=14

all invariants hold
levels.json
```
</details>

**`Bash`** — Write index.html and build
```bash
cat > index.html <<'EOF'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Torchboy — The Deep Hollow</title>
<style>
  :root {
    --ink: #e8e2d6;
    --dim: #8a8578;
    --flame: #ff9a3c;
    --cold: #7fd4ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #06070a; }
  body {
    font: 500 14px/1.4 ui-rounded, "Avenir Next", "Segoe UI", system-ui, sans-serif;
    color: var(--ink); -webkit-font-smoothing: antialiased;
    user-select: none; -webkit-user-select: none; touch-action: none;
  }
  #view { display: block; width: 100%; height: 100%; }

  /* ---------------------------------------------------------------- HUD */
  #hud { position: fixed; inset: 0; pointer-events: none; }
  .panel {
    position: absolute; top: max(14px, env(safe-area-inset-top));
    left: 14px; display: flex; flex-direction: column; gap: 8px;
  }
  #level-name {
    font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
    color: var(--dim); text-shadow: 0 1px 3px #000;
  }
  #fuel {
    width: 210px; height: 9px; border-radius: 99px;
    background: #16130f; border: 1px solid #2a241c;
    box-shadow: inset 0 1px 2px #0009; overflow: hidden;
  }
  #fuel-fill {
    height: 100%; width: 100%;
    background: linear-gradient(90deg, #ff6a1a, #ffc25e);
    box-shadow: 0 0 12px #ff8a2acc;
    transition: width .18s linear;
  }
  #fuel.low #fuel-fill { animation: gutter .55s steps(2) infinite; }
  #fuel.out #fuel-fill { background: #3a2c22; box-shadow: none; }
  @keyframes gutter { 50% { opacity: .45; } }
  .row { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dim); }
  .row b { color: var(--cold); font-weight: 600; }

  /* ------------------------------------------------------------- toasts */
  #toast {
    position: absolute; left: 50%; bottom: 16%;
    transform: translate(-50%, 10px);
    padding: 9px 18px; border-radius: 99px;
    background: #0d0f14e0; border: 1px solid #ffffff14;
    backdrop-filter: blur(6px);
    opacity: 0; transition: opacity .3s, transform .3s;
    font-si
… [truncated]
```
<details><summary>result</summary>

```
(node:44547) ExperimentalWarning: Support for loading ES Module in require() is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✗ Build failed in 36ms
error during build:
src/game/Cavern.js (82:47): '**' cannot be applied to unary/await expression.
file: ~/proj/me/learn/blender-mcp/cavern-game/src/game/Cavern.js:82:47

80:       mat.emissiveIntensity = Math.sin(Math.min(1, s.t) * Math.PI) * 1.6;
81:       mat.opacity = 1 - Math.min(1, s.t);
82:       s.mesh.position.y = -Math.min(1, s.t) ** 2 * 1.2;
                                                   ^
83:       if (s.t >= 1) {
84:         s.mesh.visible = false;

    at getRollupError (file://~/proj/me/learn/blender-mcp/cavern-game/node_modules/rollup/dist/es/shared/parseAst.js:317:41)
    at ParseError.initialise (file://~/proj/me/learn/blender-mcp/cavern-game/node_modules/rollup/dist/es/shared/node-entry.js:14648:28)
    at convertNode (file://~/proj/me/learn/blender-mcp/cavern-game/node_modules/rollup/dist/es/shared/node-entry.js:16624:10)
    at convertProgram (file://~/proj/me/learn/blender-mcp/cavern-game/node_modules/rollup/dist/es/shared/node-entry.js:15860:12)
    at Module.setSource (file://~/proj/me/learn/blender-mcp/cavern-game/node_modules/rollup/dist/es/shared/node-entry.js:17603:24)
    at async ModuleLoader.addModuleSource (file://~/proj/me/learn/blender-mcp/cavern-game/node_modules/rollup/dist/es/shared/node-entry.js:21781:13)
```
</details>

**`Bash`** — Fix exponent syntax and rebuild
```bash
sed -i '' 's#s.mesh.position.y = -Math.min(1, s.t) \*\* 2 \* 1.2;#const k = Math.min(1, s.t);\n      s.mesh.position.y = -(k * k) * 1.2;   // sinks as it crumbles#' src/game/Cavern.js && npx vite build --logLevel warn 2>&1 | grep -v Warning | tail -12
```
<details><summary>result</summary>

```
(Use `node --trace-warnings ...` to show where the warning was created)

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
```
</details>

Build passes. Rebuilding the cavern with the stair shafts, then launching:

**`blender/execute_blender_code`**
```python

import traceback
p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_cavern.py"
try:
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    r = g.get("result")
    result = {"levels": [{k: v for k, v in d.items() if k in ("level","floors","walls","secrets","tris")} for d in r["levels"]], "kb": r["kb"]}
except Exception:
    result = {"error": traceback.format_exc()[-1500:]}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"levels":[{"level":0,"floors":586,"walls":493,"secrets":2,"tris":3344},{"level":1,"floors":621,"walls":406,"secrets":3,"tris":3226},{"level":2,"floors":480,"walls":404,"secrets":3,"tris":2882}],"kb":828},"stdout":"08:52:51 | INFO: Starting glTF 2.0 export\n08:52:51 | INFO: Extracting primitive: L0_crystal\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L0_deco\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L0_floor\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L0_rock\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L0_secret_10_5\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L0_secret_34_5\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L1_crystal\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L1_deco\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L1_floor\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L1_rock\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L1_secret_4_7\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L1_secret_30_9\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L1_secret_30_24\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L2_crystal\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L2_deco\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L2_floor\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L2_rock\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L2_secret_8_9\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L2_secret_27_8\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Extracting primitive: L2_secret_29_11\n08:52:51 | INFO: Primitives created: 1\n08:52:51 | INFO: Finished glTF 2.0 export in 0.02490711212158203 s\n\n"}
```
</details>

**`Bash`** — Start vite dev server and check asset routes
```bash
(npx vite --port 5180 --strictPort > /tmp/vite.log 2>&1 &) ; sleep 4; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5180/ ; curl -s -o /dev/null -w "levels.json %{http_code}\n" http://localhost:5180/data/levels.json; curl -s -o /dev/null -w "cavern.glb %{http_code}\n" http://localhost:5180/models/cavern.glb; tail -5 /tmp/vite.log
```
<details><summary>result</summary>

```
200
levels.json 200
cavern.glb 200

  VITE v7.3.6  ready in 75 ms

  ➜  Local:   http://localhost:5180/
  ➜  Network: use --host to expose
```
</details>

Server up, all assets serving. Let me play it:

**`ToolSearch`**
<details><summary>result</summary>

```







```
</details>

**`mcp__claude-in-chrome__tabs_context_mcp`**
<details><summary>result</summary>

```
Browser extension is not connected. Please ensure the Claude browser extension is installed and running (https://claude.ai/chrome), and that you are logged into claude.ai with the same account as Claude Code. If this is your first time connecting to Chrome, you may need to restart Chrome for the installation to take effect. If you continue to experience issues, please report a bug: https://github.com/anthropics/claude-code/issues/new?labels=bug,claude-in-chrome
```
</details>

Chrome extension isn't connected — using Playwright instead:

**`ToolSearch`**
<details><summary>result</summary>

```







```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
- Console: 1 errors, 0 warnings
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T14-53-32-698Z.yml)
```
</details>

**`playwright/browser_console_messages`**
<details><summary>result</summary>

```
### Result
Total messages: 3 (Errors: 1, Warnings: 0)
Returning 1 messages for level "error"

[ERROR] Failed to load resource: the server responded with a status of 404 (Not Found) @ http://localhost:5180/favicon.ico:0
### Events
- New console entries: .playwright-mcp/console-2026-09-06T14-53-31-793Z.log#L1
```
</details>

Only a missing favicon. Let me resize and look:

**`playwright/browser_resize`**
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.setViewportSize({ width: 1200, height: 800 });
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](./boot.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as ./boot.png
await page.screenshot({
  path: './boot.png',
  scale: 'css',
  type: 'png'
});
``​`
```
</details>

**`Read`**
<details><summary>result</summary>

```
File does not exist. Note: your current working directory is ~/proj/me/learn/blender-mcp/cavern-game.
```
</details>

**`Bash`** — Locate playwright screenshot output
```bash
find / -name "boot.png" -newermt "-3 minutes" 2>/dev/null | head -3; ls -la .playwright-mcp/ 2>/dev/null | head
```
<details><summary>result</summary>

```
(Bash completed with no output)
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T14-53-55-428Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T14-53-55-428Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T14-53-55-428Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Two bugs. Let me diagnose before guessing:

**`playwright/browser_evaluate`**
```js
() => {
  const g = window.__game;
  if (!g) return 'no game';
  const names = [];
  g.cavern.root.traverse(o => { if (o.isMesh) names.push(o.name); });
  return {
    secretsFound: g.cavern.secrets.size,
    meshNames: names.slice(0, 12),
    levelNodes: g.cavern.levels.map(n => n && n.name),
    playerPos: g.player.pos.toArray().map(v => +v.toFixed(2)),
    camPos: g.cam.camera.position.toArray().map(v => +v.toFixed(1)),
    camToPlayer: +g.cam.camera.position.distanceTo(g.player.pos).toFixed(1),
    fog: g.scene.fog && { type: g.scene.fog.type, density: g.scene.fog.density },
    torchIntensity: +g.torch.light.intensity.toFixed(2),
    torchDist: +g.torch.light.distance.toFixed(1),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "secretsFound": 8,
  "meshNames": [
    "L0_crystal",
    "L0_deco",
    "L0_floor",
    "L0_rock",
    "L0_secret_10_5",
    "L0_secret_34_5",
    "L1_crystal",
    "L1_deco",
    "L1_floor",
    "L1_rock",
    "L1_secret_4_7",
    "L1_secret_30_9"
  ],
  "levelNodes": [
    "Level_0",
    "Level_1",
    "Level_2"
  ],
  "playerPos": [
    -5,
    0.03,
    19
  ],
  "camPos": [
    28.5,
    36.8,
    52.5
  ],
  "camToPlayer": 60,
  "fog": {
    "density": 0.055
  },
  "torchIntensity": 11.97,
  "torchDist": 13.7
}
### Ran Playwright code
… [truncated]
```
</details>

Found it: `FogExp2` at density 0.055 with the camera 60 units back fogs *everything* to 100% — an orthographic camera sits at a fixed distance, so exponential fog is just a flat tint. Switching to linear fog keyed to the camera distance:

**`Bash`** — Switch to linear fog and fix secret counter
```bash
python3 - <<'PYEOF'
p='src/game/IsoCamera.js'; s=open(p).read()
s = s.replace("    this.distance = 60;                 // ortho: only affects clipping, not scale",
"""    // Ortho scale is set by the frustum, but this distance still decides how
    // far every fragment is from the camera - which is what fog reads. Keep it
    // modest so linear fog has a usable range across the visible depth.
    this.distance = 42;""",1)
s = s.replace("this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);",
              "this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 160);",1)
open(p,'w').write(s); print('camera distance')

p='src/main.js'; s=open(p).read()
s = s.replace("  scene.fog = new THREE.FogExp2(new THREE.Color(lv.ambient), lv.fog);",
"""  // LINEAR fog, not exponential: an ortho camera views the whole scene from a
  // fixed distance, so exponential fog applies one flat tint to everything.
  // Keying near/far to the camera distance turns it back into a depth cue.
  const d = cam.distance;
  const reach = 46 - lv.fog * 380;          // denser levels close in sooner
  scene.fog = new THREE.Fog(new THREE.Color(lv.ambient), d - 16, d + reach);""",1)
s = s.replace("  hud.setLevel(lv.name, i, grid.levels.length);",
              "  hud.setLevel(lv.name, i, grid.levels.length);\n  hud.setFound(game.found, game.totalSecrets);",1)
open(p,'w').write(s); print('fog + hud counter')
PYEOF
grep -n "reach\|setFound" src/main.js | head
```
<details><summary>result</summary>

```
camera distance
fog + hud counter
87:  const reach = 46 - lv.fog * 380;          // denser levels close in sooner
88:  scene.fog = new THREE.Fog(new THREE.Color(lv.ambient), d - 16, d + reach);
91:  hud.setFound(game.found, game.totalSecrets);
113:      hud.setFound(game.found, game.totalSecrets);
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T14-54-49-045Z.yml)
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T14-54-52-986Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T14-54-52-986Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T14-54-52-986Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Real cavern now. Two fixes: the cutaway is being applied to the *floor* too (that big dithered patch), and distant rock silhouettes read more like mountains than a cave — the fog color is too light.

**`Bash`** — Restrict cutaway to walls, darken fog
```bash
python3 - <<'PYEOF'
p='src/game/Cavern.js'; s=open(p).read()
s = s.replace('''      if (Array.isArray(o.material)) o.material.forEach(applyCutaway);
      else applyCutaway(o.material);
      // crystals should glow, not receive the cutaway hole
      if (o.name.includes('crystal')) o.castShadow = false;''',
'''      // Cutaway belongs on WALLS ONLY. Applied to the floor it punches a
      // dithered hole in the ground the player is standing on; applied to
      // crystals it eats the only other light source in the cave.
      if (/_rock$|_secret_/.test(o.name)) {
        if (Array.isArray(o.material)) o.material.forEach(applyCutaway);
        else applyCutaway(o.material);
      }
      if (o.name.includes('crystal')) o.castShadow = false;''',1)
open(p,'w').write(s); print('cutaway: walls only')

p='src/main.js'; s=open(p).read()
s = s.replace("const ambient = new THREE.HemisphereLight(0x2b3a54, 0x0a0a10, 0.32);",
              "const ambient = new THREE.HemisphereLight(0x25334d, 0x07070c, 0.17);",1)
s = s.replace('''  const d = cam.distance;
  const reach = 46 - lv.fog * 380;          // denser levels close in sooner
  scene.fog = new THREE.Fog(new THREE.Color(lv.ambient), d - 16, d + reach);''',
'''  const d = cam.distance;
  const reach = 46 - lv.fog * 380;          // denser levels close in sooner
  // fog toward near-black, not toward the ambient tint: a light fog colour
  // silhouettes every distant wall top and the cave starts reading as a
  // mountain range instead of somewhere underground
  const fogCol = new THREE.Color(lv.ambient).multiplyScalar(0.30);
  scene.fog = new THREE.Fog(fogCol, d - 16, d + reach);''',1)
s = s.replace("  scene.background = new THREE.Color(lv.ambient).multiplyScalar(0.35);",
              "  scene.background = fogCol;",1)
open(p,'w').write(s); print('darker fog + ambient')
PYEOF
grep -n "fogCol\|HemisphereLight" src/main.js
```
<details><summary>result</summary>

```
cutaway: walls only
darker fog + ambient
33:const ambient = new THREE.HemisphereLight(0x25334d, 0x07070c, 0.17);
91:  const fogCol = new THREE.Color(lv.ambient).multiplyScalar(0.30);
92:  scene.fog = new THREE.Fog(fogCol, d - 16, d + reach);
93:  scene.background = fogCol;
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T14-55-30-187Z.yml)
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T14-55-34-467Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T14-55-34-467Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T14-55-34-467Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The cutaway now correctly punches only through the wall. Tightening it (it's cutting a wider cone than needed) and pulling the camera in a little:

**`Bash`** — Tune cutaway radius and camera zoom
```bash
python3 - <<'PYEOF'
p='src/game/Cutaway.js'; s=open(p).read()
s = s.replace("  uCutRadius: { value: 3.1 },", "  uCutRadius: { value: 2.0 },",1)
s = s.replace('''  if (vCutView.z > uFocusView.z) {
    float r = length(vCutView.xy - uFocusView.xy);
    float f = (1.0 - smoothstep(uCutRadius * 0.45, uCutRadius, r)) * uCutStrength;
    if (f > cutBayer(gl_FragCoord.xy)) discard;
  }''',
'''  // the +0.6 bias stops rock level with the player being chewed away when it
  // was never occluding him in the first place
  if (vCutView.z > uFocusView.z + 0.6) {
    float r = length(vCutView.xy - uFocusView.xy);
    float f = (1.0 - smoothstep(uCutRadius * 0.35, uCutRadius, r)) * uCutStrength;
    if (f > cutBayer(gl_FragCoord.xy)) discard;
  }''',1)
open(p,'w').write(s)

s2 = open('src/main.js').read()
s2 = s2.replace("updateCutaway(cam.camera, player.pos);",
                "updateCutaway(cam.camera, player.pos, 0.75);   // aim at his torso, not his feet",1)
s2 = s2.replace("const cam = new IsoCamera(innerWidth / innerHeight, { viewSize: 21 });",
                "const cam = new IsoCamera(innerWidth / innerHeight, { viewSize: 17 });",1)
open('src/main.js','w').write(s2)

s3 = open('src/game/Cutaway.js').read()
s3 = s3.replace('''export function updateCutaway(camera, playerWorldPos) {
  uniforms.uFocusView.value
    .copy(playerWorldPos)
    .applyMatrix4(camera.matrixWorldInverse);
}''',
'''export function updateCutaway(camera, playerWorldPos, yLift = 0) {
  uniforms.uFocusView.value
    .set(playerWorldPos.x, playerWorldPos.y + yLift, playerWorldPos.z)
    .applyMatrix4(camera.matrixWorldInverse);
}''',1)
open('src/game/Cutaway.js','w').write(s3)
print('cutaway tuned')
PYEOF
echo done
```
<details><summary>result</summary>

```
cutaway tuned
done
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T14-56-08-173Z.yml)
```
</details>

Now an automated playtest — collision, secret reveals, and fuel, driven through the real update loop:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};

  // ---- 1. collision: shove him hard into solid rock for 2s, he must stay out
  const grid = g.grid, p = g.player;
  const solidHits = [];
  const key = (code, down) => window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  for (const dir of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    key(dir, true);
    await wait(700);
    key(dir, false);
    const t = grid.worldToTile(p.pos.x, p.pos.z);
    solidHits.push({
      dir, tile: [t.tx, t.ty], ch: grid.char(p.level, t.tx, t.ty),
      insideSolid: grid.isSolid(p.level, t.tx, t.ty, g.cavern.revealed),
    });
  }
  out.collision = solidHits;
  out.movedFromSpawn = +Math.hypot(p.pos.x - (-5), p.pos.z - 19).toFixed(2);

  // ---- 2. secret reveal: stand next to each L0 secret and see if it opens
  const before = g.cavern.revealed.size;
  const reveals = [];
  for (const [k, s] of g.cavern.secrets) {
    if (s.level !== 0) continue;
    // step onto an adjacent floor tile, not into the wall itself
    let spot = null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if (!grid.isSolid(0, s.tx + dx, s.ty + dy, g.cavern.revealed)) { spot = [s.tx + dx, s.ty + dy]; break; }
    }
    if (!spot) { reveals.push({ k, err: 'no adjacent floor' }); continue; }
    p.pl
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "collision": [
    {
      "dir": "KeyW",
      "tile": [
        16,
        25
      ],
      "ch": ".",
      "insideSolid": false
    },
    {
      "dir": "KeyA",
      "tile": [
        16,
        26
      ],
      "ch": ".",
      "insideSolid": false
    },
    {
      "dir": "KeyS",
      "tile": [
        17,
        27
      ],
      "ch": ".",
      "insideSolid": false
    },
    {
      "dir": "KeyD",
      "tile": [
        18,
        26
      ],
      "ch": ".",
      "insideSolid": false
    }
  ],
… [truncated]
```
</details>

All green: collision holds in all four directions, both level-0 secrets open at 4.0 units, fuel drains, and it's running at 19 draw calls / 17k triangles. Let me see a revealed passage and test the descent:

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T14-56-35-348Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T14-56-35-348Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T14-56-35-348Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

"2/8" confirms reveals. But he's rendering as a giant black blob — his own torch is at his hand, so his body occludes it and he casts an enormous self-shadow onto the wall behind. Let me confirm his actual size first:

**`playwright/browser_evaluate`**
```js
() => {
  const g = window.__game;
  const THREE = g.player.root.constructor;
  const box = new (Object.getPrototypeOf(g.player.pos).constructor === Object ? Object : Object)();
  // measure via world bounding box of the skinned mesh
  let min = [1e9,1e9,1e9], max = [-1e9,-1e9,-1e9];
  g.player.root.updateMatrixWorld(true);
  g.player.root.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    geo.computeBoundingBox();
    const b = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);
    min = [Math.min(min[0],b.min.x), Math.min(min[1],b.min.y), Math.min(min[2],b.min.z)];
    max = [Math.max(max[0],b.max.x), Math.max(max[1],b.max.y), Math.max(max[2],b.max.z)];
  });
  return {
    playerWorldSize: [max[0]-min[0], max[1]-min[1], max[2]-min[2]].map(v=>+v.toFixed(2)),
    playerFootY: +min[1].toFixed(2),
    playerScale: g.player.root.scale.toArray(),
    viewSize: g.cam.viewSize,
    torchLightPos: g.torch.light.position.toArray().map(v=>+v.toFixed(2)),
    playerPos: g.player.pos.toArray().map(v=>+v.toFixed(2)),
    distLightToPlayer: +Math.hypot(
      g.torch.light.position.x-g.player.pos.x,
      g.torch.light.position.z-g.player.pos.z).toFixed(2),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "playerWorldSize": [
    1.41,
    1.76,
    1.25
  ],
  "playerFootY": -0.01,
  "playerScale": [
    1,
    1,
    1
  ],
  "viewSize": 17,
  "torchLightPos": [
    29.67,
    0.79,
    -18.8
  ],
  "playerPos": [
    29,
    -0.01,
    -19
  ],
  "distLightToPlayer": 0.7
}
### Ran Playwright code
``​`js
await page.evaluate('() => {\n  const g = window.__game;\n  const THREE = g.player.root.constructor;\n  const box = new (Object.getPrototypeOf(g.player.pos).constructor === Object ? Object : Object)();\n  // measure via world bounding box of the skinned mesh\n  let min = [1e9,1e9,1e9], max = [-1e9,-1e9,-1e9];\n  g.player.root.updateMatrixWorld(true);\n  g.player.root.traverse(o => {\n    if (!o.isMesh) return;\n    const geo = o.geometry;\n    geo.computeBoundingBox();\n    const b = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);\n    min = [Math.min(min[0],b.min.x), Math.min(min[1],b.min.y), Math.min(min[2],b.min.z)];\n    max = [Math.max(max[0],b.max.x), Math.max(max[1],b.max.y), Math.max(max[2],b.max.z)];\n  });\n  return {\n    playerWorldSize: [max[0]-min[0], max[1]-min[1], max[2]-min[2]].map(v=>+v.toFixed(2)),\n    playerFootY: +min[1].toFixed(2),\n    playerScale: g.player.root.scale.toArray(),\n    viewSize: g.cam.viewSize,\n    torchLightPos: g.torch.light.position.toArray().map(v=>+v.toFixed(2)),\n    playerPos: g.player.pos.toArray().map(v=>+v.toFixed(2)),\n    distLightToPlayer: +Math.hypot(\n      g.torch.light.position.x-g.player.pos.x,\n      g.torch.light.position.z-g.player.pos.z).toFixed(2),\n  };\n}');
``​`
```
</details>

He's correctly sized (1.76 tall, feet grounded) — so that blob really is his own shadow. No light position fixes this while the lamp is on his person, so: the player stops casting the torch's shadow, and gets a contact shadow instead.

**`Bash`** — Add contact shadow, disable player shadow casting
```bash
python3 - <<'PYEOF'
p='src/game/Player.js'; s=open(p).read()
s = s.replace('''    this.root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      if (o.isSkinnedMesh) o.frustumCulled = false;   // skinned bounds go stale
    });''',
'''    this.root.traverse((o) => {
      // He does NOT cast the torch's shadow. The light lives on his own hand,
      // 0.7 units from his body, so any shadow he casts is projected enormous
      // and blots out the room. A contact shadow grounds him instead.
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; }
      if (o.isSkinnedMesh) o.frustumCulled = false;   // skinned bounds go stale
    });

    this.blob = Player.contactShadow();''',1)

s = s.replace('''    this.pos.y = this.grid.floorHeight(this.level, this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;''',
'''    this.pos.y = this.grid.floorHeight(this.level, this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.blob.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);''',1)

s = s.replace('''  play(name, fade = 0.22) {''',
'''  /** Torch strength drives the contact shadow - no light, no shadow. */
  setShadowStrength(k) {
    this.blob.material.opacity = 0.52 * k;
    this.blob.scale.setScalar(0.95 + (1 - k) * 0.5);
  }

  static contactShadow() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.15),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.MultiplyBlending,
      }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    return mesh;
  }

  play(name, f
… [truncated]
```
<details><summary>result</summary>

```
contact shadow
wired
(Use `node --trace-warnings ...` to show where the warning was created)
build ok
```
</details>

Good call — that simplifies the loop and sharpens it. Let me rebuild around discovery: the torch is permanent, and it becomes a **detector** — it stirs and cools toward blue as you near an undiscovered passage, turning secret-hunting into an active hot/cold hunt. The `F` pickups become embers that permanently widen that sense.

**`Bash`** — Rewrite Torch as a discovery instrument
```bash
cat > src/game/Torch.js <<'EOF'
import * as THREE from 'three';

/**
 * The torch: a permanent light, and the player's instrument for finding
 * hidden passages.
 *
 * It does not burn out. Its job is DISCOVERY: as an undiscovered secret comes
 * within range the flame stirs, flares and cools toward blue-white, so hunting
 * a passage is a hot-and-cold game you play by watching your own light rather
 * than by walking into every wall in the cave.
 *
 * Embers collected in the cave permanently widen that sense.
 */
const BASE_SENSE = 2.6;
const EMBER_SENSE = 0.55;

export class Torch {
  constructor(scene) {
    this.embers = 0;
    this.proximity = 0;          // 0..1, how near the closest hidden passage is
    this._prox = 0;              // damped, for smooth light response

    this.light = new THREE.PointLight(0xffb066, 0, 26, 1.55);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.006;
    this.light.shadow.camera.near = 0.15;
    this.light.shadow.camera.far = 26;

    const tex = Torch.glowTexture();
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xffb266, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    }));
    this.halo.scale.setScalar(1.5);

    this.anchor = null;
    this._t = 0;
    this._flick = 1;
    scene.add(this.light, this.halo);
  }

  attachTo(node) { this.anchor = node; }

  /** How close a passage must be before it opens. Embers widen it. */
  get revealRadius() { return BASE_SENSE + this.embers * EMBER_SENSE; }

  /** How far out the flame can *feel* a passage - the hot/cold range. */
  get senseRadius() { return this.revealRadius * 3.6; }

  addEmber() { this.embers++; }

  /** @param nearest distance to the closest undiscovered secret, or Infinity */
  sense(nearest) {
    const r = this.revealRadius, s = this.senseRadius;
    this.proximity = nearest >= s ? 0
      : nearest <= r ? 1
      : 1 - (nearest - r) / (s - r);
  }
… [truncated]
```
<details><summary>result</summary>

```
(eval):1: file exists: src/game/Torch.js
ok
```
</details>

**`Bash`** — Rewrite Torch as discovery instrument
```bash
rm -f src/game/Torch.js && cat > src/game/Torch.js <<'EOF'
import * as THREE from 'three';

/**
 * The torch: a permanent light, and the player's instrument for finding
 * hidden passages.
 *
 * It does not burn out. Its job is DISCOVERY: as an undiscovered secret comes
 * within range the flame stirs, flares and cools toward blue-white, so hunting
 * a passage is a hot-and-cold game you play by watching your own light rather
 * than by walking into every wall in the cave.
 *
 * Embers collected in the cave permanently widen that sense.
 */
const BASE_SENSE = 2.6;
const EMBER_SENSE = 0.55;

export class Torch {
  constructor(scene) {
    this.embers = 0;
    this.proximity = 0;          // 0..1, how near the closest hidden passage is
    this._prox = 0;              // damped, for a smooth light response

    this.light = new THREE.PointLight(0xffb066, 0, 26, 1.55);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.006;
    this.light.shadow.camera.near = 0.15;
    this.light.shadow.camera.far = 26;

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Torch.glowTexture(), color: 0xffb266, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    }));
    this.halo.scale.setScalar(1.5);

    this.anchor = null;
    this._t = 0;
    this._flick = 1;
    scene.add(this.light, this.halo);
  }

  attachTo(node) { this.anchor = node; }

  /** How close a passage must be before it opens. Embers widen it. */
  get revealRadius() { return BASE_SENSE + this.embers * EMBER_SENSE; }

  /** How far out the flame can *feel* a passage - the hot/cold range. */
  get senseRadius() { return this.revealRadius * 3.6; }

  addEmber() { this.embers++; }

  /** @param nearest distance to the closest undiscovered secret, or Infinity */
  sense(nearest) {
    const r = this.revealRadius, s = this.senseRadius;
    this.proximity = nearest >= s ? 0
      : nearest <= r ? 1
      : 1 - (nearest - r) / (s - r);
  }

… [truncated]
```
<details><summary>result</summary>

```
Torch rewritten:      103 lines
```
</details>

**`Bash`** — Replace fuel with discovery sense across modules
```bash
python3 - <<'PYEOF'
import re
# ---------------- main.js: drop fuel, add the sense loop
p='src/main.js'; s=open(p).read()
s = s.replace("import { Torch, FUEL_MAX } from './game/Torch.js';", "import { Torch } from './game/Torch.js';",1)
s = s.replace('''const FUEL_PER_FLASK = 42;
const DARK_GRACE = 12;         // seconds you can stumble before the cave takes you
''', '')

s = s.replace('''    // --- secrets reveal themselves when the torchlight gets close enough
    const found = cavern.checkReveals(game.level, player.pos.x, player.pos.z, torch.revealRadius);''',
'''    // --- the flame feels for the nearest passage it has not found yet, which
    // is what turns searching into a hot/cold hunt instead of wall-bumping
    torch.sense(cavern.nearestHidden(game.level, player.pos.x, player.pos.z));
    const found = cavern.checkReveals(game.level, player.pos.x, player.pos.z, torch.revealRadius);''',1)

s = s.replace('''    // --- running out of light
    if (torch.out && !game.won) {
      const left = DARK_GRACE - torch.darkSeconds;
      hud.hint(left > 0 ? `The dark closes in... ${Math.ceil(left)}` : '');
      if (left <= 0) {
        hud.toast('The dark took you. Back to the entrance.', 3.5);
        torch.refuel(FUEL_MAX * 0.5);
        enterLevel(game.level, grid, cavern, props, player, torch, true);
      }
    } else if (!game.won) {
      hud.hint('');
    }

    hud.setFuel(torch.fraction, torch.out);''',
'''    hud.setSense(torch.proximity, torch.embers);''',1)

s = s.replace('''    player.setShadowStrength(torch.out ? 0.12 : 0.35 + torch.fraction * 0.65);''',
              '''    player.setShadowStrength(0.85);''',1)

s = s.replace('''    if (item.spec.kind === 'fuel') {
      props.take(item);
      torch.refuel(FUEL_PER_FLASK);
      player.playOnce('Refuel');
      hud.toast('Torch refuelled');
    } else if (item.spec.kind === 'treasure') {''',
'''    if (item.spec.kind === 'ember') {
      props.take(item);
      torch.addEmber();
      player.playOnce('Refuel');
      hud.toast(`Ember taken - you can feel further now (${torch.revealRadius.toFixed(1)}m)`);
    } else if (item.spec.kind === 'treasure') {''',1)

s = s.replace("  hud.toast('Find the w
… [truncated]
```
<details><summary>result</summary>

```
main.js
Props.js
Cavern.js
HUD.js
done
```
</details>

**`Bash`** — Update HUD markup for sense meter
```bash
python3 - <<'PYEOF'
p='index.html'; s=open(p).read()
s = s.replace('''  #fuel {
    width: 210px; height: 9px; border-radius: 99px;
    background: #16130f; border: 1px solid #2a241c;
    box-shadow: inset 0 1px 2px #0009; overflow: hidden;
  }
  #fuel-fill {
    height: 100%; width: 100%;
    background: linear-gradient(90deg, #ff6a1a, #ffc25e);
    box-shadow: 0 0 12px #ff8a2acc;
    transition: width .18s linear;
  }
  #fuel.low #fuel-fill { animation: gutter .55s steps(2) infinite; }
  #fuel.out #fuel-fill { background: #3a2c22; box-shadow: none; }
  @keyframes gutter { 50% { opacity: .45; } }''',
'''  /* the sense meter mirrors the flame: amber when calm, cold when a passage
     is close, so the HUD and the light tell the same story */
  #sense {
    width: 210px; height: 9px; border-radius: 99px;
    background: #101319; border: 1px solid #232833;
    box-shadow: inset 0 1px 2px #0009; overflow: hidden;
  }
  #sense-fill {
    height: 100%; width: 0;
    background: linear-gradient(90deg, #ff7a2a, #ffd08a);
    transition: width .12s linear, background .3s, box-shadow .3s;
  }
  #sense.warm #sense-fill { box-shadow: 0 0 10px #ffa04ccc; }
  #sense.hot #sense-fill {
    background: linear-gradient(90deg, #4fb8ff, #d8f2ff);
    box-shadow: 0 0 16px #7fd4ffdd;
    animation: gutter .4s steps(2) infinite;
  }
  @keyframes gutter { 50% { opacity: .5; } }
  .lbl { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #5f5b52; }''',1)

s = s.replace('''    <div id="fuel"><div id="fuel-fill"></div></div>
    <div class="row">passages found <b id="found">0/0</b></div>''',
'''    <div class="lbl">the flame senses</div>
    <div id="sense"><div id="sense-fill"></div></div>
    <div class="row">passages found <b id="found">0/0</b> · embers <b id="embers">0</b></div>''',1)

s = s.replace('''    walk over flasks to refuel · get close to feel for passages''',
'''    watch the flame — it stirs and cools near a hidden way''',1)
open(p,'w').write(s); print('index.html')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace-warnings" | head -5; echo "BUILD OK"
```
<details><summary>result</summary>

```
index.html
BUILD OK
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T14-59-22-263Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-06T14-59-22-197Z.log#L1
```
</details>

Now testing the hot/cold mechanic — walking a straight line toward a hidden passage and sampling what the flame does:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const grid = g.grid, cav = g.cavern, p = g.player, t = g.torch;

  // pick the first level-0 secret and sample the flame at decreasing distances
  const secret = [...cav.secrets.values()].find(s => s.level === 0);
  const w = grid.tileToWorld(0, secret.tx, secret.ty);
  const samples = [];

  // find open floor tiles on a ray away from the secret to sample from
  for (const dist of [12, 9, 7, 5.5, 4.5, 3.5, 2.8]) {
    // search a ring for a walkable tile at roughly this distance
    let spot = null;
    for (let a = 0; a < 32 && !spot; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const tx = Math.round((w.x + Math.cos(ang) * dist) / grid.tileSize + grid.W / 2 - 0.5);
      const ty = Math.round((w.z + Math.sin(ang) * dist) / grid.tileSize + grid.H / 2 - 0.5);
      if (!grid.isSolid(0, tx, ty, cav.revealed)) spot = { tx, ty };
    }
    if (!spot) continue;
    p.placeAt(0, spot.tx, spot.ty);
    await wait(260);
    const d = Math.hypot(w.x - p.pos.x, w.z - p.pos.z);
    samples.push({
      dist: +d.toFixed(2),
      proximity: +t.proximity.toFixed(2),
      intensity: +t.light.intensity.toFixed(1),
      hue: +(t.light.color.getHSL({}).h).toFixed(3),
      revealed: cav.revealed.has(`0:${secret.tx},${secret.ty}`),
    });
  }
  return {
    revealRadius: +t.reveal
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "revealRadius": 2.6,
  "senseRadius": 9.36,
  "samples": [
    {
      "dist": 12,
      "proximity": 0,
      "intensity": 17.1,
      "hue": 0.075,
      "revealed": false
    },
    {
      "dist": 10,
      "proximity": 0,
      "intensity": 16.9,
      "hue": 0.075,
      "revealed": false
    },
    {
      "dist": 8,
      "proximity": 0.2,
      "intensity": 19.3,
      "hue": 0.14,
      "revealed": false
    },
    {
      "dist": 6,
      "proximity": 0.5,
      "intensity": 23.1,
      "hue": 0.26,
      "revealed": false
    },
    {
      "dist": 4,
      "proximity": 0.79,
      "intensity": 29.1,
      "hue": 0.392,
      "revealed": false
    },
… [truncated]
```
</details>

The hot/cold curve works exactly as designed — amber at 12m, cooling through to cyan at 4m, then reverting once found. But 198 console errors appeared; checking:

**`playwright/browser_console_messages`**
<details><summary>result</summary>

```
### Result
- [Console](./console-errs.txt)
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
- Console: 200 errors, 0 warnings
### Events
- New console entries: .playwright-mcp/console-2026-09-06T14-59-22-197Z.log#L808-L1209
```
</details>

**`Bash`** — Summarize console errors
```bash
F=$(find . -name "console-errs.txt" 2>/dev/null | head -1); echo "file: $F"; sed 's/\\n/\n/g' "$F" 2>/dev/null | grep -i error | sed 's/^[[:space:]]*//' | sort | uniq -c | sort -rn | head -8
```
<details><summary>result</summary>

```
file:
```
</details>

**`playwright/browser_evaluate`**
```js
() => {
  // capture errors going forward by wrapping console.error, then force a frame
  const seen = [];
  const orig = console.error;
  console.error = (...a) => { seen.push(a.map(String).join(' ').slice(0, 300)); orig(...a); };
  window.__errs = seen;
  return 'hooked';
}
```
<details><summary>result</summary>

```
### Result
"hooked"
### Ran Playwright code
``​`js
await page.evaluate('() => {\n  // capture errors going forward by wrapping console.error, then force a frame\n  const seen = [];\n  const orig = console.error;\n  console.error = (...a) => { seen.push(a.map(String).join(\' \').slice(0, 300)); orig(...a); };\n  window.__errs = seen;\n  return \'hooked\';\n}');
``​`
### Events
- New console entries: .playwright-mcp/console-2026-09-06T14-59-22-197Z.log#L1210-L1849
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  await new Promise(r => setTimeout(r, 1200));
  const counts = {};
  for (const e of window.__errs) counts[e] = (counts[e] || 0) + 1;
  return { unique: Object.entries(counts).slice(0, 5), total: window.__errs.length };
}
```
<details><summary>result</summary>

```
### Result
{
  "unique": [
    [
      "THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true",
      374
    ]
  ],
  "total": 374
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  await new Promise(r => setTimeout(r, 1200));\n  const counts = {};\n  for (const e of window.__errs) counts[e] = (counts[e] || 0) + 1;\n  return { unique: Object.entries(counts).slice(0, 5), total: window.__errs.length };\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
- Console: 194 errors, 0 warnings
### Events
- New console entries: .playwright-mcp/console-2026-09-06T14-59-22-197Z.log#L1850-L2223
```
</details>

One error spammed per frame: `MultiplyBlending` needs premultiplied alpha. Fixing that, wiring the now-unused hint element to the discovery cue, and renaming the `Refuel` clip since it's a gather animation now:

**`Bash`** — Fix blending warning, wire hint, rename clip
```bash
python3 - <<'PYEOF'
# 1. premultipliedAlpha for the contact shadow
p='src/game/Player.js'; s=open(p).read()
s = s.replace("""        map: tex, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.MultiplyBlending,""",
"""        map: tex, transparent: true, opacity: 0.5, depthWrite: false,
        // MultiplyBlending in three requires premultiplied alpha, or it warns
        // once per frame for the life of the session
        blending: THREE.MultiplyBlending, premultipliedAlpha: true,""",1)
# constant shadow strength - it no longer tracks a fuel level
s = s.replace('''  /** Torch strength drives the contact shadow - no light, no shadow. */
  setShadowStrength(k) {
    this.blob.material.opacity = 0.52 * k;
    this.blob.scale.setScalar(0.95 + (1 - k) * 0.5);
  }

''', '')
s = s.replace("this.actions.Refuel?.setLoop(THREE.LoopOnce, 1);\n    if (this.actions.Refuel) this.actions.Refuel.clampWhenFinished = true;",
              "this.actions.Gather?.setLoop(THREE.LoopOnce, 1);\n    if (this.actions.Gather) this.actions.Gather.clampWhenFinished = true;",1)
open(p,'w').write(s); print('Player.js')

# 2. main.js: drop the per-frame shadow call, use the hint for the discovery cue
p='src/main.js'; s=open(p).read()
s = s.replace("\n    player.setShadowStrength(0.85);", "",1)
s = s.replace("    hud.setSense(torch.proximity, torch.embers);",
"""    hud.setSense(torch.proximity, torch.embers);
    hud.hint(torch.proximity > 0.72 && !game.won ? 'something gives here' : '');""",1)
s = s.replace("player.playOnce('Refuel');", "player.playOnce('Gather');",1)
open(p,'w').write(s); print('main.js')

# 3. rename the clip at the source
p='blender/build_character.py'; s=open(p).read()
s = s.replace('''    # ---- Refuel: crouch, bring the torch down, tip the oil in
    act = L.new_action(rig, "Refuel")''',
'''    # ---- Gather: crouch and pick something up off the cave floor
    act = L.new_action(rig, "Gather")''',1)
s = s.replace('L.drop_actions({"Idle", "Walk", "Refuel"})', 'L.drop_actions({"Idle", "Walk", "Refuel", "Gather"})',1)
s = s.replace('(Idle / Walk / Refuel)', '(Idle / Walk / Gather)',1)
open(p,'w').write(s); print('build_character.py')

# 4. hint
… [truncated]
```
<details><summary>result</summary>

```
Player.js
main.js
build_character.py
index.html
done
```
</details>

**`blender/execute_blender_code`**
```python

import traceback
p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py"
try:
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    r = g["result"]
    result = {"actions": r["actions"], "tris": r["tris"], "bones": len(r["bones"])}
except Exception:
    result = {"error": traceback.format_exc()[-1200:]}

```
<details><summary>result</summary>

```
{"status":"ok","result":{"actions":["Gather","Idle","Walk"],"tris":3468,"bones":12},"stdout":"09:00:29 | INFO: Starting glTF 2.0 export\n09:00:29 | INFO: Extracting primitive: TorchBoyMesh\n09:00:29 | INFO: Primitives created: 9\n09:00:29 | INFO: Finished glTF 2.0 export in 0.2017500400543213 s\n\n"}
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-00-34-270Z.yml)
```
</details>

Clean load, no console errors. Let me capture the game in its "hot" state — closing in on a hidden passage:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, cavern: cav, player: p, torch: t } = g;
  const secret = [...cav.secrets.values()].find(s => s.level === 0);
  const w = grid.tileToWorld(0, secret.tx, secret.ty);
  // stand ~4m off it: strong sense, not yet revealed
  let spot = null;
  for (let a = 0; a < 48 && !spot; a++) {
    const ang = (a / 48) * Math.PI * 2;
    const tx = Math.round((w.x + Math.cos(ang) * 4.2) / grid.tileSize + grid.W / 2 - 0.5);
    const ty = Math.round((w.z + Math.sin(ang) * 4.2) / grid.tileSize + grid.H / 2 - 0.5);
    if (!grid.isSolid(0, tx, ty, cav.revealed)) spot = { tx, ty };
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  await wait(700);
  return { proximity: +t.proximity.toFixed(2), errors: (window.__errs||[]).length,
           dist: +Math.hypot(w.x-p.pos.x, w.z-p.pos.z).toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "proximity": 0.79,
  "errors": 0,
  "dist": 4
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, cavern: cav, player: p, torch: t } = g;\n  const secret = [...cav.secrets.values()].find(s => s.level === 0);\n  const w = grid.tileToWorld(0, secret.tx, secret.ty);\n  // stand ~4m off it: strong sense, not yet revealed\n  let spot = null;\n  for (let a = 0; a < 48 && !spot; a++) {\n    const ang = (a / 48) * Math.PI * 2;\n    const tx = Math.round((w.x + Math.cos(ang) * 4.2) / grid.tileSize + grid.W / 2 - 0.5);\n    const ty = Math.round((w.z + Math.sin(ang) * 4.2) / grid.tileSize + grid.H / 2 - 0.5);\n    if (!grid.isSolid(0, tx, ty, cav.revealed)) spot = { tx, ty };\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  await wait(700);\n  return { proximity: +t.proximity.toFixed(2), errors: (window.__errs||[]).length,\n           dist: +Math.hypot(w.x-p.pos.x, w.z-p.pos.z).toFixed(2) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-00-48-935Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-00-48-935Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-00-48-935Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The mechanic reads beautifully — the whole cave goes cold, the meter turns cyan, and "something gives here" fires. But he's a black silhouette. Let me check whether three.js actually supports per-object light layers before relying on it:

**`Bash`** — Check three.js light layer semantics
```bash
grep -n "layers.test" node_modules/three/build/three.module.js | head -20
```
<details><summary>result</summary>

```
8735:		const visible = object.layers.test( camera.layers );
16154:				if ( object.isLight && object.layers.test( camera.layers ) ) {
16172:					if ( object.isLight && object.layers.test( camera.layers ) ) {
16553:			const visible = object.layers.test( camera.layers );
16777:					if ( material.side === DoubleSide && object.layers.test( camera.layers ) ) {
16833:				if ( object.layers.test( camera.layers ) ) {
```
</details>

Confirmed — three.js tests light layers against the **camera**, not the object, so per-object lights don't work in the forward renderer. Using a dim short-range fill light instead, whose falloff keeps it local to him:

**`Bash`** — Add camera-side fill light for the character
```bash
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace("const ambient = new THREE.HemisphereLight(0x25334d, 0x07070c, 0.17);\nscene.add(ambient);",
"""const ambient = new THREE.HemisphereLight(0x25334d, 0x07070c, 0.17);
scene.add(ambient);

// A dim fill on the camera side of the player. His torch is at his own hand,
// so the face turned toward the camera is always backlit and he reads as a
// black cut-out. three.js tests light layers against the CAMERA, not the
// object, so a player-only light is not possible in the forward renderer -
// instead this light is kept very short-range so its pool stays on him.
const fill = new THREE.PointLight(0xffd2a4, 3.6, 3.6, 1.7);
scene.add(fill);
const fillDir = new THREE.Vector3();""",1)

s = s.replace("    cam.follow(player.pos, dt);\n    cam.camera.updateMatrixWorld();",
"""    cam.follow(player.pos, dt);
    cam.camera.updateMatrixWorld();
    fillDir.copy(cam.offset).normalize();
    fill.position.copy(player.pos)
      .addScaledVector(fillDir, 1.25)
      .add(new THREE.Vector3(0, 0.85, 0));""",1)
open(p,'w').write(s); print('fill light added')
PYEOF
grep -n "fill" src/main.js | head
```
<details><summary>result</summary>

```
fill light added
34:// A dim fill on the camera side of the player. His torch is at his own hand,
39:const fill = new THREE.PointLight(0xffd2a4, 3.6, 3.6, 1.7);
40:scene.add(fill);
41:const fillDir = new THREE.Vector3();
118:    fillDir.copy(cam.offset).normalize();
119:    fill.position.copy(player.pos)
120:      .addScaledVector(fillDir, 1.25)
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-01-36-972Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // walk him with real input so the Walk clip and facing are exercised
  const key = (code, down) => window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  key('KeyD', true); key('KeyW', true);
  await wait(900);
  key('KeyD', false); key('KeyW', false);
  await wait(120);
  return { anim: g.player.state, moving: g.player.moving,
           facing: +g.player.facing.toFixed(2), embers: g.torch.embers };
}
```
<details><summary>result</summary>

```
### Result
{
  "anim": "Idle",
  "moving": false,
  "facing": -3.14,
  "embers": 0
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  // walk him with real input so the Walk clip and facing are exercised\n  const key = (code, down) => window.dispatchEvent(\n    new KeyboardEvent(down ? \'keydown\' : \'keyup\', { code, bubbles: true }));\n  key(\'KeyD\', true); key(\'KeyW\', true);\n  await wait(900);\n  key(\'KeyD\', false); key(\'KeyW\', false);\n  await wait(120);\n  return { anim: g.player.state, moving: g.player.moving,\n           facing: +g.player.facing.toFixed(2), embers: g.torch.embers };\n}');
``​`
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const key = (code, down) => window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  key('KeyA', true);              // held, deliberately not released
  await wait(600);
  return { anim: window.__game.player.state };
}
```
<details><summary>result</summary>

```
### Result
{
  "anim": "Walk"
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const key = (code, down) => window.dispatchEvent(\n    new KeyboardEvent(down ? \'keydown\' : \'keyup\', { code, bubbles: true }));\n  key(\'KeyA\', true);              // held, deliberately not released\n  await wait(600);\n  return { anim: window.__game.player.state };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-01-58-611Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-01-58-611Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-01-58-611Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The fill light works — his head reads now. But the cutaway is dissolving far more rock than needed, opening a window into unlit void. Tightening the radius and narrowing the dither band:

**`Bash`** — Tighten cutaway, raise ambient slightly
```bash
python3 - <<'PYEOF'
p='src/game/Cutaway.js'; s=open(p).read()
s = s.replace("  uCutRadius: { value: 2.0 },",
"""  // roughly the player's on-screen silhouette. Wider than this and the hole
  // becomes a window into unlit void, which is worse than the occlusion it fixes
  uCutRadius: { value: 1.5 },""",1)
s = s.replace("    float f = (1.0 - smoothstep(uCutRadius * 0.35, uCutRadius, r)) * uCutStrength;",
              "    float f = (1.0 - smoothstep(uCutRadius * 0.72, uCutRadius, r)) * uCutStrength;",1)
open(p,'w').write(s); print('cutaway tightened')

p='src/main.js'; s=open(p).read()
s = s.replace("new THREE.HemisphereLight(0x25334d, 0x07070c, 0.17)",
              "new THREE.HemisphereLight(0x25334d, 0x07070c, 0.22)",1)
open(p,'w').write(s); print('ambient nudged')
PYEOF
echo done
```
<details><summary>result</summary>

```
cutaway tightened
ambient nudged
done
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-02-28-951Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // put him beside a wall so the cutaway is actually engaged, then walk
  const { grid, cavern: cav, player: p } = g;
  const open = [];
  for (let ty = 2; ty < grid.H - 2; ty++)
    for (let tx = 2; tx < grid.W - 2; tx++)
      if (!grid.isSolid(0, tx, ty, cav.revealed) && grid.isSolid(0, tx, ty + 1, cav.revealed)
          && grid.isSolid(0, tx + 1, ty, cav.revealed)) open.push({ tx, ty });
  p.placeAt(0, open[Math.floor(open.length / 2)].tx, open[Math.floor(open.length / 2)].ty);
  g.cam.follow(p.pos, 0, true);
  const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, bubbles: true }));
  key('KeyD', true);
  await wait(500);
  return { anim: p.state, tile: grid.worldToTile(p.pos.x, p.pos.z) };
}
```
<details><summary>result</summary>

```
### Result
{
  "anim": "Walk",
  "tile": {
    "tx": 16,
    "ty": 19
  }
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  // put him beside a wall so the cutaway is actually engaged, then walk\n  const { grid, cavern: cav, player: p } = g;\n  const open = [];\n  for (let ty = 2; ty < grid.H - 2; ty++)\n    for (let tx = 2; tx < grid.W - 2; tx++)\n      if (!grid.isSolid(0, tx, ty, cav.revealed) && grid.isSolid(0, tx, ty + 1, cav.revealed)\n          && grid.isSolid(0, tx + 1, ty, cav.revealed)) open.push({ tx, ty });\n  p.placeAt(0, open[Math.floor(open.length / 2)].tx, open[Math.floor(open.length / 2)].ty);\n  g.cam.follow(p.pos, 0, true);\n  const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? \'keydown\' : \'keyup\', { code: c, bubbles: true }));\n  key(\'KeyD\', true);\n  await wait(500);\n  return { anim: p.state, tile: grid.worldToTile(p.pos.x, p.pos.z) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-02-42-194Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-02-42-194Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-02-42-194Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Cutaway is now a clean, tight window. Testing the descent through all three levels:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, bubbles: true }));
  ['KeyW','KeyA','KeyS','KeyD'].forEach(k => key(k, false));

  const { grid, player: p } = g;
  const log = [];
  for (let step = 0; step < 3; step++) {
    const lvl = g.game.level;
    const down = grid.find(lvl, '>')[0];
    if (!down) { log.push({ lvl, note: 'no stairs - final level', exit: !!grid.find(lvl,'X')[0] }); break; }
    // stand on an open tile adjacent to the shaft
    let spot = null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]) {
      if (!grid.isSolid(lvl, down.tx + dx, down.ty + dy, g.cavern.revealed)) { spot = [down.tx+dx, down.ty+dy]; break; }
    }
    p.placeAt(lvl, spot[0], spot[1]);
    g.game.stairLock = false;
    await wait(900);
    log.push({ from: lvl, to: g.game.level, name: grid.levels[g.game.level].name,
               playerY: +p.pos.y.toFixed(1), levelY: grid.levelY(g.game.level) });
  }
  return { log, finalLevel: g.game.level,
           visibleLevels: g.cavern.levels.map(n => n.visible) };
}
```
<details><summary>result</summary>

```
### Result
{
  "log": [
    {
      "from": 0,
      "to": 0,
      "name": "The Threshold",
      "playerY": 0.1,
      "levelY": 0
    },
    {
      "from": 0,
      "to": 0,
      "name": "The Threshold",
      "playerY": 0.1,
      "levelY": 0
    },
    {
      "from": 0,
      "to": 0,
      "name": "The Threshold",
      "playerY": 0.1,
      "levelY": 0
    }
  ],
  "finalLevel": 0,
  "visibleLevels": [
    true,
    true,
    false
  ]
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? \'keydown\' : \'keyup\', { code: c, bubbles: true }));\n  [\'KeyW\',\'KeyA\',\'KeyS\',\'KeyD\'].forEach(k => key(k, false));\n\n  const { grid, player: p } = g;\n  const log = [];\n  for (let step = 0; step < 3; step++) {\n    const lvl = g.game.level;\n    const down = grid.find(lvl, \'>\')[0];\n    if (!down) { log.push({ lvl, note: \'no stairs - final level\', exit: !!grid.find(lvl,\'X\')[0] }); break; }\n    // stand on an open tile adjacent to the shaft\n    let spot = null;\n    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]) {\n      if (!grid.isSolid(lvl, down.tx + dx, down.ty + dy, g.cavern.revealed)) { spot = [down.tx+dx, down.ty+dy]; break; }\n    }\n    p.placeAt(lvl, spot[0], spot[1]);\n    g.game.stairLock = false;\n    await wait(900);\n    log.push({ from: lvl, to: g.game.level, name: grid.levels[g.game.level].name,\n               playerY: +p.pos.y.toFixed(1), levelY: grid.levelY(g.game.level) });\n  }\n  return { log, finalLevel: g.game.level,\n           visibleLevels: g.cavern.levels.map(n => n.visible) };\n}');
``​`
```
</details>

The descent doesn't fire — and the reason is a real design fragility, not just my test. The shaft tile is solid, so collision stops the player at 1.42 units from its centre, but adjacent-tile centres are 2.0 away; the 1.75 trigger leaves only a narrow band. Widening it and retesting with actual walking:

**`Bash`** — Widen stair trigger band
```bash
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace('''  // --- stairs: '>' is an unfloored shaft, so trigger on proximity to it
  const down = grid.find(game.level, '>')[0];
  if (down) {
    const w = grid.tileToWorld(game.level, down.tx, down.ty);
    const near = Math.hypot(w.x - x, w.z - z) < 1.75;''',
'''  // --- stairs: '>' is an unfloored shaft, so trigger on proximity to it.
  // Collision holds the player 1.42 units off the shaft centre (half a tile
  // plus his radius) while adjacent tile centres sit at 2.0, so the trigger
  // has to sit between those two or the descent is unreachable.
  const down = grid.find(game.level, '>')[0];
  if (down) {
    const w = grid.tileToWorld(game.level, down.tx, down.ty);
    const near = Math.hypot(w.x - x, w.z - z) < 1.85;''',1)
open(p,'w').write(s); print('stair trigger widened to 1.85')
PYEOF
echo ok
```
<details><summary>result</summary>

```
stair trigger widened to 1.85
ok
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-03-31-346Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p } = g;
  const log = [];

  for (let step = 0; step < 3; step++) {
    const lvl = g.game.level;
    const down = grid.find(lvl, '>')[0];
    if (!down) {
      const x = grid.find(lvl, 'X')[0];
      log.push({ lvl, name: grid.levels[lvl].name, note: 'final level', hasExit: !!x });
      // walk to the exit and confirm the win fires
      if (x) {
        const w = grid.tileToWorld(lvl, x.tx, x.ty);
        p.pos.set(w.x, p.pos.y, w.z); p.root.position.copy(p.pos);
        await wait(400);
        log.push({ won: g.game.won });
      }
      break;
    }
    const w = grid.tileToWorld(lvl, down.tx, down.ty);
    // walk him right up against the shaft: legal, just inside the trigger band
    let spot = null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
      if (!grid.isSolid(lvl, down.tx+dx, down.ty+dy, g.cavern.revealed)) { spot=[dx,dy]; break; }
    p.placeAt(lvl, down.tx + spot[0], down.ty + spot[1]);
    p.pos.x = w.x + spot[0] * 1.5;      // 1.5 from centre: inside 1.85, outside 1.42
    p.pos.z = w.z + spot[1] * 1.5;
    p.root.position.copy(p.pos);
    g.game.stairLock = false;
    await wait(900);
    log.push({ from: lvl, to: g.game.level, name: grid.levels[g.game.level].name,
               playerY: +p.pos.y.toFixed(1), levelY: gri
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "log": [
    {
      "from": 0,
      "to": 1,
      "name": "The Weeping Gallery",
      "playerY": -9,
      "levelY": -9
    },
    {
      "from": 1,
      "to": 2,
      "name": "The Deep Hollow",
      "playerY": -17.9,
      "levelY": -18
    },
    {
      "lvl": 2,
      "name": "The Deep Hollow",
      "note": "final level",
      "hasExit": true
    },
    {
      "won": false
    }
  ],
  "visibleLevels": [
    false,
    false,
    true
  ],
  "errors": 0
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p } = g;\n  const log = [];\n\n  for (let step = 0; step < 3; step++) {\n    const lvl = g.game.level;\n    const down = grid.find(lvl, \'>\')[0];\n    if (!down) {\n      const x = grid.find(lvl, \'X\')[0];\n      log.push({ lvl, name: grid.levels[lvl].name, note: \'final level\', hasExit: !!x });\n      // walk to the exit and confirm the win fires\n      if (x) {\n        const w = grid.tileToWorld(lvl, x.tx, x.ty);\n        p.pos.set(w.x, p.pos.y, w.z); p.root.position.copy(p.pos);\n        await wait(400);\n        log.push({ won: g.game.won });\n      }\n      break;\n    }\n    const w = grid.tileToWorld(lvl, down.tx, down.ty);\n    // walk him right up against the shaft: legal, just inside the trigger band\n    let spot = null;\n    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n      if (!grid.isSolid(lvl, down.tx+dx, down.ty+dy, g.cavern.revealed)) { spot=[dx,dy]; break; }\n    p.placeAt(lvl, down.tx + spot[0], down.ty + spot[1]);\n    p.pos.x = w.x + spot[0] * 1.5;      // 1.5 from centre: inside 1.85, outside 1.42\n    p.pos.z = w.z + spot[1] * 1.5;\n    p.root.position.copy(p.pos);\n    g.game.stairLock = false;\n    await wait(900);\n    log.push({ from: lvl, to: g.game.level, name: grid.levels[g.game.level].name,\n               playerY: +p.pos.y.toFixed(1), levelY: grid.levelY(g.game.level) });\n  }\n  return { log, visibleLevels: g.cavern.levels.map(n => n.visible), errors: (window.__errs||[]).length };\n}');
``​`
```
</details>

Descent works cleanly through all three levels. But the win didn't fire — let me check whether the props actually exist, because multi-material Blender objects export as *Groups*, not Meshes:

**`playwright/browser_evaluate`**
```js
async () => {
  const res = await fetch('models/props.glb');
  const buf = await res.arrayBuffer();
  // read node names straight out of the glTF JSON chunk
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const g = window.__game;
  const spawned = {};
  for (const it of g.props.items) spawned[it.spec.kind] = (spawned[it.spec.kind] || 0) + 1;
  return {
    gltfNodes: json.nodes.map(n => n.name),
    nodeHasMesh: json.nodes.map(n => ({ name: n.name, mesh: n.mesh !== undefined, children: (n.children||[]).length })),
    itemsSpawned: spawned,
    totalItems: g.props.items.length,
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "gltfNodes": [
    "Prop_Exit",
    "Prop_Fuel",
    "Prop_StairsDown",
    "Prop_StairsUp",
    "Prop_Treasure"
  ],
  "nodeHasMesh": [
    {
      "name": "Prop_Exit",
      "mesh": true,
      "children": 0
    },
    {
      "name": "Prop_Fuel",
      "mesh": true,
      "children": 0
    },
    {
      "name": "Prop_StairsDown",
      "mesh": true,
      "children": 0
    },
    {
      "name": "Prop_StairsUp",
      "mesh": true,
      "children": 0
    },
    {
      "name": "Prop_Treasure",
      "mesh": true,
      "children": 0
    }
  ],
  "itemsSpawned": {
    "down": 2,
    "up": 2
  },
… [truncated]
```
</details>

Confirmed — and it's worse than the win condition. Only 4 props spawned: stairs only. **Every ember, treasure and the exit were silently skipped**, because glTF splits multi-material objects into primitives, so three.js gives back a `Group`, not a `Mesh` — and `o.isMesh` never matched. The whole pickup layer was missing.

**`Bash`** — Fix prop lookup to handle multi-material Groups
```bash
python3 - <<'PYEOF'
p='src/game/Props.js'; s=open(p).read()
s = s.replace('''    const src = {};
    propsGltf.scene.traverse((o) => { if (o.isMesh) src[o.name] = o; });''',
'''    // Look prototypes up BY NAME, not by isMesh. A Blender object with more
    // than one material exports as several glTF primitives, which GLTFLoader
    // rebuilds as a Group - so the flask, the chest and the archway are all
    // Groups, and an isMesh filter silently drops every one of them.
    const src = {};
    for (const name of new Set(Object.values(SPEC).map((v) => v.prop))) {
      const node = propsGltf.scene.getObjectByName(name);
      if (node) src[name] = node;
    }''',1)
s = s.replace('''          const mesh = proto.clone();
          mesh.castShadow = spec.kind !== 'exit';
          mesh.receiveShadow = true;''',
'''          const mesh = proto.clone();
          mesh.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = spec.kind !== 'exit';
            o.receiveShadow = true;
          });''',1)
open(p,'w').write(s); print('Props.js: clone by name, not isMesh')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace-warn" | head -3; echo "BUILD OK"
```
<details><summary>result</summary>

```
Props.js: clone by name, not isMesh
BUILD OK
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-04-30-390Z.yml)
```
</details>

Now a full end-to-end run: collect an ember, open a secret, take the treasure inside it, descend all three levels, and reach the exit.

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, props, torch, cavern: cav } = g;
  const out = { spawned: {}, steps: [] };
  for (const it of props.items) out.spawned[it.spec.kind] = (out.spawned[it.spec.kind] || 0) + 1;

  const goTo = async (lvl, tx, ty, ms = 380) => {
    const w = grid.tileToWorld(lvl, tx, ty);
    p.pos.set(w.x, grid.floorHeight(lvl, w.x, w.z), w.z);
    p.root.position.copy(p.pos);
    await wait(ms);
  };

  // 1. take an ember on level 0
  const r0 = torch.revealRadius;
  const ember = props.items.find((i) => i.level === 0 && i.spec.kind === 'ember');
  await goTo(0, ember.tx, ember.ty);
  out.steps.push({ act: 'ember', taken: ember.taken, embers: torch.embers,
                   radiusBefore: +r0.toFixed(2), radiusAfter: +torch.revealRadius.toFixed(2) });

  // 2. open a secret and grab what is behind it
  const secret = [...cav.secrets.values()].find((s) => s.level === 0);
  let adj = null;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if (!grid.isSolid(0, secret.tx+dx, secret.ty+dy, cav.revealed)) { adj = [secret.tx+dx, secret.ty+dy]; break; }
  await goTo(0, adj[0], adj[1], 600);
  out.steps.push({ act: 'secret', opened: cav.revealed.size, found: g.game.found });

  const prize = props.items.find((i) => i.level === 0 && i.spec.kind === 'treasure' && !i.taken)
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "spawned": {
    "ember": 18,
    "treasure": 3,
    "down": 2,
    "up": 2,
    "exit": 1
  },
  "steps": [
    {
      "act": "ember",
      "taken": true,
      "embers": 1,
      "radiusBefore": 2.6,
      "radiusAfter": 3.15
    },
    {
      "act": "secret",
      "opened": 1,
      "found": 1
    },
    {
      "act": "treasure",
      "taken": true,
      "count": 1
    },
    {
      "act": "descend",
      "level": 1,
      "name": "The Weeping Gallery"
    },
    {
      "act": "descend",
      "level": 2,
      "name": "The Deep Hollow"
    },
    {
      "act": "exit",
      "won": true,
… [truncated]
```
</details>

Full loop verified end-to-end: 18 embers, 3 treasures, exit reached, win fires, zero errors. But that surfaces a balance bug — 18 embers × 0.55 would grow the reveal radius to 12.5 and auto-open every wall. Switching to diminishing returns with a capped sense range:

**`Bash`** — Rebalance ember progression
```bash
python3 - <<'PYEOF'
p='src/game/Torch.js'; s=open(p).read()
s = s.replace('''const BASE_SENSE = 2.6;
const EMBER_SENSE = 0.55;''',
'''const BASE_SENSE = 2.6;
const EMBER_SENSE = 0.62;      // scaled by sqrt(embers), see revealRadius
const SENSE_CAP = 12;          // the hunt should never become trivial''',1)
s = s.replace('''  /** How close a passage must be before it opens. Embers widen it. */
  get revealRadius() { return BASE_SENSE + this.embers * EMBER_SENSE; }

  /** How far out the flame can *feel* a passage - the hot/cold range. */
  get senseRadius() { return this.revealRadius * 3.6; }''',
'''  /**
   * How close a passage must be before it opens. Embers widen it, but on a
   * SQRT curve: there are 18 embers in the cave and a linear bonus would grow
   * this past 12 units, wide enough to pop every secret on the level without
   * the player ever hunting for one.
   */
  get revealRadius() { return BASE_SENSE + EMBER_SENSE * Math.sqrt(this.embers); }

  /** How far out the flame can *feel* a passage - the hot/cold range. */
  get senseRadius() { return Math.min(this.revealRadius * 3.2, SENSE_CAP); }''',1)
open(p,'w').write(s); print('balance: sqrt scaling + cap')
PYEOF
node -e "
const B=2.6,E=0.62;
for (const n of [0,1,3,6,10,18]) {
  const r=B+E*Math.sqrt(n);
  console.log(\`embers \${String(n).padStart(2)}  reveal \${r.toFixed(2)}  sense \${Math.min(r*3.2,12).toFixed(2)}\`);
}"
```
<details><summary>result</summary>

```
balance: sqrt scaling + cap
embers  0  reveal 2.60  sense 8.32
embers  1  reveal 3.22  sense 10.30
embers  3  reveal 3.67  sense 11.76
embers  6  reveal 4.12  sense 12.00
embers 10  reveal 4.56  sense 12.00
embers 18  reveal 5.23  sense 12.00
```
</details>

Good curve. Final visual check — the props now actually render:

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-05-25-448Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, props } = g;
  // stand a couple of tiles off an ember so it is lit but not yet collected
  const ember = props.items.find(i => i.level === 0 && i.spec.kind === 'ember');
  let spot = null;
  for (let d = 2; d <= 3 && !spot; d++)
    for (const [dx, dy] of [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,-d]])
      if (!spot && !grid.isSolid(0, ember.tx+dx, ember.ty+dy, g.cavern.revealed))
        spot = [ember.tx+dx, ember.ty+dy];
  p.placeAt(0, spot[0], spot[1]);
  g.cam.follow(p.pos, 0, true);
  await wait(500);
  return { emberVisible: ember.mesh.visible, taken: ember.taken,
           dist: +Math.hypot(ember.mesh.position.x-p.pos.x, ember.mesh.position.z-p.pos.z).toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "emberVisible": true,
  "taken": false,
  "dist": 4
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, props } = g;\n  // stand a couple of tiles off an ember so it is lit but not yet collected\n  const ember = props.items.find(i => i.level === 0 && i.spec.kind === \'ember\');\n  let spot = null;\n  for (let d = 2; d <= 3 && !spot; d++)\n    for (const [dx, dy] of [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,-d]])\n      if (!spot && !grid.isSolid(0, ember.tx+dx, ember.ty+dy, g.cavern.revealed))\n        spot = [ember.tx+dx, ember.ty+dy];\n  p.placeAt(0, spot[0], spot[1]);\n  g.cam.follow(p.pos, 0, true);\n  await wait(500);\n  return { emberVisible: ember.mesh.visible, taken: ember.taken,\n           dist: +Math.hypot(ember.mesh.position.x-p.pos.x, ember.mesh.position.z-p.pos.z).toFixed(2) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-05-39-742Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-05-39-742Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-05-39-742Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

He reads clearly now. Let me make the Blender pipeline reproducible headless, so assets can be rebuilt without the GUI session:

**`Bash`** — Add headless asset build and test it
```bash
cat > tools/build_assets.sh <<'EOF'
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
EOF
chmod +x tools/build_assets.sh
python3 - <<'PYEOF'
import json
p='package.json'; d=json.load(open(p))
d['scripts'].update({
  "assets": "bash tools/build_assets.sh",
  "levels": "node tools/gen_levels.mjs && node tools/validate_levels.mjs",
})
json.dump(d, open(p,'w'), indent=2)
open(p,'a').write("\n")
PYEOF
./tools/build_assets.sh 2>&1 | tail -20
```
<details><summary>result</summary>

```
09:06:03 | INFO: Primitives created: 1
09:06:03 | INFO: Finished glTF 2.0 export in 0.048178911209106445 s
--- build_props
INFO Draco is available, use library at /Applications/Blender.app/Contents/Resources/5.2/scripts/addons_core/io_scene_gltf2/libbf_intern_draco_bridge.dylib
INFO MeshOptimizer is available, use library at /Applications/Blender.app/Contents/Resources/5.2/scripts/addons_core/io_scene_gltf2/libbf_intern_meshopt_bridge.dylib
09:06:05 | INFO: Starting glTF 2.0 export
09:06:05 | INFO: Extracting primitive: Prop_Exit
09:06:05 | INFO: Primitives created: 2
09:06:05 | INFO: Extracting primitive: Prop_Fuel
09:06:05 | INFO: Primitives created: 4
09:06:05 | INFO: Extracting primitive: Prop_StairsDown
09:06:05 | INFO: Primitives created: 1
09:06:05 | INFO: Extracting primitive: Prop_StairsUp
09:06:05 | INFO: Primitives created: 1
09:06:05 | INFO: Extracting primitive: Prop_Treasure
09:06:05 | INFO: Primitives created: 3
09:06:05 | INFO: Finished glTF 2.0 export in 0.02121901512145996 s
-rw-r--r--@ 1 apshoemaker  staff   828K Sep  6 09:06 public/models/cavern.glb
-rw-r--r--@ 1 apshoemaker  staff   262K Sep  6 09:06 public/models/props.glb
-rw-r--r--@ 1 apshoemaker  staff   233K Sep  6 09:06 public/models/torchboy.glb
```
</details>

Headless build works. Verifying the background-mode build preserved the animation clips (the riskiest part headless):

**`Bash`** — Verify headless GLB contents
```bash
node -e "
const fs=require('fs');
for (const f of ['torchboy','cavern','props']) {
  const b=fs.readFileSync('public/models/'+f+'.glb');
  const len=b.readUInt32LE(12);
  const j=JSON.parse(b.slice(20,20+len).toString());
  console.log(f.padEnd(9),
    'anims:', (j.animations||[]).map(a=>a.name).join(',')||'-',
    '| nodes:', j.nodes.length,
    '| meshes:', j.meshes.length,
    '| skins:', (j.skins||[]).length);
}
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
torchboy  anims: Gather,Idle,Walk | nodes: 15 | meshes: 1 | skins: 1
cavern    anims: - | nodes: 23 | meshes: 20 | skins: 0
props     anims: - | nodes: 5 | meshes: 5 | skins: 0
```
</details>

**`Bash`** — Add gitignore and favicon
```bash
cat > .gitignore <<'EOF'
node_modules/
dist/
.playwright-mcp/
*.blend1
EOF
# small favicon so the tab isn't a 404
printf '%s' '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0b0d12"/><circle cx="16" cy="18" r="8" fill="#e8c9a6"/><path d="M13 9l1-5 1.5 4L17 4l1 5 2-3-1 4h-8l-1-4z" fill="#1a1410"/><circle cx="24" cy="9" r="3.4" fill="#ffb066"/><circle cx="24" cy="9" r="1.7" fill="#fff3d8"/></svg>' > public/favicon.svg
python3 - <<'PYEOF'
p='index.html'; s=open(p).read()
s = s.replace('<title>', '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<title>',1)
open(p,'w').write(s)
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace-warn" | head -3; echo BUILD_OK; ls -la public/
```
<details><summary>result</summary>

```
BUILD_OK
total 8
drwxr-xr-x@  5 apshoemaker  staff  160 Sep  6 09:06 .
drwxr-xr-x@ 14 apshoemaker  staff  448 Sep  6 09:06 ..
drwxr-xr-x@  3 apshoemaker  staff   96 Sep  6 08:52 data
-rw-r--r--@  1 apshoemaker  staff  319 Sep  6 09:06 favicon.svg
drwxr-xr-x@  5 apshoemaker  staff  160 Sep  6 08:46 models
```
</details>

Final verification pass on the freshly-rebuilt headless assets:

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-06-29-036Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,200)); orig(...a); };

  const clips = Object.keys(g.player.actions);
  const key = (c,d) => window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));

  // exercise each animation state through the real state machine
  const states = [];
  states.push({ at: 'rest', state: g.player.state });
  key('KeyW', true); await wait(500);
  states.push({ at: 'walking', state: g.player.state });
  key('KeyW', false); await wait(400);
  states.push({ at: 'stopped', state: g.player.state });
  g.player.playOnce('Gather'); await wait(300);
  states.push({ at: 'gather', state: g.player.state, busy: g.player.busy });
  await wait(1600);
  states.push({ at: 'after gather', state: g.player.state, busy: g.player.busy });

  const before = g.renderer.info.render.frame;
  await wait(1000);
  return {
    clips, states,
    fps: g.renderer.info.render.frame - before,
    drawCalls: g.renderer.info.render.calls,
    tris: g.renderer.info.render.triangles,
    props: g.props.items.length,
    secrets: g.cavern.secrets.size,
    errors: errs,
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "clips": [
    "Gather",
    "Idle",
    "Walk"
  ],
  "states": [
    {
      "at": "rest",
      "state": "Idle"
    },
    {
      "at": "walking",
      "state": "Walk"
    },
    {
      "at": "stopped",
      "state": "Idle"
    },
    {
      "at": "gather",
      "state": "Gather",
      "busy": true
    },
    {
      "at": "after gather",
      "state": "Gather",
      "busy": true
    }
  ],
  "fps": 60,
  "drawCalls": 24,
  "tris": 18388,
  "props": 26,
  "secrets": 8,
  "errors": []
}
### Ran Playwright code
``​`js
… [truncated]
```
</details>

60fps, 24 draw calls, no errors. But `busy` is still true after 1.9s — let me check the Gather clip's actual duration, because a long lock would freeze the player on every pickup:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const durations = {};
  for (const [n, a] of Object.entries(g.player.actions)) durations[n] = +a.getClip().duration.toFixed(2);
  const t0 = performance.now();
  g.player.playOnce('Gather');
  // wait until the mixer's finished event clears the lock
  while (g.player.busy && performance.now() - t0 < 8000) await wait(50);
  return {
    durations,
    lockedForSeconds: +((performance.now() - t0) / 1000).toFixed(2),
    busyCleared: !g.player.busy,
    stateAfter: g.player.state,
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "durations": {
    "Gather": 3.33,
    "Idle": 5,
    "Walk": 1.04
  },
  "lockedForSeconds": 3.33,
  "busyCleared": true,
  "stateAfter": "Gather"
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const durations = {};\n  for (const [n, a] of Object.entries(g.player.actions)) durations[n] = +a.getClip().duration.toFixed(2);\n  const t0 = performance.now();\n  g.player.playOnce(\'Gather\');\n  // wait until the mixer\'s finished event clears the lock\n  while (g.player.busy && performance.now() - t0 < 8000) await wait(50);\n  return {\n    durations,\n    lockedForSeconds: +((performance.now() - t0) / 1000).toFixed(2),\n    busyCleared: !g.player.busy,\n    stateAfter: g.player.state,\n  };\n}');
``​`
```
</details>

The lock clears correctly, but 3.3s of frozen control on every one of 18 pickups is a real feel problem. Shortening the gather at the source:

**`Bash`** — Shorten gather animation and rebuild
```bash
python3 - <<'PYEOF'
p='blender/build_character.py'; s=open(p).read()
s = s.replace('''    steps = [
        (1,  0.0,  0.00, 0.00),
        (20, 1.0,  0.00, -0.05),
        (40, 1.0,  0.35, -0.05),
        (60, 1.0, -0.10, -0.05),
        (80, 0.0,  0.00, 0.00),
    ]''',
'''    # kept short on purpose: this clip locks player control, and there are
    # 18 embers in the cave - a 3s crouch on each one is agony to play
    steps = [
        (1,  0.0,  0.00, 0.00),
        (7,  1.0,  0.00, -0.05),
        (15, 1.0,  0.30, -0.05),
        (22, 1.0, -0.08, -0.05),
        (30, 0.0,  0.00, 0.00),
    ]''',1)
open(p,'w').write(s); print('Gather shortened to 30 frames')
PYEOF
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" --background --factory-startup --python blender/build_character.py 2>&1 | grep -iE "error|traceback" | head -5
node -e "
const b=require('fs').readFileSync('public/models/torchboy.glb');
const j=JSON.parse(b.slice(20,20+b.readUInt32LE(12)).toString());
for (const a of j.animations) {
  const maxT = Math.max(...a.samplers.map(s=>j.accessors[s.input].max[0]));
  console.log(a.name.padEnd(8), maxT.toFixed(2)+'s');
}" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
Gather shortened to 30 frames
Gather   1.25s
Idle     5.00s
Walk     1.04s
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-07-26-997Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs = []; const orig = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,200)); orig(...a); };

  // real pickup: walk onto an ember and time how long control is locked
  const { grid, player: p, props, torch } = g;
  const ember = props.items.find(i => i.level === 0 && i.spec.kind === 'ember');
  const w = grid.tileToWorld(0, ember.tx, ember.ty);
  p.pos.set(w.x, grid.floorHeight(0, w.x, w.z), w.z); p.root.position.copy(p.pos);
  const t0 = performance.now();
  await wait(60);
  const wasBusy = p.busy;
  while (p.busy && performance.now() - t0 < 5000) await wait(30);
  const locked = (performance.now() - t0) / 1000;
  await wait(200);
  return {
    embersNow: torch.embers, taken: ember.taken,
    lockedForSeconds: +locked.toFixed(2), engagedGather: wasBusy,
    revealRadius: +torch.revealRadius.toFixed(2),
    stateAfter: p.state, errors: errs,
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "embersNow": 1,
  "taken": true,
  "lockedForSeconds": 1.28,
  "engagedGather": true,
  "revealRadius": 3.22,
  "stateAfter": "Idle",
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs = []; const orig = console.error;\n  console.error = (...a) => { errs.push(a.map(String).join(\' \').slice(0,200)); orig(...a); };\n\n  // real pickup: walk onto an ember and time how long control is locked\n  const { grid, player: p, props, torch } = g;\n  const ember = props.items.find(i => i.level === 0 && i.spec.kind === \'ember\');\n  const w = grid.tileToWorld(0, ember.tx, ember.ty);\n  p.pos.set(w.x, grid.floorHeight(0, w.x, w.z), w.z); p.root.position.copy(p.pos);\n  const t0 = performance.now();\n  await wait(60);\n  const wasBusy = p.busy;\n  while (p.busy && performance.now() - t0 < 5000) await wait(30);\n  const locked = (performance.now() - t0) / 1000;\n  await wait(200);\n  return {\n    embersNow: torch.embers, taken: ember.taken,\n    lockedForSeconds: +locked.toFixed(2), engagedGather: wasBusy,\n    revealRadius: +torch.revealRadius.toFixed(2),\n    stateAfter: p.state, errors: errs,\n  };\n}');
``​`
```
</details>

1.28s lock, ember collected, radius grows, returns to Idle cleanly. Writing the README:

**`Bash`** — Write README
```bash
cat > README.md <<'EOF'
# Torchboy — The Deep Hollow

An isometric cavern crawler that runs in the browser. You are a small boy with an
enormous head and a mohawk, carrying a torch through three levels of unlit cave.
Hidden passages are sealed behind rock that looks exactly like every other wall —
your torch is the instrument that finds them.

All art is generated in **Blender** by script and exported to glTF; the game runs
on **three.js**.

``​`bash
npm install
npm run dev        # http://localhost:5173
``​`

Assets are committed, so `npm run dev` works without Blender. To regenerate them:

``​`bash
npm run assets     # headless Blender -> public/models/*.glb
npm run levels     # regenerate + validate the level grids only
``​`

---

## The idea

The torch does not burn out. Its job is **discovery**: as an undiscovered passage
comes into range the flame stirs, flares, and cools from amber toward blue-white.
Hunting a secret is a hot-and-cold game you play by watching your own light,
rather than by walking into every wall in the cave.

**Embers** scattered through the cavern permanently widen that sense (on a
`sqrt` curve — a linear bonus would grow the radius past 12 units and pop every
secret on the level without the player ever hunting for one).

---

## Architecture

### One source of truth for the level

`public/data/levels.json` is generated by `tools/gen_levels.mjs` and consumed by
**both** `blender/build_cavern.py` (geometry) and `src/game/Grid.js` (collision,
secrets, floor height). Nothing about the layout is authored twice, so the mesh
you see and the wall you bump into cannot drift apart.

The floor-height hash is a deliberate line-by-line port between Python and JS and
is verified to produce bit-identical values — otherwise the player floats above
or sinks into the ground Blender built.

### Generating caves

Caves are carved by cellular automata, then features are placed on the result.
CA smoothing reliably merges all open space into one blob, so natural sealed
pockets are rare — **secret rooms are carved deliberately** into solid rock and
each carve is *verified* to be unreachable while its `S` wall is treated as
solid, and rolled back if it leaks.

`t
… [truncated]
```
<details><summary>result</summary>

```
     133 README.md
BUILD_OK
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // frame a wide open chamber for a hero shot
  const secret = [...cav.secrets.values()].find(s => s.level === 0);
  const w = grid.tileToWorld(0, secret.tx, secret.ty);
  let spot = null;
  for (let a = 0; a < 64 && !spot; a++) {
    const ang = (a / 64) * Math.PI * 2;
    const tx = Math.round((w.x + Math.cos(ang) * 5.5) / grid.tileSize + grid.W/2 - 0.5);
    const ty = Math.round((w.z + Math.sin(ang) * 5.5) / grid.tileSize + grid.H/2 - 0.5);
    // want somewhere with open space around it
    let open = 0;
    for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++)
      if (!grid.isSolid(0, tx+dx, ty+dy, cav.revealed)) open++;
    if (open > 18) spot = { tx, ty };
  }
  if (spot) { p.placeAt(0, spot.tx, spot.ty); g.cam.follow(p.pos, 0, true); }
  await wait(600);
  return { proximity: +g.torch.proximity.toFixed(2), placed: !!spot };
}
```
<details><summary>result</summary>

```
### Result
{
  "proximity": 0.61,
  "placed": true
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // frame a wide open chamber for a hero shot\n  const secret = [...cav.secrets.values()].find(s => s.level === 0);\n  const w = grid.tileToWorld(0, secret.tx, secret.ty);\n  let spot = null;\n  for (let a = 0; a < 64 && !spot; a++) {\n    const ang = (a / 64) * Math.PI * 2;\n    const tx = Math.round((w.x + Math.cos(ang) * 5.5) / grid.tileSize + grid.W/2 - 0.5);\n    const ty = Math.round((w.z + Math.sin(ang) * 5.5) / grid.tileSize + grid.H/2 - 0.5);\n    // want somewhere with open space around it\n    let open = 0;\n    for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++)\n      if (!grid.isSolid(0, tx+dx, ty+dy, cav.revealed)) open++;\n    if (open > 18) spot = { tx, ty };\n  }\n  if (spot) { p.placeAt(0, spot.tx, spot.ty); g.cam.follow(p.pos, 0, true); }\n  await wait(600);\n  return { proximity: +g.torch.proximity.toFixed(2), placed: !!spot };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](./hero.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as ./hero.png
await page.screenshot({
  path: './hero.png',
  scale: 'css',
  type: 'png'
});
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-08-30-773Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-08-30-773Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-08-30-773Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

**`Bash`** — Save project memory
```bash
M=~/.claude/projects/-Users-apshoemaker-proj-me-learn-blender-mcp/memory
cat > $M/cavern-game-project.md <<'EOF'
---
name: cavern-game-project
description: Torchboy cavern game at ~/proj/me/learn/blender-mcp/cavern-game — Blender-scripted assets + three.js; design centres on discovery, not resource management.
metadata:
  type: project
---

Started 2026-09-06. `~/proj/me/learn/blender-mcp/cavern-game` is an isometric browser game
(three.js) whose every mesh is generated by scripts in `blender/` — never hand-model or
hand-edit the `.glb` files, regenerate with `npm run assets` (headless Blender).

Design intent, which is NOT derivable from the code: the original brief had a torch that
burned out and needed refuelling; the user **explicitly cut that** mid-build in favour of
pure discoverability. The torch is now permanent and acts as a *detector* — it cools toward
blue as an undiscovered passage nears. Do not reintroduce survival/resource pressure.

The user steers art direction in small mid-turn corrections (spherical head → mohawk →
smaller eyes + expressive brows). Expect iteration on the character rather than one-shot
approval, and keep `build_character.py` easy to re-run.

**Why:** the fuel mechanic and the discovery mechanic pull in opposite directions — one
punishes exploring, the other rewards it.

**How to apply:** when adding features, ask whether they deepen *finding things*. See
[[blender-official-mcp-setup]] for the MCP plumbing that drives the live Blender session.
EOF
grep -q "cavern-game-project" $M/MEMORY.md || echo "- [Torchboy cavern game](cavern-game-project.md) — Blender-scripted three.js game; discovery-focused, no resource mechanics" >> $M/MEMORY.md
cat $M/MEMORY.md
```
<details><summary>result</summary>

```
- [Blender official MCP setup](blender-official-mcp-setup.md) — official server is a repo clone, not `uvx blender-mcp`; needs an mcp<2 pin
- [Torchboy cavern game](cavern-game-project.md) — Blender-scripted three.js game; discovery-focused, no resource mechanics
```
</details>

Two good catches. The glow artifact has two causes I can see: `light.distance` creates a hard cutoff circle, and the halo sprite grows large enough to intersect the floor and get clipped into a straight edge. Fixing both, then reworking the wall geometry:

**`Bash`** — Fix torch light cutoff and halo clipping
```bash
python3 - <<'PYEOF'
p='src/game/Torch.js'; s=open(p).read()

s = s.replace("    this.light = new THREE.PointLight(0xffb066, 0, 26, 1.55);",
'''    // distance = 0 on purpose. A non-zero cutoff makes three.js window the
    // falloff to zero at that radius, which draws a hard-edged disc of light on
    // the floor. Pure inverse-square (decay 2) has no edge at all.
    this.light = new THREE.PointLight(0xffb066, 0, 0, 2.0);''',1)

s = s.replace('''    const glow = 1 + this.embers * 0.10;
    this.light.intensity = (17 + p * 16) * glow * this._flick;
    this.light.distance = (14 + p * 4) * glow;''',
'''    const glow = 1 + this.embers * 0.10;
    // inverse-square needs a much larger number than a windowed light did
    this.light.intensity = (52 + p * 40) * glow * this._flick;''',1)

s = s.replace('''    this.halo.material.opacity = (0.72 + p * 0.28) * this._flick;
    this.halo.scale.setScalar((1.55 + p * 0.9) * this._flick);''',
'''    // The halo is kept small deliberately: the flame sits ~0.9 above the floor,
    // and a sprite wide enough to reach the ground gets sliced by it into a
    // hard straight edge. The light, not the sprite, carries the glow.
    this.halo.material.opacity = (0.55 + p * 0.22) * this._flick;
    this.halo.scale.setScalar(Math.min(1.15, (0.82 + p * 0.28) * this._flick));''',1)

s = s.replace('''    g.addColorStop(0, 'rgba(255,245,225,1)');
    g.addColorStop(0.25, 'rgba(255,190,120,0.55)');
    g.addColorStop(1, 'rgba(255,140,60,0)');''',
'''    // a long, gentle ramp - a tight bright core reads as an opaque blob and
    // hides the cave behind it instead of glowing over it
    g.addColorStop(0.00, 'rgba(255,248,232,0.85)');
    g.addColorStop(0.12, 'rgba(255,226,178,0.55)');
    g.addColorStop(0.30, 'rgba(255,186,110,0.26)');
    g.addColorStop(0.55, 'rgba(255,150,70,0.09)');
    g.addColorStop(0.78, 'rgba(255,130,55,0.025)');
    g.addColorStop(1.00, 'rgba(255,120,45,0)');''',1)
s = s.replace("    const s = 128;\n    const c = document.createElement('canvas');",
              "    const s = 256;                    // more room for a smooth ramp\n    const c = document.createElement('canvas');",1)
open(p,'w').write(s); print('t
… [truncated]
```
<details><summary>result</summary>

```
torch glow reworked
24:    // distance = 0 on purpose. A non-zero cutoff makes three.js window the
84:    this.light.intensity = (52 + p * 40) * glow * this._flick;
97:    this.halo.scale.setScalar(Math.min(1.15, (0.82 + p * 0.28) * this._flick));
```
</details>

Understood — floors too. That means changing the floor lattice, which is bit-matched to the JS port, so I'll update both sides and re-verify parity.

**`Bash`** — Rewrite slab builder with sub-lattice and organic banding
```bash
python3 - <<'PYEOF'
p='blender/build_cavern.py'; s=open(p).read()

# ---- constants
s = s.replace('''FLOOR_D = 0.75                  # floor slab thickness''',
'''FLOOR_D = 0.75                  # floor slab thickness
# Both surfaces are built on a lattice SUB times finer than the tile grid.
# One vertex per tile makes unmistakably geometric, tiled-looking rock; at 2x
# the silhouette breaks up enough to read as carved stone.
# FLOOR_SUB is mirrored in src/game/Grid.js and MUST stay in sync - the player
# stands on the surface this function defines.
FLOOR_SUB = 2
WALL_SUB = 2''',1)

# ---- height fields now take SUB-lattice coords
s = s.replace('''def floor_z(cx, cy):
    """Gentle undulation so the cave floor is not a flat plane."""
    return (hsh(cx, cy, 11) - 0.5) * 0.20 + \\
           math.sin(cx * 0.45) * 0.055 + math.cos(cy * 0.38) * 0.055


def wall_z(cx, cy):
    """Ragged rock tops. Large variance is what stops walls reading as a wall."""
    return WALL_H + (hsh(cx, cy, 29) - 0.5) * 1.15 + \\
           math.sin(cx * 0.7 + cy * 0.4) * 0.22''',
'''def floor_z(cx, cy):
    """Floor height at a FLOOR_SUB-lattice corner. Ported verbatim to JS."""
    x, y = cx / FLOOR_SUB, cy / FLOOR_SUB
    return (hsh(cx, cy, 11) - 0.5) * 0.30 \\
        + math.sin(x * 0.62) * 0.105 + math.cos(y * 0.51) * 0.105 \\
        + math.sin((x + y) * 1.17) * 0.075 \\
        + math.cos((x - y * 1.4) * 0.83) * 0.06


def floor_at(tx, ty):
    """Floor height at a tile centre. With FLOOR_SUB=2 the centre lands exactly
    on a lattice corner, so props sit on the surface with no interpolation."""
    return floor_z(tx * FLOOR_SUB + FLOOR_SUB // 2, ty * FLOOR_SUB + FLOOR_SUB // 2)


def wall_z(cx, cy):
    """Ragged rock tops on the WALL_SUB lattice. Layered octaves rather than one
    hash: a single frequency reads as evenly-spiked noise, not as rock."""
    x, y = cx / WALL_SUB, cy / WALL_SUB
    return WALL_H + (hsh(cx, cy, 29) - 0.5) * 1.30 \\
        + math.sin(x * 0.7 + y * 0.4) * 0.42 \\
        + math.cos(x * 1.63 - y * 1.21) * 0.26 \\
        + math.sin((x + y) * 2.7) * 0.13''',1)

# ---- slab builder: sub-lattice, height-varying inset, optional mid band
s = s.replace('''
… [truncated]
```
<details><summary>result</summary>

```
build_cavern: sub-lattice slabs
39:# FLOOR_SUB is mirrored in src/game/Grid.js and MUST stay in sync - the player
41:FLOOR_SUB = 2
42:WALL_SUB = 2
85:    """Floor height at a FLOOR_SUB-lattice corner. Ported verbatim to JS."""
86:    x, y = cx / FLOOR_SUB, cy / FLOOR_SUB
93:def floor_at(tx, ty):
94:    """Floor height at a tile centre. With FLOOR_SUB=2 the centre lands exactly
96:    return floor_z(tx * FLOOR_SUB + FLOOR_SUB // 2, ty * FLOOR_SUB + FLOOR_SUB // 2)
100:    """Ragged rock tops on the WALL_SUB lattice. Layered octaves rather than one
102:    x, y = cx / WALL_SUB, cy / WALL_SUB
```
</details>

Now wiring the new slab params through, adding boulders to break the floor/wall junction, and updating the decoration to use the new floor:

**`Bash`** — Add boulders and wire sub-lattice params
```bash
python3 - <<'PYEOF'
p='blender/build_cavern.py'; s=open(p).read()

# decoration sits on the new floor
s = s.replace("            hgt = 0.5 + hsh(x, y, 41) * 1.1\n            r = 0.16 + hsh(x, y, 43) * 0.16\n            off = (hsh(x, y, 45) - 0.5) * TS * 0.4\n            L.bm_cone(bm, r, r * 0.08, hgt,\n                      (cx + off, cy - off, floor_z(x, y) + hgt / 2 - 0.05),\n                      segments=6)",
"            hgt = 0.5 + hsh(x, y, 41) * 1.1\n            r = 0.16 + hsh(x, y, 43) * 0.16\n            off = (hsh(x, y, 45) - 0.5) * TS * 0.4\n            L.bm_cone(bm, r, r * 0.08, hgt,\n                      (cx + off, cy - off, floor_at(x, y) + hgt / 2 - 0.05),\n                      segments=6)",1)
s = s.replace("        base = floor_z(x, y)", "        base = floor_at(x, y)",1)

# ---- boulders: rubble along the wall line, so floor and wall do not meet in a
#      clean seam. Cheap, and the single biggest cue that a space was eroded.
s = s.replace("def add_crystals(bm, g, level):",
'''def add_boulders(bm, g, level):
    """Rounded rubble piled where the floor meets rock.

    A perfectly clean floor/wall seam is what makes a tile-built cave read as
    architecture. Breaking that line does more for the illusion than any amount
    of extra detail on the walls themselves.
    """
    n = 0
    for y in range(g.h):
        for x in range(g.w):
            if g.at(x, y) != '.':
                continue
            touching = sum(g.solid(x + dx, y + dy)
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                                          (1, 1), (-1, -1), (1, -1), (-1, 1)))
            if not touching or hsh(x, y, 500 + level) > 0.30:
                continue
            cx, cy = tile_centre(x, y)
            base = floor_at(x, y)
            for k in range(1 + int(hsh(x, y, 510 + k if False else 510) * 2)):
                r = 0.20 + hsh(x, y, 520 + k) * 0.36
                ax = (hsh(x, y, 530 + k) - 0.5) * TS * 0.75
                ay = (hsh(x, y, 540 + k) - 0.5) * TS * 0.75
                verts = L.bm_sphere(bm, r, (cx + ax, cy + ay, base + r * 0.42),
                                    subdiv=1,
                    
… [truncated]
```
<details><summary>result</summary>

```
boulders + wiring
syntax ok
```
</details>

One bug in that boulder loop — it references `k` inside the `range()` that defines it. Cleaning up:

**`Bash`** — Mirror new floor field into JS Grid
```bash
python3 - <<'PYEOF'
p='blender/build_cavern.py'; s=open(p).read()
s = s.replace("            for k in range(1 + int(hsh(x, y, 510 + k if False else 510) * 2)):",
              "            for k in range(1 + int(hsh(x, y, 510) * 2)):",1)
open(p,'w').write(s); print('fixed boulder count')
PYEOF
# now mirror the floor field into the JS side
python3 - <<'PYEOF'
p='src/game/Grid.js'; s=open(p).read()
s = s.replace('''  /** Port of floor_z(): corner height of the floor lattice. */
  static cornerZ(cx, cy) {
    return (Grid.hsh(cx, cy, 11) - 0.5) * 0.20
      + Math.sin(cx * 0.45) * 0.055
      + Math.cos(cy * 0.38) * 0.055;
  }

  /** Bilinear floor height at a world position, so the player hugs the ground. */
  floorHeight(level, x, z) {
    const fx = x / this.tileSize + this.W / 2;
    const fz = z / this.tileSize + this.H / 2;
    const cx = Math.floor(fx), cy = Math.floor(fz);''',
'''  /**
   * Port of floor_z(). Evaluated on a lattice FLOOR_SUB times finer than the
   * tile grid - must stay in sync with FLOOR_SUB in blender/build_cavern.py or
   * the player walks above or inside the ground that Blender built.
   */
  static cornerZ(cx, cy) {
    const x = cx / Grid.FLOOR_SUB, y = cy / Grid.FLOOR_SUB;
    return (Grid.hsh(cx, cy, 11) - 0.5) * 0.30
      + Math.sin(x * 0.62) * 0.105
      + Math.cos(y * 0.51) * 0.105
      + Math.sin((x + y) * 1.17) * 0.075
      + Math.cos((x - y * 1.4) * 0.83) * 0.06;
  }

  /** Bilinear floor height at a world position, so the player hugs the ground. */
  floorHeight(level, x, z) {
    const S = Grid.FLOOR_SUB;
    const fx = (x / this.tileSize + this.W / 2) * S;
    const fz = (z / this.tileSize + this.H / 2) * S;
    const cx = Math.floor(fx), cy = Math.floor(fz);''',1)
s = s.replace("export class Grid {\n  constructor(doc) {",
              "export class Grid {\n  /** Mirrors FLOOR_SUB in blender/build_cavern.py. */\n  static FLOOR_SUB = 2;\n\n  constructor(doc) {",1)
open(p,'w').write(s); print('Grid.js floor field updated')
PYEOF
grep -n "FLOOR_SUB" src/game/Grid.js
```
<details><summary>result</summary>

```
fixed boulder count
Grid.js floor field updated
16:  /** Mirrors FLOOR_SUB in blender/build_cavern.py. */
17:  static FLOOR_SUB = 2;
76:   * Port of floor_z(). Evaluated on a lattice FLOOR_SUB times finer than the
77:   * tile grid - must stay in sync with FLOOR_SUB in blender/build_cavern.py or
81:    const x = cx / Grid.FLOOR_SUB, y = cy / Grid.FLOOR_SUB;
91:    const S = Grid.FLOOR_SUB;
```
</details>

Rebuilding the cavern and re-verifying that the Python and JS floor fields still agree exactly:

**`Bash`** — Rebuild cavern with organic geometry
```bash
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" --background --factory-startup --python blender/build_cavern.py 2>&1 | grep -iE "error|traceback|Error" | head -10
echo "--- glb ---"
ls -lh public/models/cavern.glb
node -e "
const b=require('fs').readFileSync('public/models/cavern.glb');
const j=JSON.parse(b.slice(20,20+b.readUInt32LE(12)).toString());
let tris=0;
for (const m of j.meshes) for (const p of m.primitives) tris += j.accessors[p.indices].count/3;
console.log('meshes', j.meshes.length, '| total tris', tris);
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
--- glb ---
-rw-r--r--@ 1 apshoemaker  staff   3.0M Sep  6 09:12 public/models/cavern.glb
meshes 20 | total tris 70728
```
</details>

**`Bash`** — Verify Python/JS floor field parity
```bash
SP=<scratch>
cat > $SP/parity.mjs <<'EOF'
import { Grid } from '~/proj/me/learn/blender-mcp/cavern-game/src/game/Grid.js';
const pts = [[0,0],[1,1],[7,3],[19,25],[40,32],[13,47],[63,5]];
console.log(pts.map(([a,b]) => Grid.cornerZ(a,b).toFixed(10)).join('\n'));
EOF
echo "=== JS ==="; node $SP/parity.mjs
echo "=== PY ==="
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-expr "
import math
FLOOR_SUB=2
def hsh(x,y,salt=0):
    n=(x*374761393+y*668265263+salt*2654435761)&0xFFFFFFFF
    n=((n^(n>>13))*1274126177)&0xFFFFFFFF
    return ((n^(n>>16))&0xFFFFFFFF)/0xFFFFFFFF
def floor_z(cx,cy):
    x,y=cx/FLOOR_SUB,cy/FLOOR_SUB
    return (hsh(cx,cy,11)-0.5)*0.30+math.sin(x*0.62)*0.105+math.cos(y*0.51)*0.105+math.sin((x+y)*1.17)*0.075+math.cos((x-y*1.4)*0.83)*0.06
for a,b in [(0,0),(1,1),(7,3),(19,25),(40,32),(13,47),(63,5)]:
    print('%.10f'%floor_z(a,b))
" 2>/dev/null | grep -E "^-?0\.|^-?[0-9]\."
```
<details><summary>result</summary>

```
=== JS ===
0.1633010848
0.1742501950
0.1085509340
0.2328456085
-0.2125041701
-0.1550637664
0.2291832191
=== PY ===
0.1633010848
0.1742501950
0.1085509340
0.2328456085
-0.2125041701
-0.1550637664
0.2291832191
```
</details>

Parity holds exactly. Now the visual result:

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-12-38-182Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // find an open chamber to judge the new rock
  let spot = null, bestOpen = 0;
  for (let ty = 4; ty < grid.H - 4; ty += 1)
    for (let tx = 4; tx < grid.W - 4; tx += 1) {
      if (grid.isSolid(0, tx, ty, cav.revealed)) continue;
      let open = 0;
      for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++)
        if (!grid.isSolid(0, tx+dx, ty+dy, cav.revealed)) open++;
      if (open > bestOpen) { bestOpen = open; spot = { tx, ty }; }
    }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  await wait(700);
  return { spot, openness: bestOpen, footY: +p.pos.y.toFixed(3),
           tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls };
}
```
<details><summary>result</summary>

```
### Result
{
  "spot": {
    "tx": 15,
    "ty": 7
  },
  "openness": 49,
  "footY": -0.013,
  "tris": 55468,
  "calls": 35
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // find an open chamber to judge the new rock\n  let spot = null, bestOpen = 0;\n  for (let ty = 4; ty < grid.H - 4; ty += 1)\n    for (let tx = 4; tx < grid.W - 4; tx += 1) {\n      if (grid.isSolid(0, tx, ty, cav.revealed)) continue;\n      let open = 0;\n      for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++)\n        if (!grid.isSolid(0, tx+dx, ty+dy, cav.revealed)) open++;\n      if (open > bestOpen) { bestOpen = open; spot = { tx, ty }; }\n    }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  await wait(700);\n  return { spot, openness: bestOpen, footY: +p.pos.y.toFixed(3),\n           tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-12-51-739Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-12-51-739Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-12-51-739Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Big win on the glow — soft falloff, no hard edge, background reads through it. But the floor now reads as a checkerboard quilt: flat-shading a gently rolling surface on a regular grid makes every facet a distinct diamond. Smooth-shading the floor while keeping rock faceted:

**`Bash`** — Smooth-shade floor, calm noise, rebuild
```bash
python3 - <<'PYEOF'
p='blender/build_cavern.py'; s=open(p).read()

s = s.replace('''def finish(bm, name, col, mat):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False          # flat facets - the chunky, readable look
    ob = bpy.data.objects.new(name, me)''',
'''def finish(bm, name, col, mat, smooth=False):
    """`smooth` matters more than it looks.

    The floor is a gently rolling surface on a perfectly regular lattice, so
    flat-shading it turns every cell into its own facet and the ground reads as
    a diamond quilt - far MORE geometric than the flat plane it replaced. It
    needs smooth normals. Rock is the opposite: faceted is exactly right.
    """
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)''',1)

s = s.replace('        fob = finish(bm, f"L{i}_floor", col, floor_m)',
              '        fob = finish(bm, f"L{i}_floor", col, floor_m, smooth=True)',1)
s = s.replace('        cob = finish(bm, f"L{i}_crystal", col, crystal_m) if cpts else None',
              '        cob = finish(bm, f"L{i}_crystal", col, crystal_m) if cpts else None',1)

# calm the per-vertex spike, lean on the smooth octaves instead
s = s.replace('''    return (hsh(cx, cy, 11) - 0.5) * 0.30 \\
        + math.sin(x * 0.62) * 0.105 + math.cos(y * 0.51) * 0.105 \\
        + math.sin((x + y) * 1.17) * 0.075 \\
        + math.cos((x - y * 1.4) * 0.83) * 0.06''',
'''    return (hsh(cx, cy, 11) - 0.5) * 0.15 \\
        + math.sin(x * 0.62) * 0.125 + math.cos(y * 0.51) * 0.125 \\
        + math.sin((x + y) * 1.17) * 0.085 \\
        + math.cos((x - y * 1.4) * 0.83) * 0.07''',1)
open(p,'w').write(s); print('floor smooth-shaded + calmer noise')
PYEOF
python3 - <<'PYEOF'
p='src/game/Grid.js'; s=open(p).read()

… [truncated]
```
<details><summary>result</summary>

```
floor smooth-shaded + calmer noise
Grid.js mirrored
-rw-r--r--@ 1 apshoemaker  staff   2.4M Sep  6 09:13 public/models/cavern.glb
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-13-28-064Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot = null, best = 0;
  for (let ty = 4; ty < grid.H - 4; ty++)
    for (let tx = 4; tx < grid.W - 4; tx++) {
      if (grid.isSolid(0, tx, ty, cav.revealed)) continue;
      let open = 0;
      for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++)
        if (!grid.isSolid(0, tx+dx, ty+dy, cav.revealed)) open++;
      if (open > best) { best = open; spot = { tx, ty }; }
    }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  await wait(700);
  return { footY: +p.pos.y.toFixed(3), tris: g.renderer.info.render.triangles };
}
```
<details><summary>result</summary>

```
### Result
{
  "footY": -0.051,
  "tris": 55468
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot = null, best = 0;\n  for (let ty = 4; ty < grid.H - 4; ty++)\n    for (let tx = 4; tx < grid.W - 4; tx++) {\n      if (grid.isSolid(0, tx, ty, cav.revealed)) continue;\n      let open = 0;\n      for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++)\n        if (!grid.isSolid(0, tx+dx, ty+dy, cav.revealed)) open++;\n      if (open > best) { best = open; spot = { tx, ty }; }\n    }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  await wait(700);\n  return { footY: +p.pos.y.toFixed(3), tris: g.renderer.info.render.triangles };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-13-40-976Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-13-40-976Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-13-40-976Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Checkerboard is gone — the floor reads as rolling cave ground and the glow is soft. Let me look closely at the rock itself:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // count boulder/deco geometry actually present
  let deco = 0, floorTris = 0, rockTris = 0;
  cav.root.traverse(o => {
    if (!o.isMesh) return;
    const t = o.geometry.index ? o.geometry.index.count/3 : 0;
    if (o.name === 'L0_deco') deco = t;
    if (o.name === 'L0_floor') floorTris = t;
    if (o.name === 'L0_rock') rockTris = t;
  });
  // stand tight against a wall and zoom in to judge the rock face
  let spot = null;
  for (let ty = 4; ty < grid.H-4 && !spot; ty++)
    for (let tx = 4; tx < grid.W-4 && !spot; tx++) {
      if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
      let walls = 0, open = 0;
      for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++)
        (grid.isSolid(0,tx+dx,ty+dy,cav.revealed) ? walls++ : open++);
      if (walls >= 6 && open >= 12) spot = { tx, ty };
    }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.setZoom(11, innerWidth/innerHeight);   // zoom in on the rock
  g.cam.follow(p.pos, 0, true);
  await wait(600);
  return { deco, floorTris, rockTris, spot };
}
```
<details><summary>result</summary>

```
### Result
{
  "deco": 2840,
  "floorTris": 10576,
  "rockTris": 11584,
  "spot": {
    "tx": 7,
    "ty": 4
  }
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // count boulder/deco geometry actually present\n  let deco = 0, floorTris = 0, rockTris = 0;\n  cav.root.traverse(o => {\n    if (!o.isMesh) return;\n    const t = o.geometry.index ? o.geometry.index.count/3 : 0;\n    if (o.name === \'L0_deco\') deco = t;\n    if (o.name === \'L0_floor\') floorTris = t;\n    if (o.name === \'L0_rock\') rockTris = t;\n  });\n  // stand tight against a wall and zoom in to judge the rock face\n  let spot = null;\n  for (let ty = 4; ty < grid.H-4 && !spot; ty++)\n    for (let tx = 4; tx < grid.W-4 && !spot; tx++) {\n      if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n      let walls = 0, open = 0;\n      for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++)\n        (grid.isSolid(0,tx+dx,ty+dy,cav.revealed) ? walls++ : open++);\n      if (walls >= 6 && open >= 12) spot = { tx, ty };\n    }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.setZoom(11, innerWidth/innerHeight);   // zoom in on the rock\n  g.cam.follow(p.pos, 0, true);\n  await wait(600);\n  return { deco, floorTris, rockTris, spot };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-14-04-652Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-14-04-652Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-14-04-652Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Zoomed in, the rock now reads as jagged crags rather than boxes. It's a touch shard-like though — softening the top variance so walls read as eroded masses rather than spikes:

**`Bash`** — Soften wall profile and rebuild
```bash
python3 - <<'PYEOF'
p='blender/build_cavern.py'; s=open(p).read()
s = s.replace('''    return WALL_H + (hsh(cx, cy, 29) - 0.5) * 1.30 \\
        + math.sin(x * 0.7 + y * 0.4) * 0.42 \\
        + math.cos(x * 1.63 - y * 1.21) * 0.26 \\
        + math.sin((x + y) * 2.7) * 0.13''',
'''    # the per-vertex hash is kept the SMALLEST term on purpose: let it lead and
    # the wall tops become a field of shards, which is not what rock looks like.
    # The low-frequency waves do the shaping; the hash only roughens.
    return WALL_H + (hsh(cx, cy, 29) - 0.5) * 0.62 \\
        + math.sin(x * 0.55 + y * 0.33) * 0.62 \\
        + math.cos(x * 1.13 - y * 0.87) * 0.34 \\
        + math.sin((x + y) * 2.1) * 0.11''',1)
open(p,'w').write(s); print('wall profile softened')
PYEOF
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_cavern.py 2>&1 | grep -iE "^error|traceback" | head -3
ls -lh public/models/cavern.glb; npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
wall profile softened
-rw-r--r--@ 1 apshoemaker  staff   2.4M Sep  6 09:14 public/models/cavern.glb
BUILD_OK
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-14-34-490Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // a spot with a good mix of open floor and rock, near a hidden way
  const secret = [...cav.secrets.values()].find(s => s.level === 0);
  const w = grid.tileToWorld(0, secret.tx, secret.ty);
  let spot = null;
  for (let a = 0; a < 64 && !spot; a++) {
    const ang = (a/64) * Math.PI * 2;
    const tx = Math.round((w.x + Math.cos(ang)*6) / grid.tileSize + grid.W/2 - 0.5);
    const ty = Math.round((w.z + Math.sin(ang)*6) / grid.tileSize + grid.H/2 - 0.5);
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open = 0;
    for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open > 26 && open < 42) spot = { tx, ty };
  }
  if (spot) { p.placeAt(0, spot.tx, spot.ty); g.cam.follow(p.pos, 0, true); }
  await wait(700);
  return { placed: !!spot, prox: +g.torch.proximity.toFixed(2),
           tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls };
}
```
<details><summary>result</summary>

```
### Result
{
  "placed": true,
  "prox": 0.41,
  "tris": 55468,
  "calls": 35
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // a spot with a good mix of open floor and rock, near a hidden way\n  const secret = [...cav.secrets.values()].find(s => s.level === 0);\n  const w = grid.tileToWorld(0, secret.tx, secret.ty);\n  let spot = null;\n  for (let a = 0; a < 64 && !spot; a++) {\n    const ang = (a/64) * Math.PI * 2;\n    const tx = Math.round((w.x + Math.cos(ang)*6) / grid.tileSize + grid.W/2 - 0.5);\n    const ty = Math.round((w.z + Math.sin(ang)*6) / grid.tileSize + grid.H/2 - 0.5);\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open = 0;\n    for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open > 26 && open < 42) spot = { tx, ty };\n  }\n  if (spot) { p.placeAt(0, spot.tx, spot.ty); g.cam.follow(p.pos, 0, true); }\n  await wait(700);\n  return { placed: !!spot, prox: +g.torch.proximity.toFixed(2),\n           tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-14-49-147Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-14-49-147Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-14-49-147Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Both fixes landed: rock now reads as eroded masses with rubble at the base, the floor rolls smoothly, and the glow falls off softly with the cave visible through it. Final regression check on the new geometry:

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-14-58-567Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs = []; const orig = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,180)); orig(...a); };
  const { grid, player: p, props, torch, cavern: cav } = g;
  const out = {};

  // collision still holds on the new floor
  const key = (c,d) => window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  let bad = 0, maxDrift = 0;
  for (const dir of ['KeyW','KeyA','KeyS','KeyD','KeyW','KeyD']) {
    key(dir, true); await wait(450); key(dir, false);
    const t = grid.worldToTile(p.pos.x, p.pos.z);
    if (grid.isSolid(p.level, t.tx, t.ty, cav.revealed)) bad++;
    // player must sit ON the surface, not above or inside it
    maxDrift = Math.max(maxDrift, Math.abs(p.pos.y - grid.floorHeight(p.level, p.pos.x, p.pos.z)));
  }
  out.collision = { insideSolidCount: bad, maxFloorDrift: +maxDrift.toFixed(5) };

  // pickup + secret + descent still work
  const ember = props.items.find(i => i.level === 0 && i.spec.kind === 'ember');
  const w1 = grid.tileToWorld(0, ember.tx, ember.ty);
  p.pos.set(w1.x, grid.floorHeight(0,w1.x,w1.z), w1.z); p.root.position.copy(p.pos);
  await wait(1500);
  out.ember = { taken: ember.taken, embers: torch.embers };

  const s = [...cav.secrets.values()].find(x => x.level === 0);
  let ad
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "collision": {
    "insideSolidCount": 0,
    "maxFloorDrift": 0
  },
  "ember": {
    "taken": true,
    "embers": 1
  },
  "secret": {
    "opened": 1,
    "found": 1
  },
  "descend": {
    "level": 1,
    "name": "The Weeping Gallery"
  },
  "perf": {
    "tris": 49872,
    "calls": 25
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs = []; const orig = console.error;\n  console.error = (...a) => { errs.push(a.map(String).join(\' \').slice(0,180)); orig(...a); };\n  const { grid, player: p, props, torch, cavern: cav } = g;\n  const out = {};\n\n  // collision still holds on the new floor\n  const key = (c,d) => window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  let bad = 0, maxDrift = 0;\n  for (const dir of [\'KeyW\',\'KeyA\',\'KeyS\',\'KeyD\',\'KeyW\',\'KeyD\']) {\n    key(dir, true); await wait(450); key(dir, false);\n    const t = grid.worldToTile(p.pos.x, p.pos.z);\n    if (grid.isSolid(p.level, t.tx, t.ty, cav.revealed)) bad++;\n    // player must sit ON the surface, not above or inside it\n    maxDrift = Math.max(maxDrift, Math.abs(p.pos.y - grid.floorHeight(p.level, p.pos.x, p.pos.z)));\n  }\n  out.collision = { insideSolidCount: bad, maxFloorDrift: +maxDrift.toFixed(5) };\n\n  // pickup + secret + descent still work\n  const ember = props.items.find(i => i.level === 0 && i.spec.kind === \'ember\');\n  const w1 = grid.tileToWorld(0, ember.tx, ember.ty);\n  p.pos.set(w1.x, grid.floorHeight(0,w1.x,w1.z), w1.z); p.root.position.copy(p.pos);\n  await wait(1500);\n  out.ember = { taken: ember.taken, embers: torch.embers };\n\n  const s = [...cav.secrets.values()].find(x => x.level === 0);\n  let adj = null;\n  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if (!grid.isSolid(0, s.tx+dx, s.ty+dy, cav.revealed)) { adj=[s.tx+dx,s.ty+dy]; break; }\n  p.placeAt(0, adj[0], adj[1]); await wait(700);\n  out.secret = { opened: cav.revealed.size, found: g.game.found };\n\n  const d = grid.find(0,\'>\')[0]; const w2 = grid.tileToWorld(0,d.tx,d.ty);\n  let dir2 = null;\n  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if (!grid.isSolid(0, d.tx+dx, d.ty+dy, cav.revealed)) { dir2=[dx,dy]; break; }\n  p.placeAt(0, d.tx+dir2[0], d.ty+dir2[1]);\n  p.pos.x = w2.x + dir2[0]*1.5; p.pos.z = w2.z + dir2[1]*1.5; p.root.position.copy(p.pos);\n  g.game.stairLock = false; await wait(900);\n  out.descend = { level: g.game.level, name: grid.levels[g.game.level].name 
… [truncated]
```
</details>

All green — zero collision failures, zero floor drift, pickups/secrets/descent intact, no errors. Updating the README with what changed:

**`Bash`** — Update README and list final tree
```bash
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
s = s.replace('''- **Fog must be linear, not exponential.**''',
'''- **Rock and floor are built on a lattice 2x finer than the tile grid**, with
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
  small: wide enough to reach the ground, it gets sliced by the floor into a
  hard straight line.
- **Fog must be linear, not exponential.**''',1)
s = s.replace('''The floor-height hash is a deliberate line-by-line port between Python and JS and
is verified to produce bit-identical values — otherwise the player floats above
or sinks into the ground Blender built.''',
'''The floor-height field is a deliberate line-by-line port between Python and JS,
verified to produce bit-identical values — otherwise the player floats above or
sinks into the ground Blender built. `FLOOR_SUB` appears in both files and must
stay in sync.''',1)
open(p,'w').write(s); print('README updated')
PYEOF
echo "--- final tree ---"
find . -type f -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*" -not -path "./.playwright-mcp/*" | sort
echo "--- assets ---"; ls -lh public/models/
```
<details><summary>result</summary>

```
README updated
--- final tree ---
./.gitignore
./blender/__pycache__/lib_build.cpython-313.pyc
./blender/build_cavern.py
./blender/build_character.py
./blender/build_props.py
./blender/lib_build.py
./blender/preview_pose.py
./blender/preview.py
./data/levels.json
./index.html
./package-lock.json
./package.json
./public/data/levels.json
./public/favicon.svg
./public/models/cavern.glb
./public/models/props.glb
./public/models/torchboy.glb
./README.md
./src/game/Cavern.js
./src/game/Cutaway.js
./src/game/Grid.js
./src/game/HUD.js
./src/game/Input.js
./src/game/IsoCamera.js
./src/game/Player.js
./src/game/Props.js
./src/game/Torch.js
./src/main.js
./tools/build_assets.sh
./tools/gen_levels.mjs
./tools/validate_levels.mjs
--- assets ---
total 5904
-rw-r--r--@ 1 apshoemaker  staff   2.4M Sep  6 09:14 cavern.glb
-rw-r--r--@ 1 apshoemaker  staff   262K Sep  6 09:06 props.glb
-rw-r--r--@ 1 apshoemaker  staff   211K Sep  6 09:07 torchboy.glb
```
</details>

Cleaning up a stale copy of the level data left at the old path:

**`Bash`** — Remove stale data dir and verify paths
```bash
rm -rf data blender/__pycache__
printf '__pycache__/\n' >> .gitignore
grep -rn "'data/levels.json'\|\"data/levels.json\"\|/data/levels" --include=*.mjs --include=*.js --include=*.py --include=*.html . 2>/dev/null | grep -v node_modules | grep -v README
echo "--- final check ---"
node tools/gen_levels.mjs >/dev/null && node tools/validate_levels.mjs | tail -3
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
cat .gitignore
```
<details><summary>result</summary>

```
(eval):3: no matches found: --include=*.mjs
--- final check ---
  floor=456 secrets=3 gated rewards=3/8 fuel=7 crystals=14

all invariants hold
BUILD_OK
node_modules/
dist/
.playwright-mcp/
*.blend1
__pycache__/
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5180/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5180/');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T15-15-47-970Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  await new Promise(r => setTimeout(r, 400));
  return { loaded: !!g, level: g.game.level, secrets: g.game.totalSecrets,
           props: g.props.items.length, playerGrounded: Math.abs(
             g.player.pos.y - g.grid.floorHeight(0, g.player.pos.x, g.player.pos.z)) < 1e-9 };
}
```
<details><summary>result</summary>

```
### Result
{
  "loaded": true,
  "level": 0,
  "secrets": 8,
  "props": 26,
  "playerGrounded": true
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  await new Promise(r => setTimeout(r, 400));\n  return { loaded: !!g, level: g.game.level, secrets: g.game.totalSecrets,\n           props: g.props.items.length, playerGrounded: Math.abs(\n             g.player.pos.y - g.grid.floorHeight(0, g.player.pos.x, g.player.pos.z)) < 1e-9 };\n}');
``​`
```
</details>

**`playwright/browser_close`**
<details><summary>result</summary>

```
### Result
No open tabs. Navigate to a URL to create one.
### Ran Playwright code
``​`js
await page.close()
``​`
```
</details>

Done. The game is running at **http://localhost:5180** (vite is still up in the background).

## What's there

**Blender-generated assets** (`blender/*.py`, all scripted — nothing hand-modeled):
- **Torchboy** — spherical head, mohawk, small eyes, eyebrows on their own bones that set determined and bob out-of-sync with his stride. 3.4k tris, 12 bones, 3 clips.
- **The cavern** — 3 levels, geometry built from the tile grid.
- **Props** — ember flasks, treasure chests, stairs, the exit archway.

**The browser game** (three.js, orthographic isometric, ACES tone mapping).

## On your two notes

**The glow** had two separate causes. `light.distance` makes three.js window the falloff to zero at that radius, which draws a hard-edged disc on the floor — now `distance = 0` with pure inverse-square, which has no edge. Separately, the halo sprite grew wide enough to intersect the floor and get sliced into a straight line; it's now capped small, with a long gentle alpha ramp so the cave reads through it.

**The meshes** are built on a lattice 2× finer than the tile grid, with corner XY wander that *varies with height* so walls lean and bulge instead of extruding as prisms, plus rubble scattered along the floor/wall seam. One thing worth flagging: my first pass made it *worse* — flat-shading a rolling floor on a regular lattice turned every cell into its own facet and the ground became a diamond quilt. Floor is smooth-shaded now, rock stays faceted.

## Two things I'd call out

**Dropping refuel was the right call, and it changed the torch's job.** It's now a detector — it stirs, flares and cools toward blue-white as an undiscovered passage nears, so hunting is hot-and-cold rather than wall-bumping. Embers widen that sense on a `sqrt` curve; linear would have grown the radius past 12 units and popped every secret without you ever hunting.

**A validator gates the level generator.** CA smoothing merges all open space into one blob, so secret rooms are carved deliberately into rock and each carve is verified unreachable behind its wall — and rolled back if it leaks. `npm run levels` asserts the exit is reachable *without* any secret, that rewards are genuinely gated, and that every secret wall opens something new. It caught two real bugs while I was building.

On Kenney — I used the kits as a style reference (chunky proportions, flat facets) rather than importing meshes, since you asked for Blender-built artifacts. The loader is generic, so swapping real Kenney props in is straightforward if you'd rather.

Verified end-to-end in the browser: collision holds in all directions with zero floor drift, all 8 secrets gate correctly, pickups and all three descents work, win fires, 60fps at 25 draw calls, no console errors. `npm run assets` rebuilds every `.glb` headless.

One thing I left alone: `cavern.glb` is 2.4MB now (up from 828KB — the finer lattice). Fine locally, but worth Draco compression before deploying anywhere real.


---
  ·  [index](README.md)