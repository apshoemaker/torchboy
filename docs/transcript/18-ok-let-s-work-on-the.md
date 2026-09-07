# 18. ok - let's work on the leveling; I think TorchBoy needs to find all passages before he can level to the next s

[← index](README.md)

## The prompt

> ok - let's work on the leveling; I think TorchBoy needs to find all passages before he can level to the next stage as that is what more fully realizes his story.  Right now, I can level as long as I find the stairs.  Once all passages are found and all ancient knowledge is bestowed, we should be able to see the stairs and move to the next level.

## What happened

**`Bash`** — Find stairs/level transition logic
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
ls src/game/
echo "=== stairs / exit references ==="
grep -rn "stairs\|exit\|nextLevel\|levelUp\|climb" src/game/*.js src/main.js | grep -v "^Binary" | head -60
```
<details><summary>result</summary>

```
Ambience.js
Ascension.js
Bestowal.js
Cavern.js
CavernMesh.js
Choir.js
Chronicle.js
Cutaway.js
Expression.js
Grid.js
HUD.js
Input.js
IsoCamera.js
LevelGen.js
Minimap.js
Narrator.js
Player.js
Props.js
Torch.js
=== stairs / exit references ===
src/game/Ascension.js:88:  /** @param exit world position of the archway */
src/game/Ascension.js:89:  start(player, exit) {
src/game/Ascension.js:94:    this.target.set(exit.x, exit.y, exit.z);
src/game/Ascension.js:95:    this.light.position.set(exit.x, exit.y + 1.3, exit.z);
src/game/Bestowal.js:9: * with the whole thing so the cave lights up as it climbs.
src/game/Bestowal.js:20:const RISE = 1.18;        // ...and climbs
src/game/Bestowal.js:79:   * the orb behind his own body for most of the climb, so the effect was mostly
src/game/Bestowal.js:108:    // ---- core: gathers at the floor, then climbs, accelerating
src/game/Bestowal.js:134:    // it drifts toward him laterally as it climbs, so it lands on his chest
src/game/Bestowal.js:135:    // lateral drift lags the climb (cubed), so it rises first and only swings
src/game/Bestowal.js:137:    const climb = THREE.MathUtils.clamp((t - GATHER) / (RISE - GATHER), 0, 1);
src/game/Bestowal.js:138:    const lat = climb * climb * climb;
src/game/Cavern.js:54:      // staircase since the game became a climb), so a neighbouring level is
src/game/Chronicle.js:42:  climbed(levelName, remaining) {
src/game/Chronicle.js:45:      ? `he climbed up into ${levelName}; ${remaining} more before daylight`
src/game/Chronicle.js:46:      : `he climbed into ${levelName}, the last cavern before the surface`);
src/game/Grid.js:10:// '>' is the way UP and is walkable - he climbs a staircase rather than
src/game/Grid.js:120:      // the sight line climbs as it recedes toward an elevated camera
src/game/LevelGen.js:9: * The cave is climbed, not descended: level 0 is the deepest and where he
src/game/LevelGen.js:16: *   4. features (spawn, stairs, embers, crystals, treasure) placed by distance
… [truncated]
```
</details>

**`Bash`** — Read level transition in main.js
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '120,180p' src/main.js
```
<details><summary>result</summary>

```
  hud.toast('Your torch stirs near hidden ways. Climb.', 4.5);

  Object.assign(window, { __game: { scene, renderer, cam, grid, cavern, player, props, torch, game, ambience, narrator, chronicle, bestow,
    get ascension() { return ascension; },
    get minimap() { return minimap; },
    get bestowal() { return bestowal; },
    cutaway: cutawayUniforms() } });
  loop(grid, cavern, props, player, torch);
}

function enterLevel(i, grid, cavern, props, player, torch, snap) {
  game.level = i;
  const lv = grid.levels[i];
  const entry = grid.find(i, i === 0 ? 'P' : '<')[0] || grid.find(i, '.')[0];
  player.placeAt(i, entry.tx, entry.ty);
  cavern.setActiveLevel(i);
  props.setActiveLevel(i);
  // LINEAR fog, not exponential: an ortho camera views the whole scene from a
  // fixed distance, so exponential fog applies one flat tint to everything.
  // Keying near/far to the camera distance turns it back into a depth cue.
  const d = cam.distance;
  const reach = 46 - lv.fog * 380;          // denser levels close in sooner
  // fog toward near-black, not toward the ambient tint: a light fog colour
  // silhouettes every distant wall top and the cave starts reading as a
  // mountain range instead of somewhere underground
  const fogCol = new THREE.Color(lv.ambient).multiplyScalar(0.30);
  scene.fog = new THREE.Fog(fogCol, d - 16, d + reach);
  scene.background = fogCol;
  hud.setLevel(lv.name, i, grid.levels.length);
  ambience.setLevel(i);
  if (i > 0) {
    chronicle.climbed(lv.name, grid.levels.length - 1 - i);
    pendingBestow = 0.9;               // let the level settle, then bestow
  }
  hud.setFound(game.found, game.totalSecrets);
  game.stairLock = true;
  if (snap) cam.follow(player.pos, 0, true);
}

// ------------------------------------------------------------------ loop
… [truncated]
```
</details>

**`Bash`** — Trace stairLock and secret counting
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "stairLock\|totalSecrets\|game.found\|setFound\|found" src/main.js src/game/HUD.js src/game/Cavern.js src/game/Grid.js | head -40
```
<details><summary>result</summary>

```
src/game/Cavern.js:77:  /** Reveal any secret within `radius` of the player. @returns {number} newly found */
src/game/Cavern.js:79:    let found = 0;
src/game/Cavern.js:87:      found++;
src/game/Cavern.js:89:    return found;
src/main.js:75:  level: 0, found: 0, totalSecrets: 0, treasures: 0,
src/main.js:76:  stairLock: false, transition: 0, won: false, ended: false, t: 0,
src/main.js:110:  game.totalSecrets = cavern.secrets.size;
src/main.js:154:  hud.setFound(game.found, game.totalSecrets);
src/main.js:155:  game.stairLock = true;
src/main.js:197:    const found = cavern.checkReveals(game.level, player.pos.x, player.pos.z, torch.revealRadius);
src/main.js:198:    if (found) {
src/main.js:199:      game.found += found;
src/main.js:200:      hud.setFound(game.found, game.totalSecrets);
src/main.js:201:      hud.toast(found > 1 ? `${found} passages open!` : 'A passage opens...');
src/main.js:202:      chronicle.openedPassage(game.totalSecrets, game.found);
src/main.js:257:      chronicle.summary(game.level, grid.levels.length, game.found, torch.embers));
src/main.js:306:    if (near && !game.stairLock && game.level + 1 < grid.levels.length) {
src/main.js:311:    if (!near) game.stairLock = false;
src/main.js:313:    game.stairLock = false;
src/game/HUD.js:9:      found: document.getElementById('found'),
src/game/HUD.js:30:  setFound(found, total) {
src/game/HUD.js:31:    this.el.found.textContent = `${found}/${total}`;
```
</details>

**`Bash`** — Read secret registry and stairs proximity block
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '95,120p' src/main.js
echo "=== ...stairs block 285-320 ==="
sed -n '285,320p' src/main.js
echo "=== Cavern secrets ==="
sed -n '1,100p' src/game/Cavern.js | grep -n "secrets\|class\|constructor\|revealed" 
```
<details><summary>result</summary>

```
  const boyGltf = await load('models/torchboy.glb');
  hud.progress(0.85, 'scattering the oil');
  const propGltf = await load('models/props.glb');

  const player = new Player(boyGltf, grid);
  const props = new Props(propGltf, grid, cavern);
  const torch = new Torch(scene);

  scene.add(cavern.root, player.root, player.blob, props.group);
  props.selfCheck(grid);
  bestowal = new Bestowal(scene);
  minimap = new Minimap(grid, document.getElementById('minimap'));
  ascension = new Ascension(scene);
  torch.attachTo(player.flame || player.root, player.root);

  game.totalSecrets = cavern.secrets.size;
  enterLevel(0, grid, cavern, props, player, torch, true);

  // The story is written AS he plays, from the chronicle of what he does.
  // Beats are prefetched, so the game never waits on a generation.
  chronicle.wakes(grid.levels[0].name, 'deepest', grid.levels.length);
  narrator.start(chronicle.summary(0, grid.levels.length, 0, 0));

  hud.progress(1, 'ready');
  hud.ready();
  hud.toast('Your torch stirs near hidden ways. Climb.', 4.5);
=== ...stairs block 285-320 ===
      narrator.reveal();
      ambience.discovery();
      hud.toast('A cache of the old miners!');
    }
  }

  // --- the way out (final level)
  const exit = props.nearest(game.level, x, z, 2.2);
  if (exit && exit.spec.kind === 'exit' && !game.won) {
    game.won = true;
    hud.toast('', 0.01);
    ascension.start(player, exit.mesh.position);
    return;
… [truncated]
```
</details>

**`Bash`** — Read Props SPEC and bestowal triggers
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '1,40p' src/game/Props.js
echo "=== bestow trigger ==="
grep -n "pendingBestow\|function bestow\|bestow(" src/main.js
```
<details><summary>result</summary>

```
import * as THREE from 'three';

/**
 * Pickups and markers, cloned from props.glb onto the tiles the grid names.
 *
 * Each pickup carries its own small light: in a cave lit only by the torch, an
 * unlit pickup two tiles away is invisible, and a cache the player can never
 * see is indistinguishable from one that is not there.
 */
const SPEC = {
  // `wonder` is the radius at which the choir starts to hear this thing. Embers
  // are common, so theirs is short - a chorus that sang for all 18 of them
  // would be wallpaper. Treasure and the way out are rare, and carry further.
  F: { prop: 'Prop_Fuel', kind: 'ember', y: 0.05, bob: 0.13, spin: 0.9, glow: 0xff8a2a, glowI: 2.2, dist: 5.5, wonder: 8 },
  T: { prop: 'Prop_Treasure', kind: 'treasure', y: 0.02, bob: 0.05, spin: 0.25, glow: 0xffc65a, glowI: 2.6, dist: 6.5, wonder: 14 },
  X: { prop: 'Prop_Exit', kind: 'exit', y: 0.0, bob: 0, spin: 0, glow: 0x9fd0ff, glowI: 3.0, dist: 9, wonder: 17 },
  // he CLIMBS: '>' is the way onward and gets rising steps; '<' is the mouth
  // of the shaft he came up out of
  '>': { prop: 'Prop_StairsUp', kind: 'up', y: 0.0, bob: 0, spin: 0 },
  '<': { prop: 'Prop_StairsDown', kind: 'down', y: 0.0, bob: 0, spin: 0 },
};

export class Props {
  constructor(propsGltf, grid, cavern) {
    this.grid = grid;
    this.group = new THREE.Group();
    this.items = [];
    // Look prototypes up BY NAME, not by isMesh. A Blender object with more
    // than one material exports as several glTF primitives, which GLTFLoader
    // rebuilds as a Group - so the flask, the chest and the archway are all
    // Groups, and an isMesh filter silently drops every one of them.
    const src = {};
    for (const name of new Set(Object.values(SPEC).map((v) => v.prop))) {
      const node = propsGltf.scene.getObjectByName(name);
      if (node) src[name] = node;
    }

    for (const lv of grid.levels) {
      for (const [ch, spec] of Object.entries(SPEC)) {
        for (const { tx, ty } of grid.find(lv.index, ch)) {
… [truncated]
```
</details>

**`Bash`** — Read reveal handler and Props internals
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '190,225p' src/main.js
echo "=== Props.items shape + setActiveLevel ==="
sed -n '40,110p' src/game/Props.js
```
<details><summary>result</summary>

```
    const camDir = cam.basis().fwd;                // points camera -> player
    setCutawayActive(
      grid.viewBlocked(game.level, player.pos.x, player.pos.z,
                       -camDir.x, -camDir.z, Math.tan(cam.elevation),
                       player.pos.y + 1.15, cavern.revealed),
      dt);

    const found = cavern.checkReveals(game.level, player.pos.x, player.pos.z, torch.revealRadius);
    if (found) {
      game.found += found;
      hud.setFound(game.found, game.totalSecrets);
      hud.toast(found > 1 ? `${found} passages open!` : 'A passage opens...');
      chronicle.openedPassage(game.totalSecrets, game.found);
      player.react(1);                       // brows up, eyes wide, torch jumps
      ambience.discovery();
      bestow(player);                        // something comes up out of the floor
    }
    cavern.update(dt);
    props.update(game.t, dt);

    if (!busy) interact(grid, cavern, props, player, torch);

    // the choir hears passages AND uncollected treasure; the flame only ever
    // hears passages, so the hot/cold hunt stays unambiguous
    const wonder = Math.max(torch.proximity, props.wonder(game.level, player.pos.x, player.pos.z));
    ambience.update(dt, torch.proximity, wonder);
    hud.setSense(torch.proximity, torch.embers);
    hud.hint(torch.proximity > 0.72 && !game.won ? 'something gives here' : '');
    // a descent queues one, so it lands after the fade rather than under it
    if (pendingBestow > 0) {
      pendingBestow -= dt;
      if (pendingBestow <= 0) bestow(player);
    }
    // ---- the ending takes over completely, and does not give control back.
    // The `|| game.ended` matters: without it the normal loop resumes the frame
    // after the ascension completes and its own hud.fade(0) wipes the whiteout.
=== Props.items shape + setActiveLevel ===
        for (const { tx, ty } of grid.find(lv.index, ch)) {
          const proto = src[spec.prop];
          if (!proto) continue;
… [truncated]
```
</details>

This changes what "solvable" means — right now a secret you can't reach is harmless, but under this rule it would soft-lock the run. Let me read the generator's validation first:

**`Bash`** — Read level validation
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '330,400p' src/game/LevelGen.js
```
<details><summary>result</summary>

```
function validate(grid, isLast) {
  const g = grid.map((r) => r.split(''));
  const SOLID = new Set(['#', 'S', ' ']);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : g[y][x]);
  const find = (ch) => {
    const o = [];
    g.forEach((r, y) => r.forEach((c, x) => c === ch && o.push({ x, y })));
    return o;
  };
  // Keep every cave roughly the size the hand-tuned ones were. A bad CA roll
  // can leave a 260-tile pocket, which is playable but over in a minute.
  const floorTiles = find('.').length + find('F').length + find('*').length
    + find('T').length + find('P').length + find('<').length + find('>').length
    + find('X').length;
  if (floorTiles < 430 || floorTiles > 760) throw new Error(`floor=${floorTiles}`);
  if (find('S').length < 2) throw new Error('too few secrets');

  const entry = [...find('P'), ...find('<')];
  const exit = [...find('>'), ...find('X')];
  if (entry.length !== 1) throw new Error(`entries=${entry.length}`);
  if (exit.length !== 1) throw new Error(`exits=${exit.length}`);

  const reach = (secretsOpen) => {
    const seen = g.map((r) => r.map(() => false));
    const q = [entry[0]];
    seen[entry[0].y][entry[0].x] = true;
    for (let i = 0; i < q.length; i++) {
      const { x, y } = q[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, c = at(nx, ny);
        if ((!SOLID.has(c) || (secretsOpen && c === 'S')) && !seen[ny][nx]) {
          seen[ny][nx] = true; q.push({ x: nx, y: ny });
        }
      }
    }
    return seen;
  };
  const closed = reach(false), open = reach(true);
  // the way onward must never depend on finding a secret
  if (!closed[exit[0].y][exit[0].x]) throw new Error('exit needs a secret');
… [truncated]
```
</details>

**`Bash`** — Read reveal mechanics and radius
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '60,105p' src/game/Cavern.js
echo "=== revealRadius ==="
grep -n "revealRadius\|embers" src/game/Torch.js | head
```
<details><summary>result</summary>

```
  /**
   * Closest undiscovered secret on this level: distance AND bearing.
   * The bearing lets the character physically turn his head toward what the
   * torch is sensing, which reads far better than a HUD number.
   */
  nearestHidden(level, x, z) {
    let best = Infinity, bx = 0, bz = 0;
    for (const s of this.secrets.values()) {
      if (s.done || s.level !== level) continue;
      const w = this.grid.tileToWorld(level, s.tx, s.ty);
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < best) { best = d; bx = w.x - x; bz = w.z - z; }
    }
    return { distance: best, yaw: best === Infinity ? null : Math.atan2(bx, bz) };
  }

  /** Reveal any secret within `radius` of the player. @returns {number} newly found */
  checkReveals(level, x, z, radius) {
    let found = 0;
    for (const [key, s] of this.secrets) {
      if (s.done || s.level !== level) continue;
      const w = this.grid.tileToWorld(level, s.tx, s.ty);
      if (Math.hypot(w.x - x, w.z - z) > radius) continue;
      s.done = true;
      this.revealing.push(s);
      this.revealed.add(key);
      found++;
    }
    return found;
  }

  update(dt) {
    for (let i = this.revealing.length - 1; i >= 0; i--) {
      const s = this.revealing[i];
      s.t += dt / 0.75;
      const mat = s.mesh.material;
      if (!mat.transparent) {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.emissive = new THREE.Color(0x7fd4ff);
… [truncated]
```
</details>

**`Bash`** — Get base reveal radius and tile size
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "BASE_SENSE\|TILE\|tileToWorld" src/game/Torch.js src/game/Grid.js | head
```
<details><summary>result</summary>

```
src/game/Grid.js:50:  tileToWorld(level, tx, ty) {
src/game/Torch.js:14:const BASE_SENSE = 2.6;
src/game/Torch.js:76:  get revealRadius() { return BASE_SENSE + EMBER_SENSE * Math.sqrt(this.embers); }
```
</details>

**`Bash`** — Read tile-to-world scale
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '40,60p' src/game/Grid.js
```
<details><summary>result</summary>

```
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
      y: level * this.drop,
    };
  }

  worldToTile(x, z) {
    return {
      tx: Math.floor(x / this.tileSize + this.W / 2),
```
</details>

**`Bash`** — Get tileSize value
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "tileSize\|drop" src/game/Grid.js | head -5
```
<details><summary>result</summary>

```
21:    this.tileSize = doc.tileSize;
22:    this.drop = doc.levelDrop;
52:      x: (tx - this.W / 2 + 0.5) * this.tileSize,
53:      z: (ty - this.H / 2 + 0.5) * this.tileSize,
54:      y: level * this.drop,
```
</details>

**`Bash`** — Get tileSize from generator doc
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "tileSize\|levelDrop" src/game/LevelGen.js
```
<details><summary>result</summary>

```
402:    tileSize: 2,
404:    levelDrop: 9,
```
</details>

**`Bash`** — Read HUD, Minimap, bestow surfaces
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== HUD found label ==="; grep -n "found" index.html src/game/HUD.js
echo; echo "=== Minimap draw signature ==="; sed -n '60,105p' src/game/Minimap.js
echo; echo "=== minimap call in main ==="; grep -n "minimap" src/main.js
echo; echo "=== bestow fn ==="; sed -n '318,335p' src/main.js
echo; echo "=== Bestowal active? ==="; grep -n "active\|done\|LIFE\|update(" src/game/Bestowal.js | head
```
<details><summary>result</summary>

```
=== HUD found label ===
src/game/HUD.js:9:      found: document.getElementById('found'),
src/game/HUD.js:30:  setFound(found, total) {
src/game/HUD.js:31:    this.el.found.textContent = `${found}/${total}`;
index.html:188:    <div class="row">passages found <b id="found">0/0</b> · embers <b id="embers">0</b></div>

=== Minimap draw signature ===

  update(dt, level, pos, facing, cavern, props) {
    if (!this.ctx) return;
    this.reveal(level, pos);
    // redraw on new ground, and otherwise just often enough to move the arrow
    const now = performance.now();
    if (!this.dirty && now - this._lastDraw < 90) return;
    this._lastDraw = now;
    this.dirty = false;
    this.draw(level, pos, facing, cavern, props);
  }

  draw(level, pos, facing, cavern, props) {
    const { ctx, grid } = this;
    const seen = this.explored[level];
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // ---- the cave, only where he has been
    for (let ty = 0; ty < grid.H; ty++) {
      for (let tx = 0; tx < grid.W; tx++) {
        if (!seen[ty * grid.W + tx]) continue;
        const ch = grid.char(level, tx, ty);
        const solid = ch === '#' || ch === ' ' || ch === '>' ||
          (ch === 'S' && !cavern.revealed.has(`${level}:${tx},${ty}`));
        ctx.fillStyle = solid ? COL.wall : COL.floor;
        ctx.fillRect(tx * CELL, ty * CELL, CELL, CELL);
      }
    }

    const marker = (tx, ty, colour, size = 5) => {
      if (!seen[ty * grid.W + tx]) return;         // never spoil unseen ground
      ctx.fillStyle = colour;
      ctx.beginPath();
… [truncated]
```
</details>

Now I'll implement. First the generator invariant — under this rule an unreachable secret would soft-lock the run, and nothing currently checks for that:

**`Bash`** — Add progressive-discoverability invariant
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='src/game/LevelGen.js'; s=open(p).read()
old = """  const closed = reach(false), open = reach(true);
  // the way onward must never depend on finding a secret
  if (!closed[exit[0].y][exit[0].x]) throw new Error('exit needs a secret');"""
new = """  const closed = reach(false), open = reach(true);
  // the way onward must never depend on finding a secret
  if (!closed[exit[0].y][exit[0].x]) throw new Error('exit needs a secret');

  // EVERY secret must actually be findable, because the way onward is now
  // locked until all of them are. This is not the same as "reachable": a
  // secret is opened by standing next to it, so what has to be reachable is
  // the floor beside it - and opening one can be what puts him beside the
  // next. So walk the fixpoint the player walks: open what he can currently
  // stand next to, re-flood, repeat. A secret nobody can ever stand beside
  // would strand the run with no way up.
  const secrets = find('S');
  const opened = new Set();
  for (;;) {
    const seen = (() => {                       // reachable with what is open
      const s2 = g.map((r) => r.map(() => false));
      const q = [entry[0]];
      s2[entry[0].y][entry[0].x] = true;
      for (let i = 0; i < q.length; i++) {
        const { x, y } = q[i];
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy, c = at(nx, ny);
          const passable = !SOLID.has(c) || (c === 'S' && opened.has(`${nx},${ny}`));
          if (passable && !s2[ny][nx]) { s2[ny][nx] = true; q.push({ x: nx, y: ny }); }
        }
      }
      return s2;
    })();
    let progress = false;
    for (const { x, y } of secrets) {
      if (opened.has(`${x},${y}`)) continue;
      // the torch opens what it comes within 2.6 units of, and tiles are 2
      // wide - so an orthogonal neighbour he can stand on, and nothing less
      const beside = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy, c = at(nx, ny);
        return seen[ny] && seen[ny][nx] &&
               (!SOLID.has(c) || (c === 'S' && opened.has(`${nx},${ny}`)));
      }
… [truncated]
```
<details><summary>result</summary>

```
patched
syntax ok
```
</details>

Now measure whether that invariant is actually satisfiable — if it forces the generator past its 40-attempt budget, this is a placement problem, not a validation one:

**`Bash`** — Measure generator re-roll cost with new invariant
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > /tmp/genstats.mjs <<'EOF'
const { generateLevels } = await import('~/proj/me/learn/blender-mcp/cavern-game/src/game/LevelGen.js');
let ok = 0, fail = 0, secrets = [], t0 = Date.now();
const failures = {};
for (let i = 0; i < 200; i++) {
  try {
    const doc = generateLevels();
    ok++;
    for (const lv of doc.levels) {
      secrets.push(lv.grid.join('').split('S').length - 1);
    }
  } catch (e) { fail++; failures[e.message] = (failures[e.message]||0)+1; }
}
console.log(`${ok} runs generated, ${fail} failed, ${((Date.now()-t0)/200).toFixed(1)}ms per run`);
secrets.sort((a,b)=>a-b);
console.log(`secrets per level: min ${secrets[0]}, median ${secrets[secrets.length>>1]}, max ${secrets[secrets.length-1]}`);
if (fail) console.log('failures:', failures);
EOF
node /tmp/genstats.mjs
```
<details><summary>result</summary>

```
200 runs generated, 0 failed, 9.1ms per run
secrets per level: min 2, median 2, max 3
```
</details>

Zero re-rolls, 9.1ms — the invariant is free. Worth noting though: levels carry only **2–3 secrets each**, so gating makes that count the whole objective. Let me check how they're carved before deciding whether that's enough:

**`Bash`** — Find secret carving code
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "secret\|'S'" src/game/LevelGen.js | sed -n '1,40p'
```
<details><summary>result</summary>

```
18: * Tiles:  ' ' void  '#' rock  '.' floor  'S' secret wall  'P' spawn
110: * Deliberately carve a secret room into solid rock beside the main cave.
113: * pockets are rare - secrets cannot be left to chance. The room is only valid
186:      return { secret: hit, room: after.regions[roomLabel] };  // sealed - keep it
203:  const secrets = [];   // {x,y} wall tiles that become `S`
204:  const secretRooms = []; // pocket cell lists kept as secret rooms
231:    secrets.push(joins[Math.floor(rnd() * joins.length)]);
232:    secretRooms.push(pocket);
235:  // --- deliberately carve the remaining secrets we still owe the player
236:  for (let n = secrets.length; n < opts.secrets; n++) {
240:    secrets.push(r.secret);
241:    secretRooms.push(r.room);
253:  const secretCells = new Set(secretRooms.flat().map((c) => c.y * W + c.x));
254:  const publicCells = main.filter((c) => !secretCells.has(c.y * W + c.x));
281:  // reward inside each secret room: treasure in the largest, fuel elsewhere
282:  secretRooms.sort((a, b) => b.length - a.length);
283:  secretRooms.forEach((pocket, idx) => {
300:  for (const s of secrets) chars[s.y][s.x] = 'S';
308:      secrets: secrets.length,
309:      secretRooms: secretRooms.map((p) => p.length),
320:  { name: 'The Deep Hollow',     fill: 0.47, fuel: 5, crystals: 14, secrets: 3,
322:  { name: 'The Weeping Gallery', fill: 0.46, fuel: 4, crystals: 12, secrets: 3,
324:  { name: 'The Threshold',       fill: 0.46, fuel: 4, crystals: 10, secrets: 2,
332:  const SOLID = new Set(['#', 'S', ' ']);
345:  if (find('S').length < 2) throw new Error('too few secrets');
352:  const reach = (secretsOpen) => {
360:        if ((!SOLID.has(c) || (secretsOpen && c === 'S')) && !seen[ny][nx]) {
368:  // the way onward must never depend on finding a secret
369:  if (!closed[exit[0].y][exit[0].x]) throw new Error('exit needs a secret');
371:  // EVERY secret must actually be findable, because the way onward is now
373:  // secret is opened by standing next to it, so what has to be reachable is
376:  // stand next to, re-flood, repeat. A secret nobody can ever stand beside
378:  const secrets = find('S');
389:          const passable = !SOLID.has(c) || (c === 'S' && opened.has(`${nx},${ny}`));
396:    for (const { x, y } of secrets) {
403:               (!SOLID.has(c) || (c === 'S' && opened.has(`${nx},${ny}`)));
409:  if (opened.size !== secrets.length)
410:    throw new Error(`${secrets.length - opened.size}/${secrets.length} secrets unfindable`);
415:    if (!open[r.y][r.x]) throw new Error('reward unreachable even with secrets open');
418:  if (!
… [truncated]
```
</details>

Counts are a tunable `secrets: 3/3/2` in the level spec — I'll leave those alone for now and flag it. Now the gate itself:

**`Bash`** — Per-level counts + sealed stairs in Props
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/game/Cavern.js'; s=open(p).read()
old = """  /**
   * Closest undiscovered secret on this level: distance AND bearing."""
new = """  /**
   * How many secrets this level holds, and how many he has opened. The way
   * onward is locked until these are equal, so this is the level's objective
   * and not just a statistic.
   */
  countOn(level) {
    let total = 0, found = 0;
    for (const s of this.secrets.values()) {
      if (s.level !== level) continue;
      total++;
      if (s.done) found++;
    }
    return { total, found, complete: total > 0 && found === total };
  }

  /**
   * Closest undiscovered secret on this level: distance AND bearing."""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('cavern ok')
PY

python3 - <<'PY'
p='src/game/Props.js'; s=open(p).read()

# 1. gate flag on the way-onward items
old = """          const item = { mesh, spec, level: lv.index, tx, ty, base, taken: false, phase: (tx + ty) * 0.7 };"""
new = """          // The way onward stays out of the world until the level is finished.
          // Not just untriggerable - unseen: half the point is that he cannot
          // plan an escape past the passages he has not found yet.
          const gated = spec.kind === 'up' || spec.kind === 'exit';
          const item = { mesh, spec, level: lv.index, tx, ty, base, taken: false,
                         gated, sealed: gated, reveal: 0, phase: (tx + ty) * 0.7 };"""
assert old in s, 'MISS 1'; s = s.replace(old, new, 1)

# 2. respect it in setActiveLevel
old = """      const on = !it.taken && it.level === i;
      it.mesh.visible = on;
      if (it.light) it.light.visible = on;"""
new = """      const on = !it.taken && it.level === i && !it.sealed;
      it.mesh.visible = on;
      if (it.light) it.light.visible = on;"""
assert old in s, 'MISS 2'; s = s.replace(old, new, 1)

# 3. the unsealing
old = """  setActiveLevel(i) {"""
new = """  /**
   * Open the way onward on a level he has finished. Returns the item so the
   * caller can point the player at it; null if there was nothing sealed.
   */
  unseal(level) {
    const it = this.items.find((o)
… [truncated]
```
<details><summary>result</summary>

```
cavern ok
props ok
syntax ok
```
</details>

Now the grow-in animation and the `selfCheck` fix (sealed items would otherwise trip the "wrong level" assertion in reverse):

**`Bash`** — Read Props.update
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/^  update(t, dt)/,/^  }/p' src/game/Props.js
```
<details><summary>result</summary>

```
  update(t, dt) {
    for (const it of this.items) {
      if (it.taken || !it.mesh.visible) continue;
      const s = it.spec;
      if (s.bob) it.mesh.position.y = it.base + Math.sin(t * 1.9 + it.phase) * s.bob;
      if (s.spin) it.mesh.rotation.y += s.spin * dt;
      if (it.light) {
        it.light.position.y = it.mesh.position.y + 0.35;
        it.light.intensity = s.glowI * (0.85 + Math.sin(t * 3.1 + it.phase) * 0.15);
      }
    }
  }
```
</details>

**`Bash`** — Grow-in animation + selfCheck seal handling
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/game/Props.js'; s=open(p).read()
old = """  update(t, dt) {
    for (const it of this.items) {
      if (it.taken || !it.mesh.visible) continue;
      const s = it.spec;"""
new = """  update(t, dt) {
    for (const it of this.items) {
      if (it.taken || !it.mesh.visible) continue;
      const s = it.spec;
      // a way onward that has just been earned grows out of the floor rather
      // than popping into existence a few tiles from his feet
      if (it.reveal > 0 && it.reveal < 1) {
        it.reveal = Math.min(1, it.reveal + dt / 1.1);
        const e = 1 - Math.pow(1 - it.reveal, 3);      // ease out
        it.mesh.scale.setScalar(0.01 + 0.99 * e);
        it.mesh.position.y = it.base - (1 - e) * 0.8;
        if (it.reveal >= 1) it.mesh.position.y = it.base;
      }"""
assert old in s, 'MISS 1'; s = s.replace(old, new, 1)

# selfCheck must not flag a legitimately sealed way onward, and must not leave
# the world unsealed after probing every level.
old = """    for (let lvl = 0; lvl < grid.levels.length; lvl++) {
      this.setActiveLevel(lvl);
      for (const it of this.items)
        if (it.mesh.visible && it.level !== lvl)
          bad.push(`${it.spec.kind} from L${it.level} visible on L${lvl}`);
    }"""
new = """    // probe every level for props leaking in from a neighbouring one. The
    // sealed way onward is legitimately invisible, so lift the seals for the
    // probe and put them back - otherwise this only ever proves it is hidden.
    const sealed = this.items.filter((it) => it.sealed);
    for (const it of sealed) it.sealed = false;
    for (let lvl = 0; lvl < grid.levels.length; lvl++) {
      this.setActiveLevel(lvl);
      for (const it of this.items)
        if (it.mesh.visible && it.level !== lvl)
          bad.push(`${it.spec.kind} from L${it.level} visible on L${lvl}`);
    }
    for (const it of sealed) it.sealed = true;"""
assert old in s, 'MISS 2'; s = s.replace(old, new, 1)
open(p,'w').write(s); print('ok')
PY
node --check src/game/Props.js && echo "syntax ok"
```
<details><summary>result</summary>

```
ok
syntax ok
```
</details>

Now the minimap — a locked exit shouldn't be spoiled on the map either:

**`Bash`** — Hide sealed stairs on minimap
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/game/Minimap.js'; s=open(p).read()
old = """    // ---- things worth walking back to, but only once he has seen them
    for (const { tx, ty } of grid.find(level, '>')) marker(tx, ty, COL.stairs, 4.5);
    for (const { tx, ty } of grid.find(level, 'X')) marker(tx, ty, COL.exit, 5);"""
new = """    // ---- things worth walking back to, but only once he has seen them.
    // A way onward that is still sealed is not drawn at all: if the map showed
    // where the stairs were, the locked door would only be an inconvenience
    // rather than a reason to go and find the rest of the level.
    const sealed = props && props.isSealed(level);
    if (!sealed) {
      for (const { tx, ty } of grid.find(level, '>')) marker(tx, ty, COL.stairs, 4.5);
      for (const { tx, ty } of grid.find(level, 'X')) marker(tx, ty, COL.exit, 5);
    }"""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
node --check src/game/Minimap.js && echo "syntax ok"
grep -n "'>'" src/game/Minimap.js
```
<details><summary>result</summary>

```
ok
syntax ok
82:        const solid = ch === '#' || ch === ' ' || ch === '>' ||
103:      for (const { tx, ty } of grid.find(level, '>')) marker(tx, ty, COL.stairs, 4.5);
```
</details>

**`Bash`** — Bestowal duration and HUD API
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "DONE\|GATHER\|RISE\|ENTER" src/game/Bestowal.js | head
echo "=== HUD toast/hint api ==="; grep -n "  [a-z]*(" src/game/HUD.js | head -20
```
<details><summary>result</summary>

```
19:const GATHER = 0.38;      // light pools on the floor
20:const RISE = 1.18;        // ...and climbs
21:const ENTER = 1.32;       // ...and goes in
22:const DONE = 1.95;
72:  get active() { return this.t < DONE; }
102:    const ringP = Math.min(1, t / (GATHER * 1.6));
110:    if (t < GATHER) {
111:      const p = t / GATHER;
115:    } else if (t < RISE) {
116:      const p = (t - GATHER) / (RISE - GATHER);
=== HUD toast/hint api ===
3:  constructor() {
43:  narrate(text, kind = 'memory') {
52:  revelation(text) {
57:  toast(msg, seconds = 2.6) {
63:  hint(msg) {
74:  fade(alpha) { this.el.fade.style.opacity = alpha; }
77:  whiteout(alpha) {
87:  ending(title, text) {
95:  ready() { this.el.loading.classList.add('gone'); }
97:  progress(p, label) {
104:  update(dt) {
```
</details>

Now the main.js wiring:

**`Bash`** — Wire gating into main.js
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/main.js'; s=open(p).read()

# 1. per-level HUD counter on entering a level
old = """  hud.setFound(game.found, game.totalSecrets);
  game.stairLock = true;"""
new = """  // per-LEVEL, not the global tally: this number is now the thing standing
  // between him and the way up, so it has to say what he still owes on THIS
  // cavern rather than how far he has got overall
  const c = cavern.countOn(i);
  hud.setFound(c.found, c.total);
  game.stairLock = true;"""
assert old in s, 'MISS 1'; s = s.replace(old, new, 1)

# 2. reveal handler: per-level counter + unseal the way onward when complete
old = """    if (found) {
      game.found += found;
      hud.setFound(game.found, game.totalSecrets);
      hud.toast(found > 1 ? `${found} passages open!` : 'A passage opens...');
      chronicle.openedPassage(game.totalSecrets, game.found);
      player.react(1);                       // brows up, eyes wide, torch jumps
      ambience.discovery();
      bestow(player);                        // something comes up out of the floor
    }"""
new = """    if (found) {
      game.found += found;
      const c = cavern.countOn(game.level);
      hud.setFound(c.found, c.total);
      chronicle.openedPassage(game.totalSecrets, game.found);
      player.react(1);                       // brows up, eyes wide, torch jumps
      ambience.discovery();
      bestow(player);                        // something comes up out of the floor
      // The last passage on a level is what opens the way up. Wait for the
      // knowledge to finish entering him before the stairs rise, so the two
      // read as cause and effect rather than as two things happening at once.
      if (c.complete && props.isSealed(game.level)) {
        hud.toast(found > 1 ? `${found} passages open!` : 'The last passage opens...');
        pendingUnseal = 2.4;
      } else {
        const left = c.total - c.found;
        hud.toast(`${found > 1 ? `${found} passages open` : 'A passage opens'} — ` +
                  `${left} still hidden here`);
      }
    }"""
assert old in s, 'MISS 2'; s = s.replace(old, new, 1)

# 3. drive the unseal timer alongsid
… [truncated]
```
<details><summary>result</summary>

```
ok
syntax ok
```
</details>

**`Bash`** — Check nearest() visibility filter and hint ordering
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/nearest(/,/^  }/p' src/game/Props.js
echo "=== hint ordering in loop ==="; grep -n "hud.hint\|interact(grid" src/main.js
```
<details><summary>result</summary>

```
  nearest(level, x, z, r) {
    let best = null, bd = r * r;
    for (const it of this.items) {
      if (it.taken || it.level !== level) continue;
      const d = (it.mesh.position.x - x) ** 2 + (it.mesh.position.z - z) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
=== hint ordering in loop ===
225:    if (!busy) interact(grid, cavern, props, player, torch);
232:    hud.hint(torch.proximity > 0.72 && !game.won ? 'something gives here' : '');
287:function interact(grid, cavern, props, player, torch) {
329:      hud.hint(`the way up will not open — ${c.total - c.found} passages unfound`);
```
</details>

Two real bugs: `nearest()` doesn't actually filter sealed items (my comment claimed it did), and the loop's `hud.hint` at line 232 overwrites the one interact sets at 329. Let me check `wonder()` too — a sealed exit shouldn't be audible to the choir:

**`Bash`** — Read wonder()
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/wonder(/,/^  }/p' src/game/Props.js
```
<details><summary>result</summary>

```
  wonder(level, x, z) {
    let best = 0;
    for (const it of this.items) {
      if (it.taken || it.level !== level || !it.spec.wonder) continue;
      const d = Math.hypot(it.mesh.position.x - x, it.mesh.position.z - z);
      if (d < it.spec.wonder) best = Math.max(best, 1 - d / it.spec.wonder);
    }
    return best;
  }
```
</details>

**`Bash`** — Fix sealed filtering and hint ordering
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/game/Props.js'; s=open(p).read()
# a sealed thing is not in the world yet: not walkable-into, not audible
old = """  nearest(level, x, z, r) {
    let best = null, bd = r * r;
    for (const it of this.items) {
      if (it.taken || it.level !== level) continue;"""
new = """  nearest(level, x, z, r) {
    let best = null, bd = r * r;
    for (const it of this.items) {
      if (it.taken || it.sealed || it.level !== level) continue;"""
assert old in s, 'MISS 1'; s = s.replace(old, new, 1)

old = """      if (it.taken || it.level !== level || !it.spec.wonder) continue;"""
new = """      // a sealed way out is not in the world yet, so the choir must not sing
      // for it - otherwise the shimmer walks him to a door he cannot open
      if (it.taken || it.sealed || it.level !== level || !it.spec.wonder) continue;"""
assert old in s, 'MISS 2'; s = s.replace(old, new, 1)
open(p,'w').write(s); print('props ok')
PY

python3 - <<'PY'
p='src/main.js'; s=open(p).read()
# the loop's own hint call runs AFTER interact() and would wipe this one
old = """    if (near && props.isSealed(game.level)) {
      const c = cavern.countOn(game.level);
      hud.hint(`the way up will not open — ${c.total - c.found} passages unfound`);
    }"""
new = """    if (near && props.isSealed(game.level)) {
      const c = cavern.countOn(game.level);
      const n = c.total - c.found;
      // stash rather than set: the loop writes hud.hint after interact() runs
      game.blockedHint = `the way is shut — ${n} passage${n === 1 ? '' : 's'} still hidden here`;
    }"""
assert old in s, 'MISS 1'; s = s.replace(old, new, 1)

old = """    hud.hint(torch.proximity > 0.72 && !game.won ? 'something gives here' : '');"""
new = """    hud.hint(game.blockedHint ||
             (torch.proximity > 0.72 && !game.won ? 'something gives here' : ''));
    game.blockedHint = '';       // set again next frame if he is still standing there"""
assert old in s, 'MISS 2'; s = s.replace(old, new, 1)

old = """  stairLock: false, transition: 0, won: false, ended: false, t: 0,"""
new = """  stairLock: false, transition: 0, won: false, ended: false, t: 0, 
… [truncated]
```
<details><summary>result</summary>

```
props ok
main ok
syntax ok
```
</details>

**`Bash`** — Read Chronicle.openedPassage
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/openedPassage/,/^  }/p' src/game/Chronicle.js
```
<details><summary>result</summary>

```
  openedPassage(total, found) {
    this.sinceFind = 0;
    this.note(`he found a way sealed in the rock and opened it (${found} of ${total})`);
  }
```
</details>

**`Bash`** — Chronicle event + HUD label
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/game/Chronicle.js'; s=open(p).read()
old = """  openedPassage(total, found) {
    this.sinceFind = 0;
    this.note(`he found a way sealed in the rock and opened it (${found} of ${total})`);
  }"""
new = """  openedPassage(total, found) {
    this.sinceFind = 0;
    this.note(`he found a way sealed in the rock and opened it (${found} of ${total})`);
  }

  /**
   * He has opened everything this cavern was hiding, and the way onward has
   * appeared. Worth its own event: it is the only moment the cave gives him
   * something instead of him taking it.
   */
  exhausted(last) {
    this.sinceFind = 0;
    this.note(last
      ? 'he has left nothing here unopened, and the way out of the ground has shown itself'
      : 'he has left nothing in this cavern unopened, and a way further up has opened for him');
  }"""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY

python3 - <<'PY'
p='src/main.js'; s=open(p).read()
old = """  ambience.discovery();
  player.react(1);
  if (minimap) minimap.dirty = true;      // the marker was being withheld"""
new = """  ambience.discovery();
  player.react(1);
  chronicle.exhausted(last);              // the story should know he finished a cavern
  narrator.reveal();
  if (minimap) minimap.dirty = true;      // the marker was being withheld"""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY

python3 - <<'PY'
p='index.html'; s=open(p).read()
old = '<div class="row">passages found <b id="found">0/0</b>'
new = '<div class="row">passages here <b id="found">0/0</b>'
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
node --check src/game/Chronicle.js && node --check src/main.js && echo "syntax ok"
```
<details><summary>result</summary>

```
ok
ok
ok
syntax ok
```
</details>

Now let me actually verify the mechanic end-to-end in the browser rather than trusting it compiles:

**`Bash`** — Restart dev server
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
pkill -f vite 2>/dev/null; sleep 1
(npm run dev > /tmp/vite-dev.log 2>&1 &) ; sleep 5
grep -E "Local|error" /tmp/vite-dev.log | head -3
```
<details><summary>result</summary>

```
(eval):3: file exists: /tmp/vite-dev.log
  ➜  Local:   http://localhost:5173/
```
</details>

**`ToolSearch`**
<details><summary>result</summary>

```





```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5173/
```
<details><summary>result</summary>

```
### Error
Error: browserBackend.callTool: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
Call log:
[2m  - navigating to "http://localhost:5173/", waiting until "domcontentloaded"[22m
```
</details>

**`Bash`** — Check server state
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
tail -20 /tmp/vite-dev.log
echo "=== is anything listening? ==="
lsof -iTCP:5173 -sTCP:LISTEN 2>/dev/null | head || echo "nothing on 5173"
```
<details><summary>result</summary>

```
> cavern-game@0.1.0 dev
> vite


  VITE v7.3.6  ready in 184 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
12:59:34 PM [vite] (client) page reload src/game/LevelGen.js
1:00:21 PM [vite] (client) page reload src/game/Cavern.js
1:00:21 PM [vite] (client) page reload src/game/Props.js
1:00:43 PM [vite] (client) page reload src/game/Props.js
1:00:53 PM [vite] (client) page reload src/game/Minimap.js
1:01:24 PM [vite] (client) page reload src/main.js
1:02:00 PM [vite] (client) page reload src/game/Props.js
1:02:01 PM [vite] (client) page reload src/main.js
1:02:21 PM [vite] (client) page reload src/game/Chronicle.js
1:02:21 PM [vite] (client) page reload src/main.js
1:02:21 PM [vite] (client) page reload index.html
=== is anything listening? ===
```
</details>

The `>` redirect failed under zsh's noclobber, so the restart never actually launched:

**`Bash`** — Restart dev server properly
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
pkill -f vite 2>/dev/null; sleep 1
rm -f /tmp/vite-dev.log
(npm run dev >| /tmp/vite-dev.log 2>&1 &) ; sleep 6
lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && echo "listening on 5173" || tail -20 /tmp/vite-dev.log
```
<details><summary>result</summary>

```
listening on 5173
```
</details>

**`playwright/browser_navigate`**
```js
http://localhost:5173/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:5173/');
``​`
### Page
- Page URL: http://localhost:5173/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T19-03-07-010Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-06T19-03-06-636Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
() => new Promise((res) => {
  const t0 = Date.now();
  const tick = () => {
    const g = window.__game;
    if (g && g.grid && g.props) {
      return res({
        level: g.game.level,
        counts: g.cavern.countOn(0),
        sealed: g.props.isSealed(0),
        stairsVisible: g.props.items.filter(i => i.level===0 && (i.spec.kind==='up'||i.spec.kind==='exit'))
                          .map(i => ({kind:i.spec.kind, sealed:i.sealed, visible:i.mesh.visible})),
        foundLabel: document.getElementById('found').textContent,
      });
    }
    if (Date.now() - t0 > 30000) return res({ error: 'timeout' });
    setTimeout(tick, 300);
  };
  tick();
})
```
<details><summary>result</summary>

```
### Result
{
  "level": 0,
  "counts": {
    "total": 2,
    "found": 0,
    "complete": false
  },
  "sealed": true,
  "stairsVisible": [
    {
      "kind": "up",
      "sealed": true,
      "visible": false
    }
  ],
  "foundLabel": "0/2"
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise((res) => {\n  const t0 = Date.now();\n  const tick = () => {\n    const g = window.__game;\n    if (g && g.grid && g.props) {\n      return res({\n        level: g.game.level,\n        counts: g.cavern.countOn(0),\n        sealed: g.props.isSealed(0),\n        stairsVisible: g.props.items.filter(i => i.level===0 && (i.spec.kind===\'up\'||i.spec.kind===\'exit\'))\n                          .map(i => ({kind:i.spec.kind, sealed:i.sealed, visible:i.mesh.visible})),\n        foundLabel: document.getElementById(\'found\').textContent,\n      });\n    }\n    if (Date.now() - t0 > 30000) return res({ error: \'timeout\' });\n    setTimeout(tick, 300);\n  };\n  tick();\n})');
``​`
```
</details>

Sealed and hidden, HUD reads 0/2. Now the important test — standing on the stairs while passages remain:

**`playwright/browser_evaluate`**
```js
() => new Promise((res) => {
  const g = window.__game;
  const st = g.grid.find(0, '>')[0];
  g.player.placeAt(0, st.tx, st.ty);
  setTimeout(() => res({
    stairTile: st,
    levelAfterStandingOnStairs: g.game.level,
    hint: document.getElementById('hint') ? document.getElementById('hint').textContent : '(no #hint)',
    counts: g.cavern.countOn(0),
  }), 1500);
})
```
<details><summary>result</summary>

```
### Result
{
  "stairTile": {
    "tx": 34,
    "ty": 28
  },
  "levelAfterStandingOnStairs": 0,
  "hint": "the way is shut — 2 passages still hidden here",
  "counts": {
    "total": 2,
    "found": 0,
    "complete": false
  }
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise((res) => {\n  const g = window.__game;\n  const st = g.grid.find(0, \'>\')[0];\n  g.player.placeAt(0, st.tx, st.ty);\n  setTimeout(() => res({\n    stairTile: st,\n    levelAfterStandingOnStairs: g.game.level,\n    hint: document.getElementById(\'hint\') ? document.getElementById(\'hint\').textContent : \'(no #hint)\',\n    counts: g.cavern.countOn(0),\n  }), 1500);\n})');
``​`
```
</details>

The gate holds and explains itself. Now the unlock path — revealing both passages the way the player would:

**`playwright/browser_evaluate`**
```js
() => new Promise(async (res) => {
  const g = window.__game;
  const log = [];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const secrets = [...g.cavern.secrets.values()].filter(s => s.level === 0);
  for (const s of secrets) {
    // stand on a walkable orthogonal neighbour, as the player would have to
    const nb = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy]) => ({tx: s.tx+dx, ty: s.ty+dy}))
      .find(t => '.FT*P<>'.includes(g.grid.char(0, t.tx, t.ty)));
    if (!nb) { log.push(`secret ${s.tx},${s.ty}: NO WALKABLE NEIGHBOUR`); continue; }
    g.player.placeAt(0, nb.tx, nb.ty);
    await sleep(900);
    log.push(`secret ${s.tx},${s.ty}: done=${s.done} -> ${JSON.stringify(g.cavern.countOn(0))}`);
  }
  log.push(`right after last reveal: sealed=${g.props.isSealed(0)}`);
  await sleep(4200);   // 2.4s wait for the bestowal, then the 1.1s grow-in
  const stairs = g.props.items.find(i => i.level===0 && i.spec.kind==='up');
  res({ log,
    sealedNow: g.props.isSealed(0),
    stairs: { visible: stairs.mesh.visible, scale: +stairs.mesh.scale.x.toFixed(2), reveal: +stairs.reveal.toFixed(2) },
    toast: document.getElementById('toast')?.textContent,
    foundLabel: document.getElementById('found').textContent });
})
```
<details><summary>result</summary>

```
### Result
{
  "log": [
    "secret 23,8: done=true -> {\"total\":2,\"found\":1,\"complete\":false}",
    "secret 17,24: done=true -> {\"total\":2,\"found\":2,\"complete\":true}",
    "right after last reveal: sealed=true"
  ],
  "sealedNow": false,
  "stairs": {
    "visible": true,
    "scale": 1,
    "reveal": 1
  },
  "toast": "Nothing is hidden here now. A way up opens.",
  "foundLabel": "2/2"
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise(async (res) => {\n  const g = window.__game;\n  const log = [];\n  const sleep = (ms) => new Promise(r => setTimeout(r, ms));\n  const secrets = [...g.cavern.secrets.values()].filter(s => s.level === 0);\n  for (const s of secrets) {\n    // stand on a walkable orthogonal neighbour, as the player would have to\n    const nb = [[1,0],[-1,0],[0,1],[0,-1]]\n      .map(([dx,dy]) => ({tx: s.tx+dx, ty: s.ty+dy}))\n      .find(t => \'.FT*P<>\'.includes(g.grid.char(0, t.tx, t.ty)));\n    if (!nb) { log.push(`secret ${s.tx},${s.ty}: NO WALKABLE NEIGHBOUR`); continue; }\n    g.player.placeAt(0, nb.tx, nb.ty);\n    await sleep(900);\n    log.push(`secret ${s.tx},${s.ty}: done=${s.done} -> ${JSON.stringify(g.cavern.countOn(0))}`);\n  }\n  log.push(`right after last reveal: sealed=${g.props.isSealed(0)}`);\n  await sleep(4200);   // 2.4s wait for the bestowal, then the 1.1s grow-in\n  const stairs = g.props.items.find(i => i.level===0 && i.spec.kind===\'up\');\n  res({ log,\n    sealedNow: g.props.isSealed(0),\n    stairs: { visible: stairs.mesh.visible, scale: +stairs.mesh.scale.x.toFixed(2), reveal: +stairs.reveal.toFixed(2) },\n    toast: document.getElementById(\'toast\')?.textContent,\n    foundLabel: document.getElementById(\'found\').textContent });\n})');
``​`
```
</details>

The gate held after the first find and released only after the last. Now the transition itself and level 2's own gate:

**`playwright/browser_evaluate`**
```js
() => new Promise(async (res) => {
  const g = window.__game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const st = g.grid.find(0, '>')[0];
  g.player.placeAt(0, st.tx, st.ty);
  await sleep(1600);
  res({
    levelNow: g.game.level,
    level1: { counts: g.cavern.countOn(1), sealed: g.props.isSealed(1) },
    foundLabel: document.getElementById('found').textContent,
    levelName: document.getElementById('levelname')?.textContent ?? document.title,
    stairsL1Visible: g.props.items.filter(i => i.level===1 && (i.spec.kind==='up'||i.spec.kind==='exit'))
                        .map(i => ({kind:i.spec.kind, sealed:i.sealed, visible:i.mesh.visible})),
  });
})
```
<details><summary>result</summary>

```
### Result
{
  "levelNow": 1,
  "level1": {
    "counts": {
      "total": 3,
      "found": 0,
      "complete": false
    },
    "sealed": true
  },
  "foundLabel": "0/3",
  "levelName": "Torchboy — The Deep Hollow",
  "stairsL1Visible": [
    {
      "kind": "up",
      "sealed": true,
      "visible": false
    }
  ]
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise(async (res) => {\n  const g = window.__game;\n  const sleep = (ms) => new Promise(r => setTimeout(r, ms));\n  const st = g.grid.find(0, \'>\')[0];\n  g.player.placeAt(0, st.tx, st.ty);\n  await sleep(1600);\n  res({\n    levelNow: g.game.level,\n    level1: { counts: g.cavern.countOn(1), sealed: g.props.isSealed(1) },\n    foundLabel: document.getElementById(\'found\').textContent,\n    levelName: document.getElementById(\'levelname\')?.textContent ?? document.title,\n    stairsL1Visible: g.props.items.filter(i => i.level===1 && (i.spec.kind===\'up\'||i.spec.kind===\'exit\'))\n                        .map(i => ({kind:i.spec.kind, sealed:i.sealed, visible:i.mesh.visible})),\n  });\n})');
``​`
```
</details>

**`playwright/browser_evaluate`**
```js
() => new Promise(async (res) => {
  const g = window.__game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const log = [];
  const clearLevel = async (lvl) => {
    for (const s of [...g.cavern.secrets.values()].filter(x => x.level === lvl && !x.done)) {
      const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({tx:s.tx+dx, ty:s.ty+dy}))
        .find(t => '.FT*P<>X'.includes(g.grid.char(lvl, t.tx, t.ty)));
      if (!nb) { log.push(`L${lvl} secret ${s.tx},${s.ty} UNREACHABLE`); continue; }
      g.player.placeAt(lvl, nb.tx, nb.ty); await sleep(800);
    }
    await sleep(4200);
    log.push(`L${lvl} cleared: ${JSON.stringify(g.cavern.countOn(lvl))} sealed=${g.props.isSealed(lvl)}`);
  };
  await clearLevel(1);
  const up1 = g.grid.find(1, '>')[0];
  g.player.placeAt(1, up1.tx, up1.ty); await sleep(1600);
  log.push(`now on level ${g.game.level}, exit sealed=${g.props.isSealed(2)}, counts=${JSON.stringify(g.cavern.countOn(2))}`);

  // try to escape before clearing the last cavern
  const x = g.grid.find(2, 'X')[0];
  g.player.placeAt(2, x.tx, x.ty); await sleep(1500);
  log.push(`stood on the exit early: won=${g.game.won} (should be false)`);

  await clearLevel(2);
  g.player.placeAt(2, x.tx, x.ty); await sleep(1500);
  log.push(`stood on the exit after clearing: won=${g.game.won} (should be true)`);
  res({ log });
})
```
<details><summary>result</summary>

```
### Result
{
  "log": [
    "L1 cleared: {\"total\":3,\"found\":3,\"complete\":true} sealed=false",
    "now on level 2, exit sealed=true, counts={\"total\":2,\"found\":0,\"complete\":false}",
    "stood on the exit early: won=false (should be false)",
    "L2 cleared: {\"total\":2,\"found\":2,\"complete\":true} sealed=false",
    "stood on the exit after clearing: won=true (should be true)"
  ]
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise(async (res) => {\n  const g = window.__game;\n  const sleep = (ms) => new Promise(r => setTimeout(r, ms));\n  const log = [];\n  const clearLevel = async (lvl) => {\n    for (const s of [...g.cavern.secrets.values()].filter(x => x.level === lvl && !x.done)) {\n      const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({tx:s.tx+dx, ty:s.ty+dy}))\n        .find(t => \'.FT*P<>X\'.includes(g.grid.char(lvl, t.tx, t.ty)));\n      if (!nb) { log.push(`L${lvl} secret ${s.tx},${s.ty} UNREACHABLE`); continue; }\n      g.player.placeAt(lvl, nb.tx, nb.ty); await sleep(800);\n    }\n    await sleep(4200);\n    log.push(`L${lvl} cleared: ${JSON.stringify(g.cavern.countOn(lvl))} sealed=${g.props.isSealed(lvl)}`);\n  };\n  await clearLevel(1);\n  const up1 = g.grid.find(1, \'>\')[0];\n  g.player.placeAt(1, up1.tx, up1.ty); await sleep(1600);\n  log.push(`now on level ${g.game.level}, exit sealed=${g.props.isSealed(2)}, counts=${JSON.stringify(g.cavern.countOn(2))}`);\n\n  // try to escape before clearing the last cavern\n  const x = g.grid.find(2, \'X\')[0];\n  g.player.placeAt(2, x.tx, x.ty); await sleep(1500);\n  log.push(`stood on the exit early: won=${g.game.won} (should be false)`);\n\n  await clearLevel(2);\n  g.player.placeAt(2, x.tx, x.ty); await sleep(1500);\n  log.push(`stood on the exit after clearing: won=${g.game.won} (should be true)`);\n  res({ log });\n})');
``​`
```
</details>

**`playwright/browser_console_messages`**
<details><summary>result</summary>

```
### Result
Total messages: 4 (Errors: 0, Warnings: 0)
Returning 0 messages for level "warning"

```
</details>

No errors or warnings across the whole run. Let me confirm the build is clean and the invariant holds across many fresh seeds, not just the one I played:

**`Bash`** — Stress-test completability across 300 runs
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > /tmp/gate-check.mjs <<'EOF'
// Every level the generator will ever ship must be completable under the new
// rule: each secret must have a walkable orthogonal neighbour reachable by
// progressively opening the ones before it. Validate independently of the
// generator's own check, so a bug in that check cannot hide here.
const { generateLevels } = await import('~/proj/me/learn/blender-mcp/cavern-game/src/game/LevelGen.js');
const SOLID = new Set(['#','S',' ']);
let runs = 0, levels = 0, bad = 0, counts = [];
for (let i = 0; i < 300; i++) {
  const doc = generateLevels(); runs++;
  for (const lv of doc.levels) {
    levels++;
    const g = lv.grid.map(r => r.split(''));
    const H = g.length, W = g[0].length;
    const at = (x,y) => (x<0||y<0||x>=W||y>=H) ? '#' : g[y][x];
    let entry = null;
    g.forEach((r,y)=>r.forEach((c,x)=>{ if (c==='P'||c==='<') entry={x,y}; }));
    const S = []; g.forEach((r,y)=>r.forEach((c,x)=>c==='S'&&S.push({x,y})));
    counts.push(S.length);
    const open = new Set();
    for(;;){
      const seen = g.map(r=>r.map(()=>false)); const q=[entry]; seen[entry.y][entry.x]=true;
      for(let k=0;k<q.length;k++){const{x,y}=q[k];
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,c=at(nx,ny);
          if((!SOLID.has(c)||(c==='S'&&open.has(`${nx},${ny}`)))&&!seen[ny][nx]){seen[ny][nx]=true;q.push({x:nx,y:ny});}}}
      let prog=false;
      for(const s of S){ if(open.has(`${s.x},${s.y}`))continue;
        if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const nx=s.x+dx,ny=s.y+dy,c=at(nx,ny);
          return seen[ny]&&seen[ny][nx]&&(!SOLID.has(c)||(c==='S'&&open.has(`${nx},${ny}`)));}))
        {open.add(`${s.x},${s.y}`);prog=true;}}
      if(!prog)break;
    }
    // and once everything is open, the way onward must still be walkable to
    const seen = g.map(r=>r.map(()=>false)); const q=[entry]; seen[entry.y][entry.x]=true;
    for(let k=0;k<q.length;k++){const{x,y}=q[k];
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,c=at(nx,ny);
        if((!SOLID.has(c)||c==='S')&&!seen[ny][nx]){seen[ny][nx]=true;q.push({x:nx,y:ny});}}}
    let e
… [truncated]
```
<details><summary>result</summary>

```
300 runs / 900 levels checked — 0 uncompletable
secrets per level: 2..3, total per run 7.433333333333334
```
</details>

**`Bash`** — Build check
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
npx vite build 2>&1 | grep -E "built|error|✓" | tail -3
grep -rlE "sk-ant|wrkspc_" dist/ 2>/dev/null && echo "!!! LEAK !!!" || echo "dist clean"
```
<details><summary>result</summary>

```
✓ 27 modules transformed.
✓ built in 761ms
dist clean
```
</details>

Done — the way onward is now earned, not found. Server's still on **http://localhost:5173/**.

**How it works now**

The stairs (and on the last cavern, the exit) don't exist in the world until you've opened every passage on that level. Not just locked — not rendered, not lit, not on the minimap, and not audible to the choir. You can't plan a route past the passages you haven't found.

When the last passage on a level opens, the sequence is: passage → bestowal → *then* the stairs grow up out of the floor, ~2.4s later. Separating them makes the knowledge read as the cause and the way up as what it buys, rather than two things flashing at once.

The HUD counter is now per-level (`passages here 0/2`) instead of a global tally, since that number is the thing standing between him and the way up. Walk onto the buried stairs early and you get *"the way is shut — 2 passages still hidden here."* The chronicle gets its own event when a cavern is exhausted, so the narrator knows he finished one — it's the only moment the cave gives him something instead of him taking it.

**The part that needed guarding.** Under the old rules an unreachable secret was harmless. Now it would soft-lock the run with no way up, so I added an invariant to the generator: it walks the same fixpoint the player does — open what he can currently stand beside, re-flood, repeat — and re-rolls any level where that doesn't reach every secret. Costs nothing (0 re-rolls in 200 runs, still ~9ms). I then verified completability independently of that check across **900 generated levels: 0 uncompletable**.

Played through end-to-end in the browser: gate held at 1-of-2 found, released at 2-of-2, stairs grew in, transition worked, level 2 came up sealed at 0/3, standing on the final exit early did nothing, and after clearing it the ending fired. No console errors.

**One thing you should decide.** Levels carry only **2 / 3 / 2 secrets** (~7 per run) — that was fine when they were optional bonuses, but they're now the entire objective of each level, so a cavern is over after two finds. It's a one-line change in the level spec if you want denser exploration; I left it alone since you didn't ask. Say the word and I'll raise it and re-run the completability sweep.


---
[← 17-can-you-restart-it-then.md](17-can-you-restart-it-then.md)  ·  [index](README.md)