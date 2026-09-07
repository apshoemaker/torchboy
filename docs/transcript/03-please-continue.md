# 3. please continue

[← index](README.md)

## The prompt

> please continue

## What happened

**`Bash`** — Bake shadow fixes into source
```bash
python3 - <<'PYEOF'
p='src/game/Player.js'; s=open(p).read()
s = s.replace('''      // He does NOT cast the torch's shadow. The light lives on his own hand,
      // 0.7 units from his body, so any shadow he casts is projected enormous
      // and blots out the room. A contact shadow grounds him instead.
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; }''',
'''      // He neither casts NOR receives the torch's shadow, both for the same
      // reason: the light lives on his own hand, ~1 unit away.
      //   cast    - his shadow would be projected enormous and blot out the room
      //   receive - his head straddles several faces of the point light's shadow
      //             cube map at that range, which painted a hard pale wedge
      //             across his face
      // A contact shadow grounds him instead.
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }''',1)
open(p,'w').write(s); print('Player.js: no self-shadowing')

p='src/game/Torch.js'; s=open(p).read()
s = s.replace("    this.light.shadow.bias = -0.006;",
              "    this.light.shadow.bias = -0.004;\n    this.light.shadow.normalBias = 0.03;   // curbs acne on the cave's big flat facets",1)
open(p,'w').write(s); print('Torch.js: normalBias')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
Player.js: no self-shadowing
Torch.js: normalBias
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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-49-58-776Z.yml)
```
</details>

Verifying the fix at close range, with him facing camera:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot = null, best = 0;
  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open=0;
    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open>best) { best=open; spot={tx,ty}; }
  }
  p.placeAt(0, spot.tx, spot.ty);
  p.facing = Math.PI / 4;                 // face the camera
  p.root.rotation.y = p.facing;
  p.expr.prevFacing = p.facing;
  const V = p.pos.constructor;
  const target = new V(p.pos.x, p.pos.y + 0.9, p.pos.z);
  g.cam.setZoom(2.4, innerWidth/innerHeight);
  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };
  p.expr.blinkT = 99;
  await wait(800);
  let receiving = 0;
  p.root.traverse(o => { if (o.isMesh && o.receiveShadow) receiving++; });
  return { receivingShadow: receiving, facing: +p.facing.toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "receivingShadow": 0,
  "facing": 0.79
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  p.facing = Math.PI / 4;                 // face the camera\n  p.root.rotation.y = p.facing;\n  p.expr.prevFacing = p.facing;\n  const V = p.pos.constructor;\n  const target = new V(p.pos.x, p.pos.y + 0.9, p.pos.z);\n  g.cam.setZoom(2.4, innerWidth/innerHeight);\n  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };\n  p.expr.blinkT = 99;\n  await wait(800);\n  let receiving = 0;\n  p.root.traverse(o => { if (o.isMesh && o.receiveShadow) receiving++; });\n  return { receivingShadow: receiving, facing: +p.facing.toFixed(2) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-50-14-098Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-50-14-098Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-50-14-098Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Still there — so it isn't shadows. Let me test the other additive element in that area:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const t = g.torch;
  // the halo is a flat billboard sitting right next to a sphere head; where the
  // head is nearer the camera it occludes the sprite, which would draw exactly
  // this kind of hard diagonal edge across the face
  t.halo.visible = false;
  await wait(400);
  return {
    haloHidden: true,
    haloScale: +t.halo.scale.x.toFixed(2),
    haloDepthTest: t.halo.material.depthTest,
    haloToHeadDist: +t.halo.position.distanceTo(g.player.pos).toFixed(2),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "haloHidden": true,
  "haloScale": 0.76,
  "haloDepthTest": true,
  "haloToHeadDist": 1.05
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const t = g.torch;\n  // the halo is a flat billboard sitting right next to a sphere head; where the\n  // head is nearer the camera it occludes the sprite, which would draw exactly\n  // this kind of hard diagonal edge across the face\n  t.halo.visible = false;\n  await wait(400);\n  return {\n    haloHidden: true,\n    haloScale: +t.halo.scale.x.toFixed(2),\n    haloDepthTest: t.halo.material.depthTest,\n    haloToHeadDist: +t.halo.position.distanceTo(g.player.pos).toFixed(2),\n  };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-51-01-792Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-51-01-792Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-51-01-792Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Not the halo either. Looking again at the whole figure, it's not a wedge on the face — his **entire torch-side is blown to white**: shirt, arm, boots too. That's overexposure. When I removed the light's distance cutoff I raised intensity to 52 with physically-correct decay 2, so at ~1 unit his near side clips to pure white and the terminator reads as a hard edge.

**`Bash`** — Retune torch falloff to stop clipping
```bash
python3 - <<'PYEOF'
p='src/game/Torch.js'; s=open(p).read()
s = s.replace('''    // distance = 0 on purpose. A non-zero cutoff makes three.js window the
    // falloff to zero at that radius, which draws a hard-edged disc of light on
    // the floor. Pure inverse-square (decay 2) has no edge at all.
    this.light = new THREE.PointLight(0xffb066, 0, 0, 2.0);''',
'''    // distance = 0 on purpose: a non-zero cutoff makes three.js window the
    // falloff to zero at that radius, which draws a hard-edged disc of light on
    // the floor.
    //
    // decay is deliberately BELOW the physical 2.0. The light rides on the
    // player's own hand, ~1 unit from his body, but has to light a room 6-10
    // units across. True inverse-square over that range is a 36:1 ratio: tune
    // it for the room and his torch-side clips to flat white, with the
    // clipping boundary reading as a hard edge across his face.
    this.light = new THREE.PointLight(0xffb066, 0, 0, 1.45);''',1)
s = s.replace("    this.light.intensity = (52 + p * 40) * glow * this._flick;",
              "    this.light.intensity = (13 + p * 11) * glow * this._flick;",1)
open(p,'w').write(s); print('torch falloff retuned')
PYEOF
node -e "
for (const decay of [1.45]) for (const I of [13]) {
  console.log('decay', decay, 'I', I);
  for (const r of [1.05, 2, 3, 5, 8, 12])
    console.log('   r=' + String(r).padStart(5) + '  E=' + (I/Math.pow(r,decay)).toFixed(2));
}" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
torch falloff retuned
decay 1.45 I 13
   r= 1.05  E=12.11
   r=    2  E=4.76
   r=    3  E=2.64
   r=    5  E=1.26
   r=    8  E=0.64
   r=   12  E=0.35
```
</details>

r=1.05 still clips. The deeper issue is structural: his body sits closer to the light than the floor does. Let me push the *light* outward from his body while the visible flame stays on the torch tip:

**`Bash`** — Push light away from body, retune
```bash
python3 - <<'PYEOF'
p='src/game/Torch.js'; s=open(p).read()
s = s.replace("export class Torch {",
'''const _flamePos = new THREE.Vector3();
const _bodyPos = new THREE.Vector3();
const _out = new THREE.Vector3();

export class Torch {''',1)
s = s.replace("    this.anchor = null;\n    this._t = 0;",
'''    this.anchor = null;
    this.body = null;
    // How far to push the LIGHT out past the flame, away from his body. The
    // visible flame stays on the torch tip; only the light source moves. His
    // body would otherwise sit closer to the lamp than the floor it has to
    // illuminate, so no intensity can light the room without frying him.
    this.pushOut = 0.85;
    this._t = 0;''',1)
s = s.replace("  attachTo(node) { this.anchor = node; }",
              "  attachTo(node, body) { this.anchor = node; this.body = body; }",1)
s = s.replace('''    if (this.anchor) {
      this.anchor.getWorldPosition(this.light.position);
      this.halo.position.copy(this.light.position);
    }''',
'''    if (this.anchor) {
      this.anchor.getWorldPosition(_flamePos);
      this.halo.position.copy(_flamePos);           // the glow stays on the tip
      if (this.body) {
        this.body.getWorldPosition(_bodyPos);
        _bodyPos.y += 0.9;                          // aim from his chest, not his feet
        _out.subVectors(_flamePos, _bodyPos);
        if (_out.lengthSq() > 1e-6) _out.normalize();
        else _out.set(0, 1, 0);
        this.light.position.copy(_flamePos).addScaledVector(_out, this.pushOut);
      } else {
        this.light.position.copy(_flamePos);
      }
    }''',1)
s = s.replace("    this.light.intensity = (13 + p * 11) * glow * this._flick;",
              "    this.light.intensity = (11 + p * 9) * glow * this._flick;",1)
s = s.replace("this.light = new THREE.PointLight(0xffb066, 0, 0, 1.45);",
              "this.light = new THREE.PointLight(0xffb066, 0, 0, 1.5);",1)
open(p,'w').write(s); print('light pushed out')
PYEOF
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace("torch.attachTo(player.flame || player.root);",
              "torch.attachTo(player.flame || player.root, player.root);",1)
open(p,'w').write(s); print('main wir
… [truncated]
```
<details><summary>result</summary>

```
light pushed out
main wired
body ~ 1.90 floor ~2.5-4
  r= 1.9  E=4.20
  r= 2.5  E=2.78
  r=   3  E=2.12
  r=   4  E=1.38
  r=   6  E=0.75
  r=  10  E=0.35
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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-52-32-533Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot = null, best = 0;
  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open=0;
    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open>best) { best=open; spot={tx,ty}; }
  }
  p.placeAt(0, spot.tx, spot.ty);
  p.facing = Math.PI/4; p.root.rotation.y = p.facing; p.expr.prevFacing = p.facing;
  const V = p.pos.constructor;
  const target = new V(p.pos.x, p.pos.y + 0.9, p.pos.z);
  g.cam.setZoom(2.4, innerWidth/innerHeight);
  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };
  p.expr.blinkT = 99;
  await wait(700);

  // measure clipping directly: how many pixels are fully blown out?
  const c = g.renderer.domElement;
  const rc = document.createElement('canvas');
  rc.width = c.width; rc.height = c.height;
  rc.getContext('2d').drawImage(c, 0, 0);
  const d = rc.getContext('2d').getImageData(0,0,rc.width,rc.height).data;
  let blown = 0, total = 0;
  for (let i = 0; i < d.length; i += 4) {
    total++;
    if (d[i] > 250 && d[i+1] > 250 && d[i+2] > 250) blown++;
  }
  return { lightPos: g.torch.light.position.to
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "lightPos": [
    -9.5,
    0.64,
    -15.53
  ],
  "bodyDist": 1.57,
  "intensity": 10.7,
  "blownPixelPct": 0
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  p.facing = Math.PI/4; p.root.rotation.y = p.facing; p.expr.prevFacing = p.facing;\n  const V = p.pos.constructor;\n  const target = new V(p.pos.x, p.pos.y + 0.9, p.pos.z);\n  g.cam.setZoom(2.4, innerWidth/innerHeight);\n  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };\n  p.expr.blinkT = 99;\n  await wait(700);\n\n  // measure clipping directly: how many pixels are fully blown out?\n  const c = g.renderer.domElement;\n  const rc = document.createElement(\'canvas\');\n  rc.width = c.width; rc.height = c.height;\n  rc.getContext(\'2d\').drawImage(c, 0, 0);\n  const d = rc.getContext(\'2d\').getImageData(0,0,rc.width,rc.height).data;\n  let blown = 0, total = 0;\n  for (let i = 0; i < d.length; i += 4) {\n    total++;\n    if (d[i] > 250 && d[i+1] > 250 && d[i+2] > 250) blown++;\n  }\n  return { lightPos: g.torch.light.position.toArray().map(v=>+v.toFixed(2)),\n           bodyDist: +g.torch.light.position.distanceTo(new V(p.pos.x, p.pos.y+0.9, p.pos.z)).toFixed(2),\n           intensity: +g.torch.light.intensity.toFixed(1),\n           blownPixelPct: +(100*blown/total).toFixed(2) };\n}');
``​`
```
</details>

Zero blown-out pixels now. Let me confirm visually:

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-52-50-521Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-52-50-521Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-52-50-521Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The wedge is completely gone — smooth gradient, symmetric face, both brows visible. Let me check the cave still reads at normal zoom after the lighting change:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-52-58-993Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot = null, best = 0;
  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open=0;
    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open>best) { best=open; spot={tx,ty}; }
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  key('KeyW', true);           // held: capture him mid-walk
  await wait(700);
  return { walking: p.state, zoom: g.cam.viewSize };
}
```
<details><summary>result</summary>

```
### Result
{
  "walking": "Walk",
  "zoom": 17
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  key(\'KeyW\', true);           // held: capture him mid-walk\n  await wait(700);\n  return { walking: p.state, zoom: g.cam.viewSize };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-53-13-106Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-53-13-106Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-53-13-106Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The cave got too dark — I cut intensity by more than the pushed-out light bought back. Let me sweep it empirically and pick the brightest setting that still doesn't clip:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const orig = g.torch.update.bind(g.torch);
  let GAIN = 1;
  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= GAIN; };

  const measure = async () => {
    await wait(320);
    const c = g.renderer.domElement;
    const rc = document.createElement('canvas');
    rc.width = c.width; rc.height = c.height;
    rc.getContext('2d').drawImage(c, 0, 0);
    const d = rc.getContext('2d').getImageData(0,0,rc.width,rc.height).data;
    let blown = 0, sum = 0, n = 0, bright = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      sum += l; n++;
      if (d[i] > 250 && d[i+1] > 250 && d[i+2] > 250) blown++;
      if (l > 40) bright++;                      // "readable" pixels
    }
    return { blownPct: +(100*blown/n).toFixed(3), meanLum: +(sum/n).toFixed(1),
             readablePct: +(100*bright/n).toFixed(1) };
  };

  const rows = [];
  for (const gain of [1, 1.6, 2.2, 3.0, 4.0, 5.5]) {
    GAIN = gain;
    rows.push({ gain, ...(await measure()) });
  }
  GAIN = 1;
  g.torch.update = orig;
  return rows;
}
```
<details><summary>result</summary>

```
### Result
[
  {
    "gain": 1,
    "blownPct": 0,
    "meanLum": 0,
    "readablePct": 0
  },
  {
    "gain": 1.6,
    "blownPct": 0,
    "meanLum": 0,
    "readablePct": 0
  },
  {
    "gain": 2.2,
    "blownPct": 0,
    "meanLum": 0,
    "readablePct": 0
  },
  {
    "gain": 3,
    "blownPct": 0,
    "meanLum": 0,
    "readablePct": 0
  },
  {
    "gain": 4,
    "blownPct": 0,
    "meanLum": 0,
    "readablePct": 0
  },
  {
    "gain": 5.5,
    "blownPct": 0,
    "meanLum": 0,
    "readablePct": 0
  }
]
### Ran Playwright code
… [truncated]
```
</details>

That sweep returned all zeros — the readback is blank because the WebGL context has `preserveDrawingBuffer: false`. So my earlier "0% blown pixels" reading was meaningless too; the fix was real but the metric wasn't. Let me judge by actual screenshots instead:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const orig = g.torch.update.bind(g.torch);
  window.__gain = 1.9;
  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= window.__gain; };
  // lift the room without adding to his already-bright torch side
  g.scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 0.34; });
  await wait(500);
  return { gain: window.__gain, torchI: +g.torch.light.intensity.toFixed(1) };
}
```
<details><summary>result</summary>

```
### Result
{
  "gain": 1.9,
  "torchI": 35.3
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const orig = g.torch.update.bind(g.torch);\n  window.__gain = 1.9;\n  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= window.__gain; };\n  // lift the room without adding to his already-bright torch side\n  g.scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 0.34; });\n  await wait(500);\n  return { gain: window.__gain, torchI: +g.torch.light.intensity.toFixed(1) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-54-05-371Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-54-05-371Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-54-05-371Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Still too dim, and the pool has shifted off him. Let me flatten the falloff further — a lower decay spreads light through the room for the same brightness on his body:

**`Bash`** — Flatten falloff, raise exposure and ambient
```bash
python3 - <<'PYEOF'
p='src/game/Torch.js'; s=open(p).read()
s = s.replace("this.light = new THREE.PointLight(0xffb066, 0, 0, 1.5);",
              "this.light = new THREE.PointLight(0xffb066, 0, 0, 1.15);",1)
s = s.replace("    this.light.intensity = (11 + p * 9) * glow * this._flick;",
              "    this.light.intensity = (10.5 + p * 8) * glow * this._flick;",1)
s = s.replace("    this.pushOut = 0.85;", "    this.pushOut = 0.7;",1)
open(p,'w').write(s)

p='src/main.js'; s=open(p).read()
s = s.replace("renderer.toneMappingExposure = 1.15;", "renderer.toneMappingExposure = 1.45;",1)
s = s.replace("new THREE.HemisphereLight(0x25334d, 0x07070c, 0.22)",
              "new THREE.HemisphereLight(0x25334d, 0x07070c, 0.30)",1)
open(p,'w').write(s)
print('retuned')
PYEOF
node -e "
const I=10.5,d=1.15,body=1.75;
console.log('body r='+body+'  E='+(I/Math.pow(body,d)).toFixed(2));
for (const r of [2.5,3,4,6,8,12]) console.log('  r='+String(r).padStart(4)+'  E='+(I/Math.pow(r,d)).toFixed(2));
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
retuned
body r=1.75  E=5.52
  r= 2.5  E=3.66
  r=   3  E=2.97
  r=   4  E=2.13
  r=   6  E=1.34
  r=   8  E=0.96
  r=  12  E=0.60
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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-54-35-961Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot = null, best = 0;
  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open=0;
    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open>best) { best=open; spot={tx,ty}; }
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  key('KeyW', true);
  await wait(650);
  return { state: p.state };
}
```
<details><summary>result</summary>

```
### Result
{
  "state": "Walk"
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  key(\'KeyW\', true);\n  await wait(650);\n  return { state: p.state };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-54-48-849Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-54-48-849Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-54-48-849Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

I'm guessing at values instead of measuring. Let me enable `preserveDrawingBuffer` so pixel readback actually works, and tune against real numbers:

**`Bash`** — Enable pixel readback and fix green torch tint
```bash
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
s = s.replace("const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });",
              "const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance',\n  preserveDrawingBuffer: true });   // lets tooling read pixels back for exposure checks",1)
open(p,'w').write(s); print('preserveDrawingBuffer on')

# fix the sickly green: lerp RGB warm->cold so it passes through white, not green
p='src/game/Torch.js'; s=open(p).read()
s = s.replace("const _out = new THREE.Vector3();",
'''const _out = new THREE.Vector3();
// Warm amber at rest, cold blue-white when a passage is near. These are lerped
// in RGB rather than swept in HUE: a hue sweep from amber to cyan travels
// through green, and a cave lit by green torchlight looks sickly, not eerie.
const WARM = new THREE.Color(1.00, 0.60, 0.26);
const COLD = new THREE.Color(0.70, 0.88, 1.00);''',1)
s = s.replace("""    // warm amber at rest, cooling toward a cold blue-white as a passage nears
    this.light.color.setHSL(0.075 + p * 0.46, 0.85 - p * 0.30, 0.55 + p * 0.10);""",
"""    this.light.color.lerpColors(WARM, COLD, p);""",1)
open(p,'w').write(s); print('torch colour ramp fixed')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
preserveDrawingBuffer on
torch colour ramp fixed
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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-55-31-697Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  let spot = null, best = 0;
  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open=0;
    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open>best) { best=open; spot={tx,ty}; }
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  await wait(300);

  const orig = g.torch.update.bind(g.torch);
  let GAIN = 1;
  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= GAIN; };

  // where is he on screen? measure his box separately from the floor
  const V = p.pos.constructor;
  const proj = (v) => { const q = v.clone().project(g.cam.camera);
    return [ (q.x*0.5+0.5)*g.renderer.domElement.width, (-q.y*0.5+0.5)*g.renderer.domElement.height ]; };
  const [px, py] = proj(new V(p.pos.x, p.pos.y + 0.9, p.pos.z));

  const measure = async () => {
    await wait(260);
    const c = g.renderer.domElement;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const W = c.width, H = c.height;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const at = (x, y) => { const yy = H - 1 - (y|0)
… [truncated]
```
<details><summary>result</summary>

```
### Result
[
  {
    "gain": 1,
    "playerClippedPct": 0,
    "floorMeanLum": 10.6
  },
  {
    "gain": 1.5,
    "playerClippedPct": 0,
    "floorMeanLum": 15.2
  },
  {
    "gain": 2.2,
    "playerClippedPct": 0,
    "floorMeanLum": 21.6
  },
  {
    "gain": 3.2,
    "playerClippedPct": 0,
    "floorMeanLum": 29.6
  },
  {
    "gain": 4.5,
    "playerClippedPct": 0,
    "floorMeanLum": 40.6
  }
]
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  await wait(300);\n\n  const orig = g.torch.update.bind(g.torch);\n  let GAIN = 1;\n  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= GAIN; };\n\n  // where is he on screen? measure his box separately from the floor\n  const V = p.pos.constructor;\n  const proj = (v) => { const q = v.clone().project(g.cam.camera);\n    return [ (q.x*0.5+0.5)*g.renderer.domElement.width, (-q.y*0.5+0.5)*g.renderer.domElement.height ]; };\n  const [px, py] = proj(new V(p.pos.x, p.pos.y + 0.9, p.pos.z));\n\n  const measure = async () => {\n    await wait(260);\n    const c = g.renderer.domElement;\n    const gl = c.getContext(\'webgl2\') || c.getContext(\'webgl\');\n    const W = c.width, H = c.height;\n    const buf = new Uint8Array(W * H * 4);\n    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);\n    const at = (x, y) => { const yy = H - 1 - (y|0); return (yy * W + (x|0)) * 4; };\n    let clipped = 0, pcount = 0, floorSum = 0, floorN = 0;\n    const R = Math.round(H * 0.09);                       // rough player box\n    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {\n      const i = at(px + dx, py + dy);\n      pcount++;\n      if (buf[i] > 248 && buf[i+1] > 248 && buf[i+2] > 248) clipped++;\n    }\n    // floor: a ring further out, below him\n    for (let dy = R*2; dy < R*4; dy += 3) for (let dx = -R*3; dx < R*3; dx += 3) {\n      const i = at(px + dx, py + dy);\n      floorSum += 0.2126*buf[i] + 0.7152*buf[i+1] + 0.0722*buf[i+2]; floorN++;\n    }\n    return { playerClippedPct: +(100*clipped/pcount).toFixed(2),\n       
… [truncated]
```
</details>

Real numbers at last — and they show huge headroom: even at 4.5× the player still clips 0%. The pushed-out light plus flattened decay bought a lot. Let me find where clipping actually starts:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player;
  const orig = g.torch.update.bind(g.torch);
  let GAIN = 1;
  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= GAIN; };
  const V = p.pos.constructor;
  const proj = (v) => { const q = v.clone().project(g.cam.camera);
    return [ (q.x*0.5+0.5)*g.renderer.domElement.width, (-q.y*0.5+0.5)*g.renderer.domElement.height ]; };
  const [px, py] = proj(new V(p.pos.x, p.pos.y + 0.9, p.pos.z));

  const measure = async () => {
    await wait(240);
    const c = g.renderer.domElement;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const W = c.width, H = c.height;
    const buf = new Uint8Array(W*H*4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const at = (x,y) => { const yy = H-1-(y|0); return (yy*W + (x|0))*4; };
    let clipped=0, near=0, pc=0, fs=0, fn=0;
    const R = Math.round(H*0.09);
    for (let dy=-R; dy<=R; dy++) for (let dx=-R; dx<=R; dx++) {
      const i = at(px+dx, py+dy); pc++;
      const mx = Math.max(buf[i],buf[i+1],buf[i+2]);
      if (mx > 248) clipped++;
      if (mx > 235) near++;
    }
    for (let dy=R*2; dy<R*4; dy+=3) for (let dx=-R*3; dx<R*3; dx+=3) {
      const i = at(px+dx, py+dy);
      fs += 0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]; fn++;
    }
    return { clipPct:+(10
… [truncated]
```
<details><summary>result</summary>

```
### Result
[
  {
    "gain": 4.5,
    "clipPct": 0,
    "nearClipPct": 0,
    "floorLum": 38.6
  },
  {
    "gain": 6,
    "clipPct": 0,
    "nearClipPct": 0,
    "floorLum": 52.7
  },
  {
    "gain": 8,
    "clipPct": 0,
    "nearClipPct": 0,
    "floorLum": 60.9
  },
  {
    "gain": 10,
    "clipPct": 0,
    "nearClipPct": 0,
    "floorLum": 74.8
  },
  {
    "gain": 13,
    "clipPct": 0,
    "nearClipPct": 0,
    "floorLum": 83.7
  }
]
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const p = g.player;\n  const orig = g.torch.update.bind(g.torch);\n  let GAIN = 1;\n  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= GAIN; };\n  const V = p.pos.constructor;\n  const proj = (v) => { const q = v.clone().project(g.cam.camera);\n    return [ (q.x*0.5+0.5)*g.renderer.domElement.width, (-q.y*0.5+0.5)*g.renderer.domElement.height ]; };\n  const [px, py] = proj(new V(p.pos.x, p.pos.y + 0.9, p.pos.z));\n\n  const measure = async () => {\n    await wait(240);\n    const c = g.renderer.domElement;\n    const gl = c.getContext(\'webgl2\') || c.getContext(\'webgl\');\n    const W = c.width, H = c.height;\n    const buf = new Uint8Array(W*H*4);\n    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);\n    const at = (x,y) => { const yy = H-1-(y|0); return (yy*W + (x|0))*4; };\n    let clipped=0, near=0, pc=0, fs=0, fn=0;\n    const R = Math.round(H*0.09);\n    for (let dy=-R; dy<=R; dy++) for (let dx=-R; dx<=R; dx++) {\n      const i = at(px+dx, py+dy); pc++;\n      const mx = Math.max(buf[i],buf[i+1],buf[i+2]);\n      if (mx > 248) clipped++;\n      if (mx > 235) near++;\n    }\n    for (let dy=R*2; dy<R*4; dy+=3) for (let dx=-R*3; dx<R*3; dx+=3) {\n      const i = at(px+dx, py+dy);\n      fs += 0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]; fn++;\n    }\n    return { clipPct:+(100*clipped/pc).toFixed(2), nearClipPct:+(100*near/pc).toFixed(2),\n             floorLum:+(fs/fn).toFixed(1) };\n  };\n  const rows = [];\n  for (const gain of [4.5, 6, 8, 10, 13]) { GAIN = gain; rows.push({ gain, ...(await measure()) }); }\n  GAIN = 1; g.torch.update = orig;\n  return rows;\n}');
``​`
```
</details>

ACES never hard-clips — it compresses, which is why the original artifact looked like a hard edge without being literal 255. So the numbers alone won't decide this; let me look at gain 7:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const orig = g.torch.update.bind(g.torch);
  window.__G = 7;
  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= window.__G; };
  await wait(500);
  return { effectiveIntensity: +g.torch.light.intensity.toFixed(1) };
}
```
<details><summary>result</summary>

```
### Result
{
  "effectiveIntensity": 71.2
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const orig = g.torch.update.bind(g.torch);\n  window.__G = 7;\n  g.torch.update = (dt) => { orig(dt); g.torch.light.intensity *= window.__G; };\n  await wait(500);\n  return { effectiveIntensity: +g.torch.light.intensity.toFixed(1) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-56-26-918Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-56-26-918Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-56-26-918Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Gain 7 floods the whole cave and loses the dimness. Trying 3:

**`playwright/browser_evaluate`**
```js
async () => {
  window.__G = 3;
  await new Promise(r => setTimeout(r, 450));
  return { g: window.__G, I: +window.__game.torch.light.intensity.toFixed(1) };
}
```
<details><summary>result</summary>

```
### Result
{
  "g": 3,
  "I": 29.5
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  window.__G = 3;\n  await new Promise(r => setTimeout(r, 450));\n  return { g: window.__G, I: +window.__game.torch.light.intensity.toFixed(1) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-56-43-524Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-56-43-524Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-56-43-524Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

That reads right — a warm pool, silhouetted walls, no hard edge, and he's clearly lit without frying. Baking those values in and removing the tuning-only flag:

**`Bash`** — Bake final lighting values
```bash
python3 - <<'PYEOF'
p='src/game/Torch.js'; s=open(p).read()
s = s.replace("this.light = new THREE.PointLight(0xffb066, 0, 0, 1.15);",
              "this.light = new THREE.PointLight(0xffb066, 0, 0, 1.25);",1)
s = s.replace("    this.light.intensity = (10.5 + p * 8) * glow * this._flick;",
              "    this.light.intensity = (33 + p * 25) * glow * this._flick;",1)
open(p,'w').write(s); print('torch intensity set')

p='src/main.js'; s=open(p).read()
s = s.replace("""const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance',
  preserveDrawingBuffer: true });   // lets tooling read pixels back for exposure checks""",
"""// preserveDrawingBuffer: true here lets tooling read pixels back to measure
// exposure/clipping. It costs performance, so it stays off outside tuning.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });""",1)
open(p,'w').write(s); print('preserveDrawingBuffer removed')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
torch intensity set
preserveDrawingBuffer removed
BUILD_OK
```
</details>

Now a full regression across everything — animation, expression, and gameplay:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-57-11-129Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, props, torch } = g;
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,180)); oe(...a); };
  const out = {};
  const V = p.pos.constructor;
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));

  // --- 1. the mesh actually deforms (this was the core bug)
  const meshes = []; p.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  key('KeyW', true); await wait(300);
  const series = meshes.map(()=>[]);
  for (let s=0;s<12;s++){
    meshes.forEach((m,i)=>{ const v=new V();
      v.fromBufferAttribute(m.geometry.attributes.position, Math.floor(m.geometry.attributes.position.count/2));
      m.applyBoneTransform(Math.floor(m.geometry.attributes.position.count/2), v); series[i].push(v.clone()); });
    await wait(45);
  }
  key('KeyW', false);
  out.deformingPrimitives = series.filter(pts =>
    Math.max(...['x','y','z'].map(ax => Math.max(...pts.map(v=>v[ax])) - Math.min(...pts.map(v=>v[ax])))) > 0.01
  ).length + '/' + meshes.length;

  // --- 2. blinks
  const eyeL = p.root.getObjectByName('eyeL');
  let blinks = 0, minLid = 1, shut = false;
  const t0 = performance.now();
  while (performance.now() - t0 < 8000) {
  
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "deformingPrimitives": "9/9",
  "blinks": {
    "in8s": 2,
    "tightest": 0.09
  },
  "headTurnPeakDeg": 17.3,
  "ember": {
    "taken": true,
    "embers": 1,
    "reactedTo": 0.02
  },
  "secret": {
    "opened": 1,
    "found": 1
  },
  "descend": "The Weeping Gallery",
  "perf": {
    "tris": 49872,
    "calls": 25
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav, props, torch } = g;\n  const errs = []; const oe = console.error;\n  console.error = (...a) => { errs.push(a.map(String).join(\' \').slice(0,180)); oe(...a); };\n  const out = {};\n  const V = p.pos.constructor;\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n\n  // --- 1. the mesh actually deforms (this was the core bug)\n  const meshes = []; p.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });\n  key(\'KeyW\', true); await wait(300);\n  const series = meshes.map(()=>[]);\n  for (let s=0;s<12;s++){\n    meshes.forEach((m,i)=>{ const v=new V();\n      v.fromBufferAttribute(m.geometry.attributes.position, Math.floor(m.geometry.attributes.position.count/2));\n      m.applyBoneTransform(Math.floor(m.geometry.attributes.position.count/2), v); series[i].push(v.clone()); });\n    await wait(45);\n  }\n  key(\'KeyW\', false);\n  out.deformingPrimitives = series.filter(pts =>\n    Math.max(...[\'x\',\'y\',\'z\'].map(ax => Math.max(...pts.map(v=>v[ax])) - Math.min(...pts.map(v=>v[ax])))) > 0.01\n  ).length + \'/\' + meshes.length;\n\n  // --- 2. blinks\n  const eyeL = p.root.getObjectByName(\'eyeL\');\n  let blinks = 0, minLid = 1, shut = false;\n  const t0 = performance.now();\n  while (performance.now() - t0 < 8000) {\n    const l = eyeL.scale.y; minLid = Math.min(minLid, l);\n    if (l < 0.5 && !shut) { blinks++; shut = true; }\n    if (l > 0.85) shut = false;\n    await wait(16);\n  }\n  out.blinks = { in8s: blinks, tightest: +minLid.toFixed(2) };\n\n  // --- 3. head leads a turn\n  let peak = 0;\n  for (let i=0;i<8;i++){\n    key(\'KeyA\',true); await wait(130); peak=Math.max(peak,Math.abs(p.expr.headYaw.v)); key(\'KeyA\',false);\n    key(\'KeyD\',true); await wait(130); peak=Math.max(peak,Math.abs(p.expr.headYaw.v)); key(\'KeyD\',false);\n  }\n  out.headTurnPeakDeg = +(peak*180/Math.PI).toFixed(1);\n\n  // --- 4. gameplay still intact\n  const ember = props.items.find(i => i.level===0 && i.spec.kind===\'ember\');\n  const w = grid.tileToWorld(
… [truncated]
```
</details>

All green. One final look at gameplay zoom:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // back to level 0, open chamber, walking
  const entry = grid.find(0, 'P')[0];
  g.game.level = 0;
  cav.setActiveLevel(0); g.props.setActiveLevel(0);
  let spot = null, best = 0;
  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open=0;
    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open>best) { best=open; spot={tx,ty}; }
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  key('KeyD', true);
  await wait(700);
  return { state: p.state, level: g.game.level };
}
```
<details><summary>result</summary>

```
### Result
{
  "state": "Walk",
  "level": 0
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // back to level 0, open chamber, walking\n  const entry = grid.find(0, \'P\')[0];\n  g.game.level = 0;\n  cav.setActiveLevel(0); g.props.setActiveLevel(0);\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  key(\'KeyD\', true);\n  await wait(700);\n  return { state: p.state, level: g.game.level };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-58-04-463Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-58-04-463Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-58-04-463Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

That shot is my test's fault — I forced `game.level` without going through `enterLevel`, so the HUD and geometry disagree. Reloading clean:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-58-13-991Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  await wait(400);
  key('KeyW', true); key('KeyD', true);      // walk him out of the spawn nook
  await wait(1400);
  return { level: g.game.level, state: g.player.state,
           prox: +g.torch.proximity.toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "level": 0,
  "state": "Walk",
  "prox": 0
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  await wait(400);\n  key(\'KeyW\', true); key(\'KeyD\', true);      // walk him out of the spawn nook\n  await wait(1400);\n  return { level: g.game.level, state: g.player.state,\n           prox: +g.torch.proximity.toFixed(2) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-58-31-034Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-58-31-034Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-58-31-034Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Clean run. Updating the README with what this session uncovered:

**`Bash`** — Update README with animation findings
```bash
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()

s = s.replace('''## Notable implementation details

Each of these was a bug found by playing the thing, and is commented at the site:
''',
'''## Animation

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

## Notable implementation details

Each of these was a bug found by playing the thing, and is commented at the site:

- **Never hold bmesh element references, or indices, across a build.** bmesh
  reallocates its element arrays as the mesh grows, invalidating every Python
  `BMVert` handed out earlier; and indices are no better, because bevel's
  deletions free slots that later geometry reuses and `index_update()` then
  renumbers. Storing bone/material assignment in side tables left **1750 of 1792
  vertices with no vertex group**, so the whole mesh bound to glTF's
  `neutral_bone` and the character never deformed - the clips played, the bones
  moved, and nothing on screen budged. Assignment now lives ON the elements: a
  deform layer for weights, `BMFace.material_index` for m
… [truncated]
```
<details><summary>result</summary>

```
README updated
     196 README.md
?? .gitignore
?? README.md
?? blender/
?? index.html
?? package-lock.json
?? package.json
?? public/
?? src/
?? tools/
```
</details>

**`Bash`** — Full headless asset rebuild and verify
```bash
./tools/build_assets.sh 2>&1 | grep -E "^(L[0-9]|---|all invariants|-rw)" ; echo "=== clip ranges ==="
node <scratch> 2>/dev/null | grep -E "===|head |leg\.L|brow\.L|root "
```
<details><summary>result</summary>

```
L0 The Threshold          floor=560 secrets=2 rooms=[13,13] fuel=4 span=64
L1 The Weeping Gallery    floor=565 secrets=3 rooms=[29,14,13] fuel=4 span=37
L2 The Deep Hollow        floor=417 secrets=3 rooms=[35,15,13] fuel=5 span=32
L0 The Threshold
L1 The Weeping Gallery
L2 The Deep Hollow
all invariants hold
--- build_character
--- build_cavern
--- build_props
-rw-r--r--@ 1 apshoemaker  staff   2.4M Sep  6 09:59 public/models/cavern.glb
-rw-r--r--@ 1 apshoemaker  staff   262K Sep  6 09:59 public/models/props.glb
-rw-r--r--@ 1 apshoemaker  staff   228K Sep  6 09:59 public/models/torchboy.glb
=== clip ranges ===
=== Gather
   head     rotation      22.92 deg
   brow.L   rotation      19.48 deg
   leg.L    rotation       14.9 deg
   root     translation     0.1 u
   brow.L   translation    0.01 u
=== Idle
   head     rotation       15.7 deg
   brow.L   rotation        6.5 deg
   leg.L    rotation       2.83 deg
   root     translation    0.06 u
   brow.L   translation    0.01 u
=== Walk
   leg.L    rotation      41.25 deg
   head     rotation      12.33 deg
   brow.L   rotation       4.01 deg
   root     translation    0.06 u
   brow.L   translation    0.02 u
```
</details>

Final check that the headless rebuild kept the skinning intact:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-59-21-390Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player, V = p.pos.constructor;
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); oe(...a); };

  // any vertex bound to neutral_bone means the skinning regressed
  let neutral = 0, total = 0;
  const skel = [];
  p.root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const bones = o.skeleton.bones.map(b => b.name);
    const si = o.geometry.attributes.skinIndex;
    for (let i = 0; i < si.count; i++) {
      total++;
      if (bones[si.getX(i)] === 'neutral_bone') neutral++;
    }
    skel.push(bones.length);
  });

  const meshes = []; p.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  key('KeyW', true); await wait(300);
  const series = meshes.map(()=>[]);
  for (let s=0;s<12;s++){
    meshes.forEach((m,i)=>{ const n = Math.floor(m.geometry.attributes.position.count/2);
      const v=new V(); v.fromBufferAttribute(m.geometry.attributes.position, n);
      m.applyBoneTransform(n, v); series[i].push(v.clone()); });
    await wait(45);
  }
  key('KeyW', false);
  const deforming = series.filter(pts =>
    Math.max(...['x','y','z'].map(ax => Math.max(...pts.map(v=>v[ax])) - Math.min(..
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "verticesBoundToNeutralBone": 0,
  "totalSkinnedVerts": 1792,
  "deformingPrimitives": "9/9",
  "clips": [
    "Gather",
    "Idle",
    "Walk"
  ],
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const p = g.player, V = p.pos.constructor;\n  const errs = []; const oe = console.error;\n  console.error = (...a) => { errs.push(a.map(String).join(\' \')); oe(...a); };\n\n  // any vertex bound to neutral_bone means the skinning regressed\n  let neutral = 0, total = 0;\n  const skel = [];\n  p.root.traverse(o => {\n    if (!o.isSkinnedMesh) return;\n    const bones = o.skeleton.bones.map(b => b.name);\n    const si = o.geometry.attributes.skinIndex;\n    for (let i = 0; i < si.count; i++) {\n      total++;\n      if (bones[si.getX(i)] === \'neutral_bone\') neutral++;\n    }\n    skel.push(bones.length);\n  });\n\n  const meshes = []; p.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  key(\'KeyW\', true); await wait(300);\n  const series = meshes.map(()=>[]);\n  for (let s=0;s<12;s++){\n    meshes.forEach((m,i)=>{ const n = Math.floor(m.geometry.attributes.position.count/2);\n      const v=new V(); v.fromBufferAttribute(m.geometry.attributes.position, n);\n      m.applyBoneTransform(n, v); series[i].push(v.clone()); });\n    await wait(45);\n  }\n  key(\'KeyW\', false);\n  const deforming = series.filter(pts =>\n    Math.max(...[\'x\',\'y\',\'z\'].map(ax => Math.max(...pts.map(v=>v[ax])) - Math.min(...pts.map(v=>v[ax])))) > 0.01).length;\n\n  return {\n    verticesBoundToNeutralBone: neutral, totalSkinnedVerts: total,\n    deformingPrimitives: `${deforming}/${meshes.length}`,\n    clips: Object.keys(p.actions), errors: errs,\n  };\n}');
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

You were right, and my earlier diagnosis was wrong in the way that mattered. Reload and it should be animated now — the game's still at **http://localhost:5180**.

## The actual bug

**1750 of 1792 vertices had no vertex group.** The whole mesh was bound to glTF's `neutral_bone`, so the clips played, the bones moved, and nothing on screen budged. Only the `flame` bone was weighted — which is why the torch *light* tracked his hand while his body sat frozen in rest pose.

The cause: I was recording bone/material assignment in side tables keyed by bmesh element references, then by indices. Both are unsafe — bmesh reallocates its element arrays as the mesh grows (invalidating earlier `BMVert` handles), and indices are no better because bevel's deletions free slots that later geometry reuses and `index_update()` renumbers. Assignment now lives *on the elements*: a deform layer for weights, `BMFace.material_index` for materials. Zero unassigned, perfect L/R symmetry, 9/9 primitives deforming.

I should flag that I told you earlier the animation "is exported and playing correctly, just too subtle." The clips were fine; the skinning wasn't. I'd measured each bone's own pivot, which barely moves when that bone rotates — a test that couldn't have caught this.

## Second real bug

Every bob was on the wrong axis. A bone's local Y runs *along* the bone, and all of these point +Z, so my `(0, 0, z)` "bobs" pushed him **forward and back instead of up and down**.

## What you asked for

Clips are now baked by sampling continuous functions rather than hand-placed keyframes — no Bezier overshoot, no flat spots, seamless loops. Idle head moves 15.7° (was ~1.7°), walk legs 41°.

On top, `src/game/Expression.js` composes onto the mixer's pose each frame:
- **Head turning** — the big head lags the turn on an under-damped spring, overshoots, settles
- **Look-at** — he physically turns toward what the torch senses (`nearestHidden` now returns a bearing, not just a distance)
- **Blinks** — randomised, with occasional doubles, more frequent when alert (measured: lid closes to 0.09)
- **Brows** — rise with proximity, drift asymmetrically at rest so the face is never still
- **Discovery beat** — brows shoot up, eyes widen to 1.34×, torch jolts, decays over ~1s

## Two things I found while checking

The pale wedge across his face wasn't shadows or the halo — his entire torch-side was compressed to white. A light carried on his own hand can't use physical falloff: it's ~1 unit from his body but must light a 6–10 unit room, a 36:1 ratio. Fixed with sub-physical decay plus pushing the *light* out past the flame while the visible flame stays on the tip. Also the warm→cold ramp now lerps in RGB, because sweeping hue traveled through green and lit the cave sickly.

I also briefly trusted a "0% blown pixels" metric that was reading a blank buffer (`preserveDrawingBuffer` is false). The lighting is tuned against real readback now, then confirmed by eye.

Verified after a full headless rebuild: 0 vertices on `neutral_bone`, 9/9 deforming, no console errors, 25 draw calls.


---
[← 02-we-should-work-on-the-animation.md](02-we-should-work-on-the-animation.md)  ·  [index](README.md)