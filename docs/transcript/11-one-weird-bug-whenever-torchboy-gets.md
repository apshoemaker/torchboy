# 11. one weird bug - whenever TorchBoy gets close to the wall, the torch light kind of "goes through" it and then p

[← index](README.md)

## The prompt

> one weird bug - whenever TorchBoy gets close to the wall, the torch light kind of "goes through" it and then pixelates at the edges.  [Image #2]

## What happened

_(the user attached a screenshot here)_

That dither pattern is my wall-cutaway shader — nothing else in the scene dithers. But let me confirm rather than assume, since "light through the wall" could also be a shadow-map leak. Decisive test: reproduce it, then toggle the cutaway off.

**`Bash`** — Ensure dev server is running
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
curl -s -o /dev/null -w "server: %{http_code}\n" http://localhost:5180/ || {
  pkill -f vite; sleep 1; rm -f /tmp/vite.log
  (npx vite --port 5180 --strictPort >| /tmp/vite.log 2>&1 &); sleep 5
  curl -s -o /dev/null -w "server: %{http_code}\n" http://localhost:5180/
}
```
<details><summary>result</summary>

```
server: 200
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-21-10-011Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // put him hard against a wall on the camera side, which is where it shows
  let spot = null;
  for (let ty=3; ty<grid.H-3 && !spot; ty++)
    for (let tx=3; tx<grid.W-3 && !spot; tx++) {
      if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
      // solid to the south-east = between him and the camera at azimuth 45
      if (grid.isSolid(0,tx+1,ty,cav.revealed) && grid.isSolid(0,tx,ty+1,cav.revealed)
          && !grid.isSolid(0,tx-1,ty,cav.revealed)) spot = {tx,ty};
    }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.follow(p.pos, 0, true);
  await wait(900);
  return { spot, azimuthDeg: Math.round(g.cam.azimuth*180/Math.PI) };
}
```
<details><summary>result</summary>

```
### Result
{
  "spot": {
    "tx": 34,
    "ty": 4
  },
  "azimuthDeg": 45
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // put him hard against a wall on the camera side, which is where it shows\n  let spot = null;\n  for (let ty=3; ty<grid.H-3 && !spot; ty++)\n    for (let tx=3; tx<grid.W-3 && !spot; tx++) {\n      if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n      // solid to the south-east = between him and the camera at azimuth 45\n      if (grid.isSolid(0,tx+1,ty,cav.revealed) && grid.isSolid(0,tx,ty+1,cav.revealed)\n          && !grid.isSolid(0,tx-1,ty,cav.revealed)) spot = {tx,ty};\n    }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.follow(p.pos, 0, true);\n  await wait(900);\n  return { spot, azimuthDeg: Math.round(g.cam.azimuth*180/Math.PI) };\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-21-09-853Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-21-27-140Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-21-27-140Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-21-27-140Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Reproduced — the dithered halo. Now the decisive test, toggling the cutaway off:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const mod = await import('/src/game/Cutaway.js');
  const u = mod.cutawayUniforms();
  u.uCutStrength.value = 0;          // disable the dissolve entirely
  await wait(600);
  return { cutStrength: u.uCutStrength.value, cutRadius: u.uCutRadius.value };
}
```
<details><summary>result</summary>

```
### Result
{
  "cutStrength": 0,
  "cutRadius": 1.5
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const mod = await import(\'/src/game/Cutaway.js\');\n  const u = mod.cutawayUniforms();\n  u.uCutStrength.value = 0;          // disable the dissolve entirely\n  await wait(600);\n  return { cutStrength: u.uCutStrength.value, cutRadius: u.uCutRadius.value };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-21-40-989Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-21-40-989Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-21-40-989Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Confirmed — with the cutaway disabled the artifact vanishes entirely, and so does he (fully hidden). So there's no light leak; the wall occludes correctly. It's my dissolve, doing necessary work but firing far too eagerly.

The real flaw: it engages whenever rock is merely *nearer the camera* than him, whether or not it's actually hiding him. Let me gate it on real occlusion:

**`Bash`** — Add occlusion test and cutaway ramp
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Grid.js'; s=open(p).read()
s = s.replace("  // ------------------------------------------------------------ collision",
'''  /**
   * Is the player actually hidden behind rock, from a camera looking down the
   * given direction at `tanElev`?
   *
   * Marches the tile grid rather than raycasting the mesh: ~20 grid lookups
   * against ~12k triangle tests for the merged rock, and precise enough to
   * decide a visibility question. `dirX/dirZ` point FROM the player TOWARD the
   * camera, normalised on the XZ plane.
   */
  viewBlocked(level, x, z, dirX, dirZ, tanElev, headY, revealed, reach = 9) {
    const WALL_TOP = this.doc.wallHeight * 0.92;   // crown, less a small margin
    const step = this.tileSize * 0.45;
    const baseY = this.levelY(level) + WALL_TOP;
    for (let d = step; d <= reach; d += step) {
      const t = this.worldToTile(x + dirX * d, z + dirZ * d);
      if (!this.isSolid(level, t.tx, t.ty, revealed)) continue;
      // the sight line climbs as it recedes toward an elevated camera
      if (baseY > headY + d * tanElev) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ collision''',1)
open(p,'w').write(s); print('Grid.viewBlocked')

p='src/game/Cutaway.js'; s=open(p).read()
s = s.replace("""    float f = (1.0 - smoothstep(uCutRadius * 0.72, uCutRadius, r)) * uCutStrength;""",
"""    // A NARROW transition band. At 0.72 the dithered ring was ~0.4 units wide
    // and read as a field of speckle rather than a soft edge.
    float f = (1.0 - smoothstep(uCutRadius * 0.88, uCutRadius, r)) * uCutStrength;""",1)
s = s.replace("""export function updateCutaway(camera, playerWorldPos, yLift = 0) {""",
"""/**
 * Ramp the dissolve in and out. Driven by whether the player is genuinely
 * hidden, so standing NEXT to a wall - nearer the camera, but not actually
 * occluding him - no longer punches a hole in it.
 */
export function setCutawayActive(active, dt) {
  const target = active ? 1 : 0;
  const u = uniforms.uCutStrength;
  u.value += (target - u.value) * Math.min(1, dt * (active ? 9 : 5));
  if (u.value < 0.002) u.va
… [truncated]
```
<details><summary>result</summary>

```
Grid.viewBlocked
Cutaway: narrower band + ramp
syntax ok
```
</details>

**`Bash`** — Gate cutaway on real occlusion
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace("import { updateCutaway, cutawayUniforms } from './game/Cutaway.js';",
              "import { updateCutaway, setCutawayActive } from './game/Cutaway.js';",1)
s = s.replace("""    updateCutaway(cam.camera, player.pos, 0.75);   // aim at his torso, not his feet""",
"""    updateCutaway(cam.camera, player.pos, 0.75);   // aim at his torso, not his feet
    // Only dissolve rock when it is genuinely hiding him. Standing beside a
    // wall put geometry nearer the camera than him and used to punch a hole in
    // it for no reason, which read as the torchlight leaking through the rock.
    const camDir = cam.basis().fwd;                // points camera -> player
    setCutawayActive(
      grid.viewBlocked(game.level, player.pos.x, player.pos.z,
                       -camDir.x, -camDir.z, Math.tan(cam.elevation),
                       player.pos.y + 1.15, cavern.revealed),
      dt);""",1)
open(p,'w').write(s); print('main.js: gated')
PYEOF
grep -n "setCutawayActive\|viewBlocked" src/main.js
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -5; echo BUILD_OK
```
<details><summary>result</summary>

```
main.js: gated
13:import { updateCutaway, setCutawayActive } from './game/Cutaway.js';
168:    setCutawayActive(
169:      grid.viewBlocked(game.level, player.pos.x, player.pos.z,
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-23-17-241Z.yml)
```
</details>

Testing the two cases that matter: beside a wall but visible (should be no hole), and genuinely hidden (should still cut through):

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  const mod = await import('/src/game/Cutaway.js');
  const u = mod.cutawayUniforms();
  const out = {};

  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;

  const strengthAt = async (tx, ty, label) => {
    p.placeAt(0, tx, ty);
    g.cam.follow(p.pos, 0, true);
    await wait(1200);
    const d = g.cam.basis().fwd;
    const blocked = grid.viewBlocked(0, p.pos.x, p.pos.z, -d.x, -d.z,
      Math.tan(g.cam.elevation), p.pos.y + 1.15, cav.revealed);
    return { label, tile: [tx,ty], blocked, cutStrength: +u.uCutStrength.value.toFixed(3) };
  };

  // A: open floor, nothing near -> must be zero
  let open=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;open={tx,ty};}}
  out.openFloor = await strengthAt(open.tx, open.ty, 'open floor');

  // B: hard against a wall on the far side from the camera -> visible, no hole
  let beside=null;
  for(let ty=3;ty<grid.H-3&&!beside;ty++)for(let tx=3;tx<grid.W-3&&!beside;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    // rock to the NORTH-WEST = beh
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "openFloor": {
    "label": "open floor",
    "tile": [
      30,
      17
    ],
    "blocked": false,
    "cutStrength": 1
  },
  "wallBehindHim": {
    "label": "wall behind (visible)",
    "tile": [
      16,
      3
    ],
    "blocked": false,
    "cutStrength": 1
  },
  "rockInFront": {
    "label": "rock between camera and him",
    "tile": [
      34,
      4
    ],
    "blocked": true,
    "cutStrength": 1
  }
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  const mod = await import(\'/src/game/Cutaway.js\');\n  const u = mod.cutawayUniforms();\n  const out = {};\n\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n\n  const strengthAt = async (tx, ty, label) => {\n    p.placeAt(0, tx, ty);\n    g.cam.follow(p.pos, 0, true);\n    await wait(1200);\n    const d = g.cam.basis().fwd;\n    const blocked = grid.viewBlocked(0, p.pos.x, p.pos.z, -d.x, -d.z,\n      Math.tan(g.cam.elevation), p.pos.y + 1.15, cav.revealed);\n    return { label, tile: [tx,ty], blocked, cutStrength: +u.uCutStrength.value.toFixed(3) };\n  };\n\n  // A: open floor, nothing near -> must be zero\n  let open=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let o=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;\n    if(o>best){best=o;open={tx,ty};}}\n  out.openFloor = await strengthAt(open.tx, open.ty, \'open floor\');\n\n  // B: hard against a wall on the far side from the camera -> visible, no hole\n  let beside=null;\n  for(let ty=3;ty<grid.H-3&&!beside;ty++)for(let tx=3;tx<grid.W-3&&!beside;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    // rock to the NORTH-WEST = behind him from the camera at azimuth 45\n    if(grid.isSolid(0,tx-1,ty,cav.revealed)&&grid.isSolid(0,tx,ty-1,cav.revealed)\n       &&!grid.isSolid(0,tx+1,ty,cav.revealed)&&!grid.isSolid(0,tx,ty+1,cav.revealed)) beside={tx,ty};\n  }\n  if (beside) out.wallBehindHim = await strengthAt(beside.tx, beside.ty, \'wall behind (visible)\');\n\n  // C: the original repro - rock between him and the camera -> must still cut\n  let hidden=null;\n  for(let ty=3;ty<grid.H-3&&!hidden;ty++)for(let tx=3;tx<grid.W-3&&!hidden;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    if(grid.isSolid(0,tx+1,ty,cav.revealed)&&grid.isSolid(0,tx,ty+1,cav.revealed)\n       &&!grid.i
… [truncated]
```
</details>

The occlusion test is correct (false/false/true) but `cutStrength` never moves off 1 — so the ramp isn't running. Let me look at where my edit actually landed:

**`Bash`** — Inspect the cutaway call site
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '150,185p' src/main.js
```
<details><summary>result</summary>

```
      : null;

    player.update(dt, busy ? { x: 0, y: 0 } : input.axis(), cam.basis(), cavern.revealed,
                  { proximity: torch.proximity, lookYaw });
    torch.update(dt);
    // pivot before following, so the camera and the movement basis agree this frame
    cam.orbit(input.takeOrbit() + input.orbitRate() * dt);
    cam.follow(player.pos, dt);
    cam.camera.updateMatrixWorld();
    fillDir.copy(cam.offset).normalize();
    fill.position.copy(player.pos)
      .addScaledVector(fillDir, 1.25)
      .add(new THREE.Vector3(0, 0.85, 0));
    updateCutaway(cam.camera, player.pos, 0.75);   // aim at his torso, not his feet
    // Only dissolve rock when it is genuinely hiding him. Standing beside a
    // wall put geometry nearer the camera than him and used to punch a hole in
    // it for no reason, which read as the torchlight leaking through the rock.
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
      player.react(1);                       // brows up, eyes wide, torch jumps
      ambience.discovery();
      narrator.reveal();                     // finding a way in is worth a memory
    }
    cavern.update(dt);
    props.update(game.t, dt);
```
</details>

The call site is correct, so let me instrument it rather than keep guessing:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,300));oe(...a);};
  const mod = await import('/src/game/Cutaway.js');
  const u = mod.cutawayUniforms();

  // is the loop even running? frame counter should climb
  const f0 = g.renderer.info.render.frame;
  await wait(500);
  const f1 = g.renderer.info.render.frame;

  // sample what the loop's own inputs look like over a second
  const { grid, player: p, cavern: cav } = g;
  const samples = [];
  for (let i=0;i<20;i++){
    const d = g.cam.basis().fwd;
    samples.push({
      blocked: grid.viewBlocked(g.game.level, p.pos.x, p.pos.z, -d.x, -d.z,
        Math.tan(g.cam.elevation), p.pos.y + 1.15, cav.revealed),
      strength: +u.uCutStrength.value.toFixed(3),
    });
    await wait(50);
  }
  return {
    framesAdvanced: f1 - f0,
    setCutawayActiveExported: typeof mod.setCutawayActive,
    blockedValues: [...new Set(samples.map(s=>s.blocked))],
    strengthRange: [Math.min(...samples.map(s=>s.strength)), Math.max(...samples.map(s=>s.strength))],
    playerLevel: g.game.level,
    playerTile: grid.worldToTile(p.pos.x, p.pos.z),
    errors: errs.slice(0,3),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "framesAdvanced": 120,
  "setCutawayActiveExported": "function",
  "blockedValues": [
    true
  ],
  "strengthRange": [
    1,
    1
  ],
  "playerLevel": 0,
  "playerTile": {
    "tx": 34,
    "ty": 4
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,300));oe(...a);};\n  const mod = await import(\'/src/game/Cutaway.js\');\n  const u = mod.cutawayUniforms();\n\n  // is the loop even running? frame counter should climb\n  const f0 = g.renderer.info.render.frame;\n  await wait(500);\n  const f1 = g.renderer.info.render.frame;\n\n  // sample what the loop\'s own inputs look like over a second\n  const { grid, player: p, cavern: cav } = g;\n  const samples = [];\n  for (let i=0;i<20;i++){\n    const d = g.cam.basis().fwd;\n    samples.push({\n      blocked: grid.viewBlocked(g.game.level, p.pos.x, p.pos.z, -d.x, -d.z,\n        Math.tan(g.cam.elevation), p.pos.y + 1.15, cav.revealed),\n      strength: +u.uCutStrength.value.toFixed(3),\n    });\n    await wait(50);\n  }\n  return {\n    framesAdvanced: f1 - f0,\n    setCutawayActiveExported: typeof mod.setCutawayActive,\n    blockedValues: [...new Set(samples.map(s=>s.blocked))],\n    strengthRange: [Math.min(...samples.map(s=>s.strength)), Math.max(...samples.map(s=>s.strength))],\n    playerLevel: g.game.level,\n    playerTile: grid.worldToTile(p.pos.x, p.pos.z),\n    errors: errs.slice(0,3),\n  };\n}');
``​`
```
</details>

He's currently at tile (34,4) — the genuinely-occluded case — so `strength: 1` is right there. Let me re-run the three cases and watch the ramp over time rather than sampling once:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  const mod = await import('/src/game/Cutaway.js');
  const u = mod.cutawayUniforms();
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;

  const trace = async (tx, ty, label) => {
    p.placeAt(0, tx, ty);
    g.cam.follow(p.pos, 0, true);
    const series = [];
    for (let i=0;i<24;i++){ series.push(+u.uCutStrength.value.toFixed(2)); await wait(70); }
    const d = g.cam.basis().fwd;
    return { label, tile:[tx,ty],
      blocked: grid.viewBlocked(0, p.pos.x, p.pos.z, -d.x, -d.z,
                 Math.tan(g.cam.elevation), p.pos.y+1.15, cav.revealed),
      strengthStart: series[0], strengthEnd: series[series.length-1],
      settled: series.slice(-6) };
  };

  let open=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;open={tx,ty};}}

  const out = {};
  out.openFloor = await trace(open.tx, open.ty, 'open floor - expect 0');
  out.rockInFront = await trace(34, 4, 'rock in front - expect 1');
  out.backToOpen = await trace(open.tx, open.ty, 'back to open - expect 0');
  return out;
}
```
<details><summary>result</summary>

```
### Result
{
  "openFloor": {
    "label": "open floor - expect 0",
    "tile": [
      30,
      17
    ],
    "blocked": false,
    "strengthStart": 1,
    "strengthEnd": 1,
    "settled": [
      1,
      1,
      1,
      1,
      1,
      1
    ]
  },
  "rockInFront": {
    "label": "rock in front - expect 1",
    "tile": [
      34,
      4
    ],
    "blocked": true,
    "strengthStart": 1,
    "strengthEnd": 1,
    "settled": [
      1,
      1,
      1,
      1,
      1,
      1
    ]
  },
  "backToOpen": {
    "label": "back to open - expect 0",
… [truncated]
```
</details>

`strength` is pinned at exactly 1 in every case, yet frames advance and there are no errors. That smells like my test reading a *different module instance* — Vite appends HMR version queries to main.js's imports, so a bare dynamic import gets a separate copy. Let me expose the real one rather than chase it:

**`Bash`** — Expose cutaway uniforms for debugging
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace("import { updateCutaway, setCutawayActive } from './game/Cutaway.js';",
              "import { updateCutaway, setCutawayActive, cutawayUniforms } from './game/Cutaway.js';",1)
s = s.replace("cavern, player, props, torch, game, ambience, narrator } });",
              "cavern, player, props, torch, game, ambience, narrator,\n    cutaway: cutawayUniforms() } });",1)
open(p,'w').write(s); print('exposed the real uniform instance')
PYEOF
grep -n "cutaway: cutawayUniforms" src/main.js
```
<details><summary>result</summary>

```
exposed the real uniform instance
107:    cutaway: cutawayUniforms() } });
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-25-24-210Z.yml)
```
</details>

Noted — darker backstory and a light-bestowal on discoveries. Finishing this bug first.

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, cutaway } = g;
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;

  const trace = async (tx, ty, label) => {
    p.placeAt(0, tx, ty);
    g.cam.follow(p.pos, 0, true);
    const series = [];
    for (let i=0;i<22;i++){ series.push(+cutaway.uCutStrength.value.toFixed(2)); await wait(70); }
    const d = g.cam.basis().fwd;
    return { label,
      blocked: grid.viewBlocked(0, p.pos.x, p.pos.z, -d.x, -d.z,
                 Math.tan(g.cam.elevation), p.pos.y+1.15, cav.revealed),
      settled: +cutaway.uCutStrength.value.toFixed(2),
      ramp: series.filter((v,i)=>i%4===0) };
  };

  let open=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;open={tx,ty};}}

  return {
    openFloor:   await trace(open.tx, open.ty, 'open floor'),
    rockInFront: await trace(34, 4, 'rock between camera and him'),
    backToOpen:  await trace(open.tx, open.ty, 'back to open'),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "openFloor": {
    "label": "open floor",
    "blocked": false,
    "settled": 0,
    "ramp": [
      0,
      0,
      0,
      0,
      0,
      0
    ]
  },
  "rockInFront": {
    "label": "rock between camera and him",
    "blocked": true,
    "settled": 1,
    "ramp": [
      0,
      0.93,
      0.99,
      1,
      1,
      1
    ]
  },
  "backToOpen": {
    "label": "back to open",
    "blocked": false,
    "settled": 0,
    "ramp": [
      1,
      0.24,
      0.06,
      0.01,
      0,
      0
    ]
… [truncated]
```
</details>

Correct now: 0 on open floor, ramps to 1 when genuinely occluded, back to 0 on leaving. My earlier readings were a stale-module test artifact, as suspected. Visual confirmation:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // hard against rock, but rock on the far side so he stays visible - this is
  // the case that used to punch a hole for no reason
  let spot=null;
  for(let ty=3;ty<grid.H-3&&!spot;ty++)for(let tx=3;tx<grid.W-3&&!spot;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let walls=0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
      if(grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) walls++;
    if(walls>=2 && !grid.isSolid(0,tx+1,ty+1,cav.revealed)) spot={tx,ty};
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.follow(p.pos, 0, true);
  await wait(1200);
  const d = g.cam.basis().fwd;
  return {
    tile: spot,
    blocked: grid.viewBlocked(0,p.pos.x,p.pos.z,-d.x,-d.z,
      Math.tan(g.cam.elevation), p.pos.y+1.15, cav.revealed),
    cutStrength: +g.cutaway.uCutStrength.value.toFixed(2),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "tile": {
    "tx": 7,
    "ty": 3
  },
  "blocked": false,
  "cutStrength": 0
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // hard against rock, but rock on the far side so he stays visible - this is\n  // the case that used to punch a hole for no reason\n  let spot=null;\n  for(let ty=3;ty<grid.H-3&&!spot;ty++)for(let tx=3;tx<grid.W-3&&!spot;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let walls=0;\n    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n      if(grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) walls++;\n    if(walls>=2 && !grid.isSolid(0,tx+1,ty+1,cav.revealed)) spot={tx,ty};\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.follow(p.pos, 0, true);\n  await wait(1200);\n  const d = g.cam.basis().fwd;\n  return {\n    tile: spot,\n    blocked: grid.viewBlocked(0,p.pos.x,p.pos.z,-d.x,-d.z,\n      Math.tan(g.cam.elevation), p.pos.y+1.15, cav.revealed),\n    cutStrength: +g.cutaway.uCutStrength.value.toFixed(2),\n  };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-26-03-144Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-26-03-144Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-26-03-144Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Bug fixed — he's wedged between rock on both sides, fully visible, no dithering. The cause was the dissolve firing on *proximity* rather than actual occlusion.

Now to your two additions. Starting with the backstory and the knowledge fragments — one call returns both:

**`Bash`** — Darken backstory and add revelations
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='tools/story-plugin.mjs'; s=open(p).read()

s = s.replace("""const StorySchema = z.object({
  title: z.string(),
  beats: z.array(z.string()),
});""",
"""const StorySchema = z.object({
  title: z.string(),
  beats: z.array(z.string()),
  // fragments of what the mountain gives back when he opens a way
  revelations: z.array(z.string()),
});""",1)

s = s.replace("""- A small boy with an enormous head and a stubborn little mohawk. He carries a torch.""",
"""- A small boy with an enormous head and a stubborn little mohawk. He carries a torch.
- Something is wrong down here, and was wrong before he came.""",1)

s = s.replace("""- Spare and image-led. One or two short sentences per beat, never more than 140
  characters. Fragments are welcome.""",
"""- Spare and image-led. One or two short sentences per beat, never more than 140
  characters. Fragments are welcome.
- DARK. Not gory, not shocking - dread. Something was done here, or is still
  being done, and he is closer to it than he understands. Let the reader arrive
  at the worst of it themselves; never state it outright.""",1)

s = s.replace("""- The nine beats form ONE arc: how he came to be down here, what he is really
  looking for, and what he is walking away from. Beat 1 opens it. Beat 9 lands it.
- Leave things unsaid. The best beat implies a whole life in twelve words.`;""",
"""- The nine beats form ONE arc: how he came to be down here, what he is really
  looking for, and what he is walking away from. Beat 1 opens it. Beat 9 lands it.
- Leave things unsaid. The best beat implies a whole life in twelve words.

Also write TEN REVELATIONS - a separate, different kind of writing.

When he opens a sealed way, something ancient comes up out of the floor and
enters him, and he knows a thing he has no business knowing. Each revelation is
one of those: a scrap of knowledge older than the miners, in a colder and more
formal voice than the beats. Inscriptions, laws, warnings, counting-rhymes,
instructions for something nobody should need to do.

- One sentence. Under 120 characters.
- Never about him, never in his voice. This is what the dark knows, n
… [truncated]
```
<details><summary>result</summary>

```
darker prompt + revelations
syntax ok
"Torchboy"  [cold / a promise he made too young]  10892ms

BEATS
  1. He remembered the promise before he remembered making it. That was the trouble with promises.
  2. The stairs down had been someone else's idea of a door. He took them anyway.
  3. In his pocket, half a photograph, the other half lost to a fire or a fold or a hand.
  4. The cold here did not come from the air. It came up through his shoes.
  5. He held the torch out and it leaned, like a dog smelling something under the floorboards.
  6. Someone had carried tools this way once and set them down like they meant to come back.
  7. He tried to remember the face in the photograph. He remembered only that it had been smiling.
  8. Deeper down, the walls forgot they were walls. He kept walking because turning back was a direction too.
  9. He did not find what he promised to find. He found instead that he had stopped looking for himself.

REVELATIONS (10)
  1. The first cut is never the last, and the last is never counted.
  2. What is folded may be unfolded, but not by the hand that folded it.
  3. Every light owes a debt to something that no longer needs the dark.
  4. There were three who went down and one who came up wearing all three names.
  5. The stone remembers weight better than it remembers the ones who carried it.
  6. To seal a door you must first convince yourself there was never a door.
  7. A promise made in the dark is owed to the dark, not to the one who heard it.
  8. Nine were called small and given the heaviest work, for smallness does not refuse.
  9. The photograph splits because the truth in it could not survive being whole.
  10. When the torch turns blue, something below has already turned toward you.

cost: $0.0076
```
</details>

The revelations are genuinely unsettling — *"There were three who went down and one who came up wearing all three names."* Now the visual. Building the light that rises out of the floor and enters him:

**`Bash`** — Write the bestowal light effect
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
rm -f src/game/Bestowal.js && cat > src/game/Bestowal.js <<'EOF'
import * as THREE from 'three';

/**
 * Something ancient comes up out of the floor and enters him.
 *
 * Fired when he opens a sealed way or descends. Four parts, all additive so
 * they read as light rather than as objects: a ring that opens on the stone, a
 * core that gathers and rises, a halo around it, and a point light that travels
 * with the whole thing so the cave lights up as it climbs.
 *
 * The target tracks his chest rather than being fixed at spawn, so walking
 * during the rise looks like the light chasing him down rather than a bug.
 */

// Cold, to rhyme with the way the flame turns blue-white near a hidden way.
const COLD = new THREE.Color(0.62, 0.88, 1.0);
const HOT = new THREE.Color(1.0, 1.0, 1.0);

const GATHER = 0.38;      // light pools on the floor
const RISE = 1.18;        // ...and climbs
const ENTER = 1.32;       // ...and goes in
const DONE = 1.95;

function glowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(190,235,255,0.55)');
  g.addColorStop(1.0, 'rgba(120,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Bestowal {
  constructor(scene) {
    this.t = Infinity;
    this.from = new THREE.Vector3();

    const add = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };

    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.13, 2),
      new THREE.MeshBasicMaterial({ ...add, color: COLD.clone() }));

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      ...add, map: glowTexture(), color: COLD.clone(),
    }));

    // the ring lies flat on the stone and opens outward as the light gathers
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 40),
      new THREE.MeshBasicMaterial({ ...add, color: COLD.clone(
… [truncated]
```
<details><summary>result</summary>

```
syntax ok:      138 lines
```
</details>

**`Bash`** — Wire revelations into narrator and HUD
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
# ---- Narrator holds the revelations and doles them out
p='src/game/Narrator.js'; s=open(p).read()
s = s.replace("""    this.beats = [];
    this.title = '';""",
"""    this.beats = [];
    this.revelations = [];
    this.revIndex = 0;
    this.title = '';""",1)
s = s.replace("""      this.beats = data.beats;
      this.title = data.title || '';""",
"""      this.beats = data.beats;
      this.revelations = Array.isArray(data.revelations) ? data.revelations : [];
      this.title = data.title || '';""",1)
s = s.replace("""      this.beats = FALLBACK.beats;
      this.title = FALLBACK.title;""",
"""      this.beats = FALLBACK.beats;
      this.revelations = FALLBACK.revelations;
      this.title = FALLBACK.title;""",1)
s = s.replace("""    'Somewhere below, the dark thinned. He went toward it because it was the only direction left.',
  ],
};""",
"""    'Somewhere below, the dark thinned. He went toward it because it was the only direction left.',
  ],
  // what the dark knows. Colder and more formal than the beats, and never
  // about him - this is not memory, it is something handed over.
  revelations: [
    'The stone remembers weight better than it remembers the ones who carried it.',
    'To seal a door you must first convince yourself there was never a door.',
    'Every light owes a debt to something that no longer needs the dark.',
    'What is folded may be unfolded, but not by the hand that folded it.',
    'They were counted going down. There was no arrangement for counting them back.',
    'The deepest seam was not dug. It was answered.',
    'A promise made in the dark is owed to the dark, not to the one who heard it.',
    'When the flame turns cold, something below has already turned toward you.',
    'The names on the lower wall are in one hand. All of them.',
    'Nothing down here was forgotten. It was agreed not to be spoken of.',
  ],
};""",1)
s = s.replace("""  /** Show the next beat now, whatever the walk counter says. */""",
"""  /** The next fragment of what the dark knows, or null when they run out. */
  nextRevelation() {
    if (!this.ready || this.revIndex >= this.revelati
… [truncated]
```
<details><summary>result</summary>

```
Narrator: revelations
HUD: revelation
index.html: revelation style
done
```
</details>

**`Bash`** — Wire bestowal into game events
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
# ---- a rising figure for the moment it enters him
p='src/game/Ambience.js'; s=open(p).read()
s = s.replace("""  /** An ember taken: one soft affirmative note. */""",
"""  /** Something ancient enters him: a cold figure that rises and then lands. */
  bestow() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const root = ROOTS[this.level] * 8;
    // rising fourths, arriving on the octave as the light goes in
    [0, 5, 10, 12].forEach((s, i) => {
      this._note(noteHz(root, s), t + i * 0.18, 2.2, 0.055, (i - 1.5) * 0.35,
                 'sine', this.bright);
    });
    // a low swell underneath so it has weight
    this._note(noteHz(ROOTS[this.level] * 2, 0), t + 0.5, 3.4, 0.05, 0, 'sine');
  }

  /** An ember taken: one soft affirmative note. */""",1)
open(p,'w').write(s); print('Ambience.bestow')

# ---- wire the whole moment into the game
p='src/main.js'; s=open(p).read()
s = s.replace("import { Narrator } from './game/Narrator.js';",
              "import { Narrator } from './game/Narrator.js';\nimport { Bestowal } from './game/Bestowal.js';",1)
s = s.replace("const narrator = new Narrator(hud);",
              "const narrator = new Narrator(hud);\nlet bestowal = null;\nconst _chest = new THREE.Vector3();",1)
s = s.replace("  scene.add(cavern.root, player.root, player.blob, props.group);",
              "  scene.add(cavern.root, player.root, player.blob, props.group);\n  bestowal = new Bestowal(scene);",1)

# fire on a passage opening
s = s.replace("""      player.react(1);                       // brows up, eyes wide, torch jumps
      ambience.discovery();
      narrator.reveal();                     // finding a way in is worth a memory""",
"""      player.react(1);                       // brows up, eyes wide, torch jumps
      ambience.discovery();
      bestow(player);                        // something comes up out of the floor""",1)

# fire on descending
s = s.replace("  ambience.setLevel(i);\n  if (i > 0) narrator.reveal(true);      // every descent gets one",
              "  ambience.setLevel(i);\n  if (i > 0) pendingBestow = 0.9;        // le
… [truncated]
```
<details><summary>result</summary>

```
Ambience.bestow
main.js wired
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-28-52-977Z.yml)
```
</details>

Capturing the effect mid-rise:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;spot={tx,ty};}}
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.setZoom(9, innerWidth/innerHeight);
  g.cam.follow(p.pos, 0, true);
  await wait(600);
  g.bestow(p);
  await wait(720);                 // mid-rise
  return { active: true };
}
```
<details><summary>result</summary>

```
### Result
{
  "active": true
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let o=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;\n    if(o>best){best=o;spot={tx,ty};}}\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.setZoom(9, innerWidth/innerHeight);\n  g.cam.follow(p.pos, 0, true);\n  await wait(600);\n  g.bestow(p);\n  await wait(720);                 // mid-rise\n  return { active: true };\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-28-52-869Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-29-08-989Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-29-08-989Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-29-08-989Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The revelation fired and the point light is flooding the whole cave — too strong, and I can't see the orb. Let me trace the effect frame by frame rather than guess:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player;
  // reach the Bestowal instance through the scene graph
  let b = null;
  g.scene.traverse(o => { if (o.type === 'Group' && o.children.some(c => c.isPointLight)
    && o.children.some(c => c.isSprite) && o.children.some(c => c.geometry?.type === 'RingGeometry')) b = o; });
  if (!b) return { error: 'bestowal group not found' };

  const core = b.children.find(c => c.isMesh && c.geometry.type === 'IcosahedronGeometry');
  const light = b.children.find(c => c.isPointLight);
  const ring = b.children.find(c => c.isMesh && c.geometry.type === 'RingGeometry');

  g.bestow(p);
  const trace = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 2100) {
    trace.push({
      t: +((performance.now()-t0)/1000).toFixed(2),
      coreY: +core.position.y.toFixed(2),
      coreScale: +core.scale.x.toFixed(2),
      coreOpacity: +core.material.opacity.toFixed(2),
      lightI: +light.intensity.toFixed(1),
      ringOp: +ring.material.opacity.toFixed(2),
      visible: b.visible,
    });
    await wait(90);
  }
  return {
    playerFootY: +p.pos.y.toFixed(2),
    chestY: +(p.pos.y + 0.78).toFixed(2),
    peakLight: Math.max(...trace.map(x=>x.lightI)),
    trace: trace.filter((_,i)=>i%2===0),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "playerFootY": -0.17,
  "chestY": 0.61,
  "peakLight": 33.8,
  "trace": [
    {
      "t": 0,
      "coreY": 0.61,
      "coreScale": 0,
      "coreOpacity": 0,
      "lightI": 0,
      "ringOp": 0,
      "visible": true
    },
    {
      "t": 0.18,
      "coreY": -0.06,
      "coreScale": 0.26,
      "coreOpacity": 0.47,
      "lightI": 4.2,
      "ringOp": 0.54,
      "visible": true
    },
    {
      "t": 0.36,
      "coreY": -0.01,
      "coreScale": 1.05,
      "coreOpacity": 0.95,
      "lightI": 8.6,
      "ringOp": 0.26,
      "visible": true
    },
    {
      "t": 0.54,
      "coreY": 0.02,
      "coreScale": 1.1,
      "coreOpacity": 1,
      "lightI": 10.3,
      "ringOp": 0.05,
… [truncated]
```
</details>

The animation is correct — core rises floor→chest, ring opens, flash on entry. But **peak light 33.8** floods the cave (the torch is ~30), and the orb hovers near the floor for most of the rise. Fixing both:

**`Bash`** — Tone down bestowal light and reshape rise
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Bestowal.js'; s=open(p).read()
s = s.replace("      new THREE.IcosahedronGeometry(0.13, 2),",
              "      new THREE.IcosahedronGeometry(0.17, 2),",1)
s = s.replace("    this.light = new THREE.PointLight(0x9fd8ff, 0, 12, 1.6);",
"""    // Kept well under the torch (~30 at full). At 9x brightness this peaked at
    // 34 and flooded the whole cavern white, which buried the orb it was
    // supposed to be lighting.
    this.light = new THREE.PointLight(0x9fd8ff, 0, 7, 1.6);""",1)
s = s.replace("    this.light.intensity = bright * 9;",
              "    this.light.intensity = bright * 2.4;",1)
s = s.replace("      const e = p * p * (3 - 2 * p) * 0.35 + p * p * p * 0.65;   // eases, then rushes",
              "      const e = p * p * (3 - 2 * p) * 0.58 + p * p * p * 0.42;   // eases, then rushes",1)
s = s.replace("    this.halo.scale.setScalar(Math.max(0.001, scale * 2.6 + bright * 0.25));",
              "    this.halo.scale.setScalar(Math.max(0.001, scale * 3.1 + bright * 0.3));",1)
open(p,'w').write(s); print('toned down + reshaped')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
toned down + reshaped
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-30-06-302Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;spot={tx,ty};}}
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.setZoom(7, innerWidth/innerHeight);
  g.cam.follow(p.pos, 0, true);
  await wait(700);
  g.bestow(p);
  await wait(880);                  // partway up, orb clear of the floor
  return { fired: true };
}
```
<details><summary>result</summary>

```
### Result
{
  "fired": true
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let o=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;\n    if(o>best){best=o;spot={tx,ty};}}\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.setZoom(7, innerWidth/innerHeight);\n  g.cam.follow(p.pos, 0, true);\n  await wait(700);\n  g.bestow(p);\n  await wait(880);                  // partway up, orb clear of the floor\n  return { fired: true };\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-30-06-241Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-30-23-269Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-30-23-269Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-30-23-269Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The screenshot round-trip outruns the 1.9s animation, so I keep catching the aftermath. Let me expose the instance so I can freeze it mid-rise:

**`Bash`** — Expose bestowal instance for inspection
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace("game, ambience, narrator, bestow,",
              "game, ambience, narrator, bestow,\n    get bestowal() { return bestowal; },",1)
open(p,'w').write(s); print('exposed bestowal')
PYEOF
grep -n "get bestowal" src/main.js
```
<details><summary>result</summary>

```
exposed bestowal
111:    get bestowal() { return bestowal; },
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-30-46-524Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;spot={tx,ty};}}
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.setZoom(6.5, innerWidth/innerHeight);
  g.cam.follow(p.pos, 0, true);
  await wait(600);

  g.bestow(p);
  // hold it partway up so a still can actually catch the orb in flight
  const b = g.bestowal;
  window.__hold = setInterval(() => { b.t = 0.92; }, 4);
  await wait(400);
  const core = b.core;
  return {
    heldAt: b.t,
    coreY: +core.position.y.toFixed(2),
    footY: +p.pos.y.toFixed(2),
    chestY: +(p.pos.y+0.78).toFixed(2),
    coreScale: +core.scale.x.toFixed(2),
    lightI: +b.light.intensity.toFixed(1),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "heldAt": 0.92,
  "coreY": 0.35,
  "footY": -0.17,
  "chestY": 0.61,
  "coreScale": 0.98,
  "lightI": 3.5
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let o=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;\n    if(o>best){best=o;spot={tx,ty};}}\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.setZoom(6.5, innerWidth/innerHeight);\n  g.cam.follow(p.pos, 0, true);\n  await wait(600);\n\n  g.bestow(p);\n  // hold it partway up so a still can actually catch the orb in flight\n  const b = g.bestowal;\n  window.__hold = setInterval(() => { b.t = 0.92; }, 4);\n  await wait(400);\n  const core = b.core;\n  return {\n    heldAt: b.t,\n    coreY: +core.position.y.toFixed(2),\n    footY: +p.pos.y.toFixed(2),\n    chestY: +(p.pos.y+0.78).toFixed(2),\n    coreScale: +core.scale.x.toFixed(2),\n    lightI: +b.light.intensity.toFixed(1),\n  };\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-30-46-463Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-31-04-575Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-31-04-575Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-31-04-575Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Now I can see it — the cool glow at his midsection lighting his shirt blue. But it rises from *directly beneath* him, so his own body hides it for most of the climb. Let me spawn it camera-side so it arcs in:

**`Bash`** — Spawn orb camera-side with an arc
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Bestowal.js'; s=open(p).read()
s = s.replace("""  /** @param at floor position to rise from */
  fire(at) {
    this.t = 0;
    this.from.set(at.x, at.y, at.z);
    this.group.visible = true;
  }""",
"""  /**
   * @param at     floor position under him
   * @param camDir normalised XZ direction from him toward the camera
   *
   * The spawn is pushed toward the camera. Rising from directly beneath him put
   * the orb behind his own body for most of the climb, so the effect was mostly
   * invisible; offset, it arcs in from the front and reads the whole way up.
   */
  fire(at, camDir) {
    this.t = 0;
    const push = 0.62;
    this.from.set(
      at.x + (camDir ? camDir.x * push : 0),
      at.y,
      at.z + (camDir ? camDir.z * push : 0),
    );
    this.group.visible = true;
  }""",1)
# lateral convergence should lag the climb, so it arcs rather than moving in a line
s = s.replace("""    const climb = THREE.MathUtils.clamp((t - GATHER) / (RISE - GATHER), 0, 1);
    const x = THREE.MathUtils.lerp(this.from.x, chest.x, climb);
    const z = THREE.MathUtils.lerp(this.from.z, chest.z, climb);""",
"""    // lateral drift lags the climb (cubed), so it rises first and only swings
    // in toward him at the end - an arc rather than a straight line
    const climb = THREE.MathUtils.clamp((t - GATHER) / (RISE - GATHER), 0, 1);
    const lat = climb * climb * climb;
    const x = THREE.MathUtils.lerp(this.from.x, chest.x, lat);
    const z = THREE.MathUtils.lerp(this.from.z, chest.z, lat);""",1)
open(p,'w').write(s); print('Bestowal: camera-side spawn + arc')
PYEOF
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace("""function bestow(player) {
  if (!bestowal) return;
  bestowal.fire(player.pos);
  ambience.bestow();
}""",
"""function bestow(player) {
  if (!bestowal) return;
  // spawn it on the camera side of him so his own body does not hide the rise
  const f = cam.basis().fwd;
  bestowal.fire(player.pos, { x: -f.x, z: -f.z });
  ambience.bestow();
}""",1)
open(p,'w').write(s); print('main.js passes camera direction')
PYEOF
npx vite build --logLevel error 2>&1 | grep -vi
… [truncated]
```
<details><summary>result</summary>

```
Bestowal: camera-side spawn + arc
main.js passes camera direction
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-31-39-945Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;spot={tx,ty};}}
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.setZoom(6.5, innerWidth/innerHeight);
  g.cam.follow(p.pos, 0, true);
  await wait(600);
  g.bestow(p);
  const b = g.bestowal;
  window.__hold = setInterval(() => { b.t = 0.85; }, 4);   // hold mid-rise
  await wait(350);
  return {
    heldAt: b.t,
    orb: [b.core.position.x, b.core.position.y, b.core.position.z].map(v=>+v.toFixed(2)),
    him: [p.pos.x, p.pos.y, p.pos.z].map(v=>+v.toFixed(2)),
    lateralOffsetFromHim: +Math.hypot(b.core.position.x-p.pos.x, b.core.position.z-p.pos.z).toFixed(2),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "heldAt": 0.85,
  "orb": [
    21.35,
    0.28,
    3.35
  ],
  "him": [
    21,
    -0.17,
    3
  ],
  "lateralOffsetFromHim": 0.49
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let o=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;\n    if(o>best){best=o;spot={tx,ty};}}\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.setZoom(6.5, innerWidth/innerHeight);\n  g.cam.follow(p.pos, 0, true);\n  await wait(600);\n  g.bestow(p);\n  const b = g.bestowal;\n  window.__hold = setInterval(() => { b.t = 0.85; }, 4);   // hold mid-rise\n  await wait(350);\n  return {\n    heldAt: b.t,\n    orb: [b.core.position.x, b.core.position.y, b.core.position.z].map(v=>+v.toFixed(2)),\n    him: [p.pos.x, p.pos.y, p.pos.z].map(v=>+v.toFixed(2)),\n    lateralOffsetFromHim: +Math.hypot(b.core.position.x-p.pos.x, b.core.position.z-p.pos.z).toFixed(2),\n  };\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-31-39-885Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-31-57-936Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-31-57-936Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-31-57-936Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The orb reads now, but it's blown out — my halo sprite was scaling to ~3.5 world units, wider than the character. Tightening it to a defined orb:

**`Bash`** — Tighten the halo so the orb has shape
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Bestowal.js'; s=open(p).read()
s = s.replace("""    this.halo.scale.setScalar(Math.max(0.001, scale * 3.1 + bright * 0.3));
    this.halo.material.opacity = Math.min(1, bright * 0.55);""",
"""    // The halo was scaling past 3 world units - wider than he is - so the orb
    // read as a white wash instead of a light with a shape. Keep it close.
    this.halo.scale.setScalar(Math.max(0.001, scale * 1.25 + bright * 0.14));
    this.halo.material.opacity = Math.min(0.85, bright * 0.34);""",1)
s = s.replace("    this.core.material.opacity = Math.min(1, bright);",
              "    this.core.material.opacity = Math.min(1, bright * 0.9);",1)
open(p,'w').write(s); print('halo tightened')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
halo tightened
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-32-24-929Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let o=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;
    if(o>best){best=o;spot={tx,ty};}}
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.setZoom(6, innerWidth/innerHeight);
  g.cam.follow(p.pos, 0, true);
  await wait(600);
  g.bestow(p);
  const b = g.bestowal;
  window.__hold = setInterval(() => { b.t = 0.80; }, 4);
  await wait(350);
  return { heldAt: b.t, haloScale: +b.halo.scale.x.toFixed(2),
           coreScale: +b.core.scale.x.toFixed(2), lightI: +b.light.intensity.toFixed(1) };
}
```
<details><summary>result</summary>

```
### Result
{
  "heldAt": 0.8,
  "haloScale": 1.46,
  "coreScale": 1.02,
  "lightI": 3.3
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let o=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))o++;\n    if(o>best){best=o;spot={tx,ty};}}\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.setZoom(6, innerWidth/innerHeight);\n  g.cam.follow(p.pos, 0, true);\n  await wait(600);\n  g.bestow(p);\n  const b = g.bestowal;\n  window.__hold = setInterval(() => { b.t = 0.80; }, 4);\n  await wait(350);\n  return { heldAt: b.t, haloScale: +b.halo.scale.x.toFixed(2),\n           coreScale: +b.core.scale.x.toFixed(2), lightI: +b.light.intensity.toFixed(1) };\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-32-24-872Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-32-42-340Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-32-42-340Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-32-42-340Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

That's the effect — a defined orb of cold light rising in front of him. And the backstory is darker: *"He remembered a door, and his hand on it, and the cold that came after."*

Final regression through the real triggers:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-32-52-012Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, props, torch } = g;
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,160));oe(...a);};
  const el = document.getElementById('narration');
  const out = {};

  // wait for the live story
  const t0=performance.now();
  while(!g.narrator.ready && performance.now()-t0<25000) await wait(200);
  out.story = { source: g.narrator.source, title: g.narrator.title,
                beats: g.narrator.beats.length, revelations: g.narrator.revelations.length };

  // ---- discovering a passage should fire the bestowal + a revelation
  const s = [...cav.secrets.values()].find(x=>x.level===0&&!x.done);
  let adj=null;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if(!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)){adj=[s.tx+dx,s.ty+dy];break;}
  p.placeAt(0, adj[0], adj[1]);
  await wait(500);
  const firedEarly = g.bestowal.active;
  await wait(1800);
  out.onPassage = {
    secretOpened: cav.revealed.size > 0,
    bestowalFired: firedEarly || g.narrator.revIndex > 0,
    revelationsUsed: g.narrator.revIndex,
    showingRevelation: el.classList.contains('revelation'),
    text: el.textContent.slice(0, 70),
  };

  // ---- descending should fire one too
  const before = g.narrator.revIndex
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "story": {
    "source": "claude",
    "title": "The Last Light",
    "beats": 9,
    "revelations": 10
  },
  "onPassage": {
    "secretOpened": true,
    "bestowalFired": true,
    "revelationsUsed": 1,
    "showingRevelation": true,
    "text": "The ninth stone remembers what the eighth chose to forget."
  },
  "onDescent": {
    "level": "The Weeping Gallery",
    "revelationsUsed": 2,
    "firedAnother": true
  },
  "perf": {
    "calls": 29,
    "tris": 50214
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav, props, torch } = g;\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,160));oe(...a);};\n  const el = document.getElementById(\'narration\');\n  const out = {};\n\n  // wait for the live story\n  const t0=performance.now();\n  while(!g.narrator.ready && performance.now()-t0<25000) await wait(200);\n  out.story = { source: g.narrator.source, title: g.narrator.title,\n                beats: g.narrator.beats.length, revelations: g.narrator.revelations.length };\n\n  // ---- discovering a passage should fire the bestowal + a revelation\n  const s = [...cav.secrets.values()].find(x=>x.level===0&&!x.done);\n  let adj=null;\n  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if(!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)){adj=[s.tx+dx,s.ty+dy];break;}\n  p.placeAt(0, adj[0], adj[1]);\n  await wait(500);\n  const firedEarly = g.bestowal.active;\n  await wait(1800);\n  out.onPassage = {\n    secretOpened: cav.revealed.size > 0,\n    bestowalFired: firedEarly || g.narrator.revIndex > 0,\n    revelationsUsed: g.narrator.revIndex,\n    showingRevelation: el.classList.contains(\'revelation\'),\n    text: el.textContent.slice(0, 70),\n  };\n\n  // ---- descending should fire one too\n  const before = g.narrator.revIndex;\n  const d = grid.find(0,\'>\')[0], dw = grid.tileToWorld(0,d.tx,d.ty);\n  let dir=null;\n  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if(!grid.isSolid(0,d.tx+dx,d.ty+dy,cav.revealed)){dir=[dx,dy];break;}\n  p.placeAt(0,d.tx+dir[0],d.ty+dir[1]);\n  p.pos.x=dw.x+dir[0]*1.5; p.pos.z=dw.z+dir[1]*1.5; p.root.position.copy(p.pos);\n  g.game.stairLock=false;\n  await wait(3200);\n  out.onDescent = {\n    level: grid.levels[g.game.level].name,\n    revelationsUsed: g.narrator.revIndex,\n    firedAnother: g.narrator.revIndex > before,\n  };\n\n  out.perf = { calls: g.renderer.info.render.ca
… [truncated]
```
</details>

**`Bash`** — Document the cutaway fix and bestowal
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
s = s.replace("""**Do not give a model information you do not want it to use.**""",
"""**The bestowal.** Opening a sealed way, or descending, brings something up out
of the floor and into him: a cold orb rises from the stone, arcs in, and enters
his chest, and the dark hands him a piece of knowledge it has no business
giving. The story call returns TEN REVELATIONS alongside the nine memory beats -
a separate, colder register, never in his voice, never about him. They are
styled differently on screen for the same reason: the beats are his memory, a
revelation is something handed to him from outside.

Two things the effect needed that were not obvious:

- **Spawn it on the camera side of him.** Rising from directly beneath put the
  orb behind his own body for most of the climb, so most of the animation was
  invisible. Offset toward the camera, with the lateral drift lagging the climb,
  it arcs in from the front and reads the whole way up.
- **Keep it dimmer than the torch.** At first pass its point light peaked at 34
  against the torch's ~30 and washed the entire cavern white, burying the orb it
  was meant to light.

**Do not give a model information you do not want it to use.**""",1)
s = s.replace("""- **Wall cutaway** (`src/game/Cutaway.js`). Three-unit walls hide the character
  constantly. Rock between camera and player is dissolved with a **dithered
  discard** rather than alpha blending, so there is no transparency sorting to go
  wrong on a big merged mesh. It is applied to walls only - on the floor it
  punches a hole in the ground the player is standing on.""",
"""- **Wall cutaway** (`src/game/Cutaway.js`). Three-unit walls hide the character
  constantly. Rock between camera and player is dissolved with a **dithered
  discard** rather than alpha blending, so there is no transparency sorting to go
  wrong on a big merged mesh. It is applied to walls only - on the floor it
  punches a hole in the ground the player is standing on.
- **The cutaway is gated on actual occlusion.** Testing only "is this rock nearer
  the camera than he is" fired the dissolve when
… [truncated]
```
<details><summary>result</summary>

```
README updated
BUILD_OK
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

All three done. Reload — **http://localhost:5180**.

## The bug

It was my wall-cutaway shader, not a light leak. Confirmed by toggling it off: the artifact vanished and so did he, completely hidden — so the wall was occluding correctly all along.

The flaw was the trigger condition. It fired on *"is this rock nearer the camera than he is"*, which is true whenever he stands **beside** a wall — so it punched a dithered hole in geometry that wasn't hiding him, and you saw the lit floor through it. That's exactly the "light going through the wall" you described.

It's now gated on real occlusion: `Grid.viewBlocked()` marches the tile grid toward the camera (~20 lookups, versus ~12k triangle tests for a mesh raycast) and the dissolve ramps in and out. Measured: **0 on open floor, 0 beside a wall, ramps to 1 only when genuinely hidden.** I also narrowed the dither band, which was ~0.4 units wide and read as speckle.

One detour worth mentioning: my first three test runs showed the fix not working at all. That was the *test* reading a stale module copy — Vite appends HMR version queries, so a bare dynamic import gets a separate instance. The uniforms are now exposed on `window.__game.cutaway` so debugging reads the real one.

## Darker backstory

Same fixed seed prompt, retuned toward dread rather than melancholy, with darker registers and reasons. It's producing lines like *"He remembered a door, and his hand on it, and the cold that came after."*

## The bestowal

Opening a sealed way or descending brings a cold orb up out of the stone: a ring opens on the floor, the light gathers, rises with an arc, and flares as it enters his chest — with a rising four-note figure underneath and a revelation on screen as it lands.

The story call now returns **ten revelations** alongside the nine memory beats — a separate, colder register, never in his voice, styled differently on screen because the beats are his memory while a revelation is handed to him from outside. They're good: *"There were three who went down and one who came up wearing all three names."*

Two things that needed fixing once I could see it:
- **Spawn it camera-side.** Rising from directly beneath put the orb behind his own body for most of the climb — the animation was nearly invisible.
- **Keep it dimmer than the torch.** Its light initially peaked at 34 against the torch's ~30 and washed the whole cavern white, burying the orb it was meant to light.

Verified end to end on live generation: fires on both triggers, revelations advance, no console errors, 29 draw calls.


---
[← 10-ok-let-s-work-on-the.md](10-ok-let-s-work-on-the.md)  ·  [index](README.md)