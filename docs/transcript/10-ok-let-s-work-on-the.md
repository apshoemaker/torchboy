# 10. ok - let's work on the movement mechanics.  The legs move much slower than the actual character movement, and 

[← index](README.md)

## The prompt

> ok - let's work on the movement mechanics.  The legs move much slower than the actual character movement, and I would like to be able to use my mouse to click and pivot around as the character is moving.

## What happened

Two separate things. Let me quantify the foot-sliding first rather than guess at a multiplier:

**`Bash`** — Quantify the foot-sliding mismatch
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
node -e "
// leg geometry straight from build_character.py
const hip = [0.105, 0, 0.30], foot = [0.115, 0, 0.02];
const legLen = Math.hypot(foot[0]-hip[0], foot[2]-hip[2]);
const swing = 0.72;                 // radians, current walk_pose leg amplitude
const footTravel = legLen * Math.sin(swing);     // one side of the arc
const stride = 2 * footTravel;                   // heel-back to heel-forward
const perCycle = 2 * stride;                     // two steps per cycle
const cycle = 1.04;                              // measured clip duration, seconds
const implied = perCycle / cycle;
const SPEED = 4.2;                               // Player.js
console.log('leg length      ', legLen.toFixed(3));
console.log('foot arc (±)    ', footTravel.toFixed(3));
console.log('stride/step     ', stride.toFixed(3));
console.log('distance/cycle  ', perCycle.toFixed(3));
console.log('clip cycle      ', cycle+'s  -> implied ground speed', implied.toFixed(2), 'u/s');
console.log('actual SPEED    ', SPEED, 'u/s');
console.log();
console.log('MISMATCH        ', (SPEED/implied).toFixed(2)+'x  <- feet slide this much');
console.log();
console.log('for reference: he is', (1.36).toFixed(2), 'tall, so', SPEED, 'u/s =', (SPEED/1.36).toFixed(1), 'body-heights/sec');
console.log('a real walk is ~0.8 body-heights/sec; ~2.5 is a sprint');
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
leg length       0.280
foot arc (±)     0.185
stride/step      0.369
distance/cycle   0.739
clip cycle       1.04s  -> implied ground speed 0.71 u/s
actual SPEED     4.2 u/s

MISMATCH         5.91x  <- feet slide this much

for reference: he is 1.36 tall, so 4.2 u/s = 3.1 body-heights/sec
a real walk is ~0.8 body-heights/sec; ~2.5 is a sprint
```
</details>

5.9× — that's severe, and it's structural: his legs are 0.28 units long but he moves at 3.1 body-heights/second. Let me fix it properly with speed-proportional playback rather than a magic number, and give him a longer stride to work with:

**`Bash`** — Lengthen walk stride and compute lock ratios
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='blender/build_character.py'; s=open(p).read()
s = s.replace('''        "leg.R": ((0.720 * stride, 0, 0), None),
        "leg.L": ((-0.720 * stride, 0, 0), None),''',
'''        # A longer stride buys ground per cycle, which is what stops the feet
        # sliding. sin() saturates past ~1.2rad, so this is close to the most a
        # 0.28-long leg can cover.
        "leg.R": ((1.020 * stride, 0, 0), None),
        "leg.L": ((-1.020 * stride, 0, 0), None),''',1)
s = s.replace('        "arm.L": ((0.560 * stride, 0, 0), None),',
              '        "arm.L": ((0.660 * stride, 0, 0), None),',1)
s = s.replace('        "root":  ((0, 0, 0), (0.030 * stride, 0.055 * (bob * 0.5 + 0.5), 0)),',
              '        "root":  ((0, 0, 0), (0.030 * stride, 0.070 * (bob * 0.5 + 0.5), 0)),',1)
open(p,'w').write(s); print('walk stride lengthened')
PYEOF
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_character.py 2>&1 | grep -iE "^error|traceback" | head -3
node -e "
const legLen=0.280, swing=1.02, cycle=1.04;
const perCycle = 4*legLen*Math.sin(swing);
console.log('new stride/cycle:', perCycle.toFixed(3), 'units');
console.log('implied speed at 1x playback:', (perCycle/cycle).toFixed(2), 'u/s');
console.log();
console.log('speed  timeScale for a locked foot   cadence (steps/sec)');
for (const sp of [4.2, 3.6, 3.2, 2.8]) {
  const ts = sp*cycle/perCycle;
  console.log('  '+sp.toFixed(1)+'    '+ts.toFixed(2)+'                        '+(2*ts/cycle).toFixed(1));
}" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
walk stride lengthened
new stride/cycle: 0.954 units
implied speed at 1x playback: 0.92 u/s

speed  timeScale for a locked foot   cadence (steps/sec)
  4.2    4.58                        8.8
  3.6    3.92                        7.5
  3.2    3.49                        6.7
  2.8    3.05                        5.9
```
</details>

The tradeoff is now explicit. Let me implement speed-proportional playback — with the actual measured speed, so wall-sliding slows his legs too:

**`Bash`** — Lock walk cycle to actual ground speed
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Player.js'; s=open(p).read()
s = s.replace("""const SPEED = 4.2;
const RADIUS = 0.42;""",
"""const SPEED = 3.2;
const RADIUS = 0.42;

/**
 * Ground the walk clip covers in one cycle, derived from the rig:
 * 4 * legLength * sin(swing), with legLength 0.28 and swing 1.02rad.
 *
 * Playback is scaled by actual ground speed divided by this, so a planted foot
 * stays planted. Without it the clip ran at a fixed rate while he moved 5.9x
 * faster than its stride implied, and he skated everywhere.
 *
 * He has very short legs and covers ground quickly, so a fully locked foot
 * means a fast cadence - that is a real consequence of the proportions, not a
 * bug. FOOT_LOCK below 1 trades a calmer cadence for some sliding back.
 */
const STRIDE_PER_CYCLE = 0.954;
const FOOT_LOCK = 1.0;
const CADENCE_CAP = 3.6;        // ceiling on playback rate, so it never blurs""",1)

s = s.replace("""    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.moving = false;""",
"""    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.moving = false;
    this.groundSpeed = 0;""",1)

s = s.replace("""    if (this.moving) {
      dx = (dx / len) * SPEED * dt;
      dz = (dz / len) * SPEED * dt;
      const r = this.grid.moveCircle(this.level, this.pos.x, this.pos.z, dx, dz, RADIUS, revealed);
      this.pos.x = r.x; this.pos.z = r.z;""",
"""    if (this.moving) {
      dx = (dx / len) * SPEED * dt;
      dz = (dz / len) * SPEED * dt;
      const beforeX = this.pos.x, beforeZ = this.pos.z;
      const r = this.grid.moveCircle(this.level, this.pos.x, this.pos.z, dx, dz, RADIUS, revealed);
      this.pos.x = r.x; this.pos.z = r.z;
      // measure what he ACTUALLY covered, not what he asked for - scraping
      // along a wall should slow his legs too
      const moved = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
      this.groundSpeed = moved / Math.max(dt, 1e-4);""",1)

s = s.replace("""    if (!this.busy) this.play(this.moving ? 'Walk' : 'Idle');
    this.mixer.update(dt);""",
"""    if (!this.moving) this.groundSpeed += (0 - this.groundSpeed) * Math.min(1, dt * 12);

    if (!this.b
… [truncated]
```
<details><summary>result</summary>

```
Player.js: speed-locked stride
26:const STRIDE_PER_CYCLE = 0.954;
68:    this.groundSpeed = 0;
145:      this.groundSpeed = moved / Math.max(dt, 1e-4);
159:    if (!this.moving) this.groundSpeed += (0 - this.groundSpeed) * Math.min(1, dt * 12);
167:      const locked = (this.groundSpeed * cycle / STRIDE_PER_CYCLE) * FOOT_LOCK;
168:      walk.timeScale = THREE.MathUtils.clamp(locked, 0.55, CADENCE_CAP);
```
</details>

Now the mouse pivot. Making the camera azimuth mutable — `basis()` already derives movement from the offset, so steering follows the camera automatically:

**`Bash`** — Add orbit support to the camera
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/IsoCamera.js'; s=open(p).read()
s = s.replace("""    this.viewSize = viewSize;
    this.azimuth = azimuth;
    this.elevation = elevation;""",
"""    this.viewSize = viewSize;
    this.azimuth = azimuth;
    this.targetAzimuth = azimuth;      // orbit target; the camera eases toward it
    this.elevation = elevation;""",1)
s = s.replace("""    this.offset = new THREE.Vector3(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    ).multiplyScalar(this.distance);
    this.resize(aspect);""",
"""    this.offset = new THREE.Vector3();
    this._applyAzimuth();
    this.resize(aspect);""",1)
s = s.replace("""  resize(aspect) {""",
"""  _applyAzimuth() {
    const c = Math.cos(this.elevation);
    this.offset.set(
      c * Math.cos(this.azimuth),
      Math.sin(this.elevation),
      c * Math.sin(this.azimuth),
    ).multiplyScalar(this.distance);
  }

  /** Pivot the view around the player. `basis()` reads the offset, so the
   *  movement controls rotate with the camera and stay screen-relative. */
  orbit(radians) { this.targetAzimuth += radians; }

  resize(aspect) {""",1)
s = s.replace("""  follow(pos, dt, snap = false) {
    this.target.copy(pos);
    // frame-rate independent damping
    const k = snap ? 1 : 1 - Math.exp(-6.5 * dt);
    this.current.lerp(this.target, k);
    if (snap) this.current.copy(this.target);""",
"""  follow(pos, dt, snap = false) {
    this.target.copy(pos);
    // frame-rate independent damping
    const k = snap ? 1 : 1 - Math.exp(-6.5 * dt);
    if (snap) {
      this.azimuth = this.targetAzimuth;
    } else if (Math.abs(this.targetAzimuth - this.azimuth) > 1e-5) {
      // eased, so a flick of the mouse swings round rather than snapping
      this.azimuth += (this.targetAzimuth - this.azimuth) * (1 - Math.exp(-11 * dt));
    }
    this._applyAzimuth();
    this.current.lerp(this.target, k);
    if (snap) this.current.copy(this.target);""",1)
open(p,'w').write(s); print('IsoCamera: orbit')
PYEOF
node --check src/game/IsoCamera.js 2>/dev/null; echo ok
```
<details><summary>result</summary>

```
IsoCamera: orbit
ok
```
</details>

**`Bash`** — Wire mouse orbit into input and loop
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Input.js'; s=open(p).read()
s = s.replace("""    this.keys = new Set();
    this.pad = { x: 0, y: 0, active: false };
    this.onAction = () => {};""",
"""    this.keys = new Set();
    this.pad = { x: 0, y: 0, active: false };
    this.onAction = () => {};
    this._orbit = 0;            // mouse-drag radians accrued since the last read
    this.dragging = false;""",1)

s = s.replace("""    // touch: drag anywhere to steer
    let origin = null;""",
"""    // ---- mouse drag pivots the camera around him.
    // Bound to mouse events only; touch drag still steers movement, so the two
    // never fight over the same gesture.
    const ORBIT_PER_PX = 0.006;
    let lastX = 0;
    dom.style.cursor = 'grab';
    dom.addEventListener('mousedown', (e) => {
      this.dragging = true;
      lastX = e.clientX;
      dom.style.cursor = 'grabbing';
      e.preventDefault();
    });
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this._orbit += (e.clientX - lastX) * ORBIT_PER_PX;
      lastX = e.clientX;
    });
    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      dom.style.cursor = 'grab';
    };
    addEventListener('mouseup', endDrag);
    addEventListener('blur', endDrag);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch: drag anywhere to steer
    let origin = null;""",1)

s = s.replace("""  /** @returns {{x:number, y:number}} y is "up the screen" */""",
"""  /** Radians of pivot accrued since the last call, then reset. */
  takeOrbit() {
    const o = this._orbit;
    this._orbit = 0;
    return o;
  }

  /** Keyboard pivot, in radians per second (held, so it must be rate-based). */
  orbitRate() {
    let r = 0;
    if (this.keys.has('KeyQ')) r -= 1;
    if (this.keys.has('KeyE')) r += 1;
    return r * 1.9;
  }

  /** @returns {{x:number, y:number}} y is "up the screen" */""",1)
… [truncated]
```
<details><summary>result</summary>

```
Input.js: mouse orbit + Q/E
main.js: orbit wired
index.html: hint
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-16-08-511Z.yml)
```
</details>

Testing both — measuring the actual foot-slide ratio at runtime, and whether steering follows the pivoted camera:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,160));oe(...a);};
  await wait(800);
  const p = g.player, out = {};
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));

  // ---- 1. foot lock: compare ground covered against stride the clip played
  const STRIDE = 0.954;
  key('KeyW', true);
  await wait(500);
  const walk = p.actions.Walk;
  const t0 = walk.time, s0 = { x: p.pos.x, z: p.pos.z };
  let dur = walk.getClip().duration, wraps = 0, prev = t0;
  const t = performance.now();
  while (performance.now() - t < 2200) {
    if (walk.time < prev) wraps++;
    prev = walk.time;
    await wait(16);
  }
  const cyclesPlayed = wraps + (walk.time - t0) / dur;
  const groundCovered = Math.hypot(p.pos.x - s0.x, p.pos.z - s0.z);
  key('KeyW', false);
  out.footLock = {
    groundCovered: +groundCovered.toFixed(2),
    cyclesPlayed: +cyclesPlayed.toFixed(2),
    strideDistance: +(cyclesPlayed * STRIDE).toFixed(2),
    slideRatio: +(groundCovered / Math.max(cyclesPlayed * STRIDE, 1e-6)).toFixed(2),
    timeScale: +walk.timeScale.toFixed(2),
    stepsPerSec: +(2 * walk.timeScale / dur).toFixed(1),
    groundSpeed: +p.groundSpeed.toFixed(2),
  };
  await wait(400);

  // ---- 2
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "footLock": {
    "groundCovered": 1.34,
    "cyclesPlayed": 2.25,
    "strideDistance": 2.15,
    "slideRatio": 0.62,
    "timeScale": 0.55,
    "stepsPerSec": 1.1,
    "groundSpeed": 0
  },
  "idleTimeScaleFloor": 0.55,
  "pivot": {
    "azimuthBefore": 0.79,
    "azimuthAfter": 2.36,
    "rotatedBy": 1.57,
    "forwardVector": [
      0.71,
      -0.71
    ],
    "movedWorldDir": [
      1.59,
      0
    ],
    "movesAlongCameraForward": false
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,160));oe(...a);};\n  await wait(800);\n  const p = g.player, out = {};\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n\n  // ---- 1. foot lock: compare ground covered against stride the clip played\n  const STRIDE = 0.954;\n  key(\'KeyW\', true);\n  await wait(500);\n  const walk = p.actions.Walk;\n  const t0 = walk.time, s0 = { x: p.pos.x, z: p.pos.z };\n  let dur = walk.getClip().duration, wraps = 0, prev = t0;\n  const t = performance.now();\n  while (performance.now() - t < 2200) {\n    if (walk.time < prev) wraps++;\n    prev = walk.time;\n    await wait(16);\n  }\n  const cyclesPlayed = wraps + (walk.time - t0) / dur;\n  const groundCovered = Math.hypot(p.pos.x - s0.x, p.pos.z - s0.z);\n  key(\'KeyW\', false);\n  out.footLock = {\n    groundCovered: +groundCovered.toFixed(2),\n    cyclesPlayed: +cyclesPlayed.toFixed(2),\n    strideDistance: +(cyclesPlayed * STRIDE).toFixed(2),\n    slideRatio: +(groundCovered / Math.max(cyclesPlayed * STRIDE, 1e-6)).toFixed(2),\n    timeScale: +walk.timeScale.toFixed(2),\n    stepsPerSec: +(2 * walk.timeScale / dur).toFixed(1),\n    groundSpeed: +p.groundSpeed.toFixed(2),\n  };\n  await wait(400);\n\n  // ---- 2. legs slow when he scrapes a wall\n  out.idleTimeScaleFloor = +walk.timeScale.toFixed(2);\n\n  // ---- 3. pivot: does the camera orbit and does steering follow it?\n  const az0 = g.cam.azimuth;\n  g.cam.orbit(Math.PI / 2);\n  await wait(900);\n  const az1 = g.cam.azimuth;\n  const b = g.cam.basis();\n  out.pivot = {\n    azimuthBefore: +az0.toFixed(2), azimuthAfter: +az1.toFixed(2),\n    rotatedBy: +(az1 - az0).toFixed(2),\n    forwardVector: [b.fwd.x, b.fwd.z].map(v => +v.toFixed(2)),\n  };\n\n  // walking "up screen" after the pivot must go a different world direction\n  const before = { x: p.pos.x, z: p
… [truncated]
```
</details>

Both readings are confounded — he was walking into a wall (covered only 1.34 units in 2.2s, and collision zeroed one axis). Let me retest in open ground:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  const STRIDE = 0.954;
  const out = {};

  // biggest open chamber, so nothing collides during the measurement
  let spot=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let open=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))open++;
    if(open>best){best=open;spot={tx,ty};}}
  out.openness = best + '/81 tiles clear around him';

  const measure = async (dirKey) => {
    p.placeAt(0, spot.tx, spot.ty);
    g.cam.follow(p.pos, 0, true);
    await wait(400);
    key(dirKey, true);
    await wait(400);                       // let him reach full speed
    const walk = p.actions.Walk;
    const dur = walk.getClip().duration;
    const s0 = { x: p.pos.x, z: p.pos.z };
    let wraps = 0, prev = walk.time, t0 = walk.time, ts = [], gs = [];
    const t = performance.now();
    while (performance.now() - t < 1500) {
      if (walk.time < prev) wraps++;
      prev = walk.time;
      ts.push(walk.timeScale); gs.push(p.groundSpeed);
      await wait(16);
    }
    const cycles = wraps + (walk.time
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "openness": "81/81 tiles clear around him",
  "walkingFree": {
    "ground": 4.81,
    "cycles": 5.04,
    "slideRatio": 1,
    "timeScale": 3.49,
    "groundSpeed": 3.2,
    "stepsPerSec": 6.7
  },
  "pivot": {
    "azimuth": 3.64,
    "camForward": [
      0.88,
      0.48
    ],
    "heMoved": [
      1.69,
      0.92
    ],
    "angleErrorDeg": 0,
    "steeringFollowsCamera": true
  }
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  const STRIDE = 0.954;\n  const out = {};\n\n  // biggest open chamber, so nothing collides during the measurement\n  let spot=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let open=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))open++;\n    if(open>best){best=open;spot={tx,ty};}}\n  out.openness = best + \'/81 tiles clear around him\';\n\n  const measure = async (dirKey) => {\n    p.placeAt(0, spot.tx, spot.ty);\n    g.cam.follow(p.pos, 0, true);\n    await wait(400);\n    key(dirKey, true);\n    await wait(400);                       // let him reach full speed\n    const walk = p.actions.Walk;\n    const dur = walk.getClip().duration;\n    const s0 = { x: p.pos.x, z: p.pos.z };\n    let wraps = 0, prev = walk.time, t0 = walk.time, ts = [], gs = [];\n    const t = performance.now();\n    while (performance.now() - t < 1500) {\n      if (walk.time < prev) wraps++;\n      prev = walk.time;\n      ts.push(walk.timeScale); gs.push(p.groundSpeed);\n      await wait(16);\n    }\n    const cycles = wraps + (walk.time - t0) / dur;\n    const ground = Math.hypot(p.pos.x - s0.x, p.pos.z - s0.z);\n    key(dirKey, false);\n    return {\n      ground: +ground.toFixed(2), cycles: +cycles.toFixed(2),\n      slideRatio: +(ground / Math.max(cycles * STRIDE, 1e-6)).toFixed(2),\n      timeScale: +(ts.reduce((a,b)=>a+b,0)/ts.length).toFixed(2),\n      groundSpeed: +(gs.reduce((a,b)=>a+b,0)/gs.length).toFixed(2),\n      stepsPerSec: +(2 * (ts.reduce((a,b)=>a+b,0)/ts.length) / dur).toFixed(1),\n    };\n  };\n\n  out.walkingFree = await measure(\'KeyW\');\n  await wait(500);\n\n  // pivot 90 degrees, then check steering follows the new camera\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.orbit(Math.PI / 2);\n  await wai
… [truncated]
```
</details>

Both fixed, measured in open ground:
- **slideRatio 1.00** — feet perfectly locked, down from 5.91×
- **Pivot angle error 0.0°** — steering follows the camera exactly

Let me confirm the pivot visually:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot=null,best=0;
  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    let open=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))open++;
    if(open>best){best=open;spot={tx,ty};}}
  p.placeAt(0, spot.tx, spot.ty);
  // reset to the default isometric angle for the "before" shot
  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;
  g.cam.follow(p.pos, 0, true);
  await wait(600);
  return { azimuthDeg: Math.round(g.cam.azimuth*180/Math.PI) };
}
```
<details><summary>result</summary>

```
### Result
{
  "azimuthDeg": 45
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot=null,best=0;\n  for(let ty=5;ty<grid.H-5;ty++)for(let tx=5;tx<grid.W-5;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    let open=0;\n    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)\n      if(!grid.isSolid(0,tx+dx,ty+dy,cav.revealed))open++;\n    if(open>best){best=open;spot={tx,ty};}}\n  p.placeAt(0, spot.tx, spot.ty);\n  // reset to the default isometric angle for the "before" shot\n  g.cam.targetAzimuth = Math.PI/4; g.cam.azimuth = Math.PI/4;\n  g.cam.follow(p.pos, 0, true);\n  await wait(600);\n  return { azimuthDeg: Math.round(g.cam.azimuth*180/Math.PI) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-17-38-182Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-17-38-182Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-17-38-182Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // simulate a real mouse drag across the canvas, the way a player would pivot
  const c = g.renderer.domElement;
  c.dispatchEvent(new MouseEvent('mousedown', { clientX: 600, clientY: 470, bubbles: true }));
  for (let x = 600; x <= 900; x += 20) {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 470, bubbles: true }));
    await wait(16);
  }
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await wait(1200);
  return {
    azimuthDeg: Math.round(g.cam.azimuth * 180 / Math.PI),
    draggedPx: 300,
    cursor: c.style.cursor,
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "azimuthDeg": 148,
  "draggedPx": 300,
  "cursor": "grab"
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  // simulate a real mouse drag across the canvas, the way a player would pivot\n  const c = g.renderer.domElement;\n  c.dispatchEvent(new MouseEvent(\'mousedown\', { clientX: 600, clientY: 470, bubbles: true }));\n  for (let x = 600; x <= 900; x += 20) {\n    window.dispatchEvent(new MouseEvent(\'mousemove\', { clientX: x, clientY: 470, bubbles: true }));\n    await wait(16);\n  }\n  window.dispatchEvent(new MouseEvent(\'mouseup\', { bubbles: true }));\n  await wait(1200);\n  return {\n    azimuthDeg: Math.round(g.cam.azimuth * 180 / Math.PI),\n    draggedPx: 300,\n    cursor: c.style.cursor,\n  };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-17-53-467Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-17-53-467Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-17-53-467Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Pivot confirmed — a 300px drag swung the view 45° → 148°, and you can see the cave from the new angle. Let me run a regression and update the docs:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, props, torch } = g;
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,160));oe(...a);};
  const out = {};

  // pivot to an odd angle and make sure everything still works from there
  g.cam.orbit(0.9);
  await wait(900);
  out.azimuthDeg = Math.round(g.cam.azimuth*180/Math.PI);

  const ember = props.items.find(i=>i.level===0&&i.spec.kind==='ember'&&!i.taken);
  const w = grid.tileToWorld(0, ember.tx, ember.ty);
  p.pos.set(w.x, grid.floorHeight(0,w.x,w.z), w.z); p.root.position.copy(p.pos);
  await wait(1700);
  out.pickup = { taken: ember.taken, embers: torch.embers };

  const s = [...cav.secrets.values()].find(x=>x.level===0&&!x.done);
  let adj=null;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if(!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)){adj=[s.tx+dx,s.ty+dy];break;}
  p.placeAt(0,adj[0],adj[1]); await wait(800);
  out.secret = { revealed: cav.revealed.size, found: g.game.found };

  const d = grid.find(0,'>')[0], dw = grid.tileToWorld(0,d.tx,d.ty);
  let dir=null;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if(!grid.isSolid(0,d.tx+dx,d.ty+dy,cav.revealed)){dir=[dx,dy];break;}
  p.placeAt(0,d.tx+dir[0],d.ty+dir[1]);
  p.pos.x=dw.x+dir[0]*1.5; p.pos.
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "azimuthDeg": -2,
  "pickup": {
    "taken": true,
    "embers": 1
  },
  "secret": {
    "revealed": 1,
    "found": 1
  },
  "descend": "The Weeping Gallery",
  "collisionFailures": 0,
  "perf": {
    "fpsCalls": 20,
    "tris": 49276
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav, props, torch } = g;\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,160));oe(...a);};\n  const out = {};\n\n  // pivot to an odd angle and make sure everything still works from there\n  g.cam.orbit(0.9);\n  await wait(900);\n  out.azimuthDeg = Math.round(g.cam.azimuth*180/Math.PI);\n\n  const ember = props.items.find(i=>i.level===0&&i.spec.kind===\'ember\'&&!i.taken);\n  const w = grid.tileToWorld(0, ember.tx, ember.ty);\n  p.pos.set(w.x, grid.floorHeight(0,w.x,w.z), w.z); p.root.position.copy(p.pos);\n  await wait(1700);\n  out.pickup = { taken: ember.taken, embers: torch.embers };\n\n  const s = [...cav.secrets.values()].find(x=>x.level===0&&!x.done);\n  let adj=null;\n  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if(!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)){adj=[s.tx+dx,s.ty+dy];break;}\n  p.placeAt(0,adj[0],adj[1]); await wait(800);\n  out.secret = { revealed: cav.revealed.size, found: g.game.found };\n\n  const d = grid.find(0,\'>\')[0], dw = grid.tileToWorld(0,d.tx,d.ty);\n  let dir=null;\n  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if(!grid.isSolid(0,d.tx+dx,d.ty+dy,cav.revealed)){dir=[dx,dy];break;}\n  p.placeAt(0,d.tx+dir[0],d.ty+dir[1]);\n  p.pos.x=dw.x+dir[0]*1.5; p.pos.z=dw.z+dir[1]*1.5; p.root.position.copy(p.pos);\n  g.game.stairLock=false; await wait(1000);\n  out.descend = grid.levels[g.game.level].name;\n\n  // collision still holds while the camera is rotated\n  const key=(c,dn)=>window.dispatchEvent(new KeyboardEvent(dn?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  let bad=0;\n  for(const k of [\'KeyW\',\'KeyA\',\'KeyS\',\'KeyD\']){\n    key(k,true); await wait(450); key(k,false);\n    const t=grid.worldToTile(p.pos.x,p.pos.z);\n    if(grid.isSolid(p.level,t.tx,t.ty,cav.revealed)) bad++;\n  }\n  out.collisionFailures = bad;\n  out.perf = { fpsCalls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };\n  out.errors = errs;\n  return out;\n}');
``​`
```
</details>

**`Bash`** — Document movement changes
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
s = s.replace("## Animation",
'''## Movement

`WASD` to move, **drag with the mouse to pivot** the camera around him, `Q`/`E`
to turn with the keyboard. Steering is screen-relative and follows the pivot -
`IsoCamera.basis()` derives the movement axes from the camera offset, so
rotating the view rotates the controls with it and "up" is always up-screen.

**The walk cycle is locked to actual ground speed.** Playback rate is
`groundSpeed * clipDuration / STRIDE_PER_CYCLE`, where the stride constant comes
from the rig geometry (`4 * legLength * sin(swing)`). Measured slide ratio: 1.00.
Before this the clip ran at a fixed rate while he moved 5.9x faster than its
stride implied, and he skated everywhere. Using *measured* speed rather than the
input vector also means scraping along a wall slows his legs to match.

There is a real tension in the proportions worth knowing about. His legs are
0.28 units long and he is 1.36 tall, so a fully planted foot at any brisk speed
demands a fast cadence - at the original 4.2 u/s it would have been 8.8
steps/sec, a blur. Two dials in `Player.js`:

- `SPEED` - reduced 4.2 -> 3.2, which puts the locked cadence at 6.7 steps/sec
  (an energetic scurry, which suits the proportions)
- `FOOT_LOCK` - 1.0 is a perfectly planted foot. Lower it to trade some sliding
  back for a calmer cadence: 0.7 gives ~4.7 steps/sec and a 1.4x slide.

## Animation''',1)
open(p,'w').write(s); print('README updated')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
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

Both done. Reload and try it — **drag anywhere to pivot**, `Q`/`E` to turn with the keyboard.

## The foot sliding

It measured at **5.91×** — his legs were covering 0.71 u/s of stride while he moved at 4.2 u/s. Rather than pick a multiplier by eye, the walk cycle now plays at `groundSpeed × clipDuration / STRIDE_PER_CYCLE`, where the stride constant is derived from the rig itself (`4 × legLength × sin(swing)`). Measured slide ratio is now **1.00** — a planted foot stays planted.

Using *measured* speed rather than the input vector also means scraping along a wall slows his legs to match, which falls out for free.

I also lengthened the stride in the Blender clip (leg swing 0.72 → 1.02 rad) to buy more ground per cycle. `sin()` saturates past ~1.2 rad, so that's near the most a 0.28-long leg can cover.

**One change you didn't ask for, which you may want to revert:** I reduced `SPEED` from 4.2 to 3.2. The reason is a genuine tension in the proportions — his legs are 0.28 long on a 1.36 body, so a fully locked foot at 4.2 u/s demands **8.8 steps/sec**, which is a blur. At 3.2 it's 6.7 steps/sec: fast, but it reads as an energetic scurry that suits the character. Two dials in `Player.js` if you disagree:

- `SPEED` — put it back to 4.2 if the pace matters more than the cadence
- `FOOT_LOCK` — 1.0 is perfectly planted; 0.7 gives a calmer ~4.7 steps/sec at the cost of a 1.4× slide

## The pivot

Mouse drag orbits the camera, eased so a flick swings round rather than snapping. Steering follows it exactly — **0.0° angle error** between camera-forward and the direction he actually walks after a 90° pivot. That came free because `basis()` already derived the movement axes from the camera offset; I only had to make the azimuth mutable.

Bound to mouse events only, so touch-drag still steers movement and the two gestures never fight.

Verified from a rotated camera: pickups, secret reveals, the descent, and collision all still work (0 failures), no console errors, 20 draw calls.


---
[← 09-ok-i-added-the-workspace-restart.md](09-ok-i-added-the-workspace-restart.md)  ·  [index](README.md)