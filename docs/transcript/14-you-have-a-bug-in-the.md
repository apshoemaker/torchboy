# 14. you have a bug in the generated levels now - the stairs and some other objects are floating high in the sky ou

[← index](README.md)

## The prompt

> you have a bug in the generated levels now - the stairs and some other objects are floating high in the sky out of reach (as in this screenshot [Image #3]).  You need to make sure that all objects that are interactive are on the ground.

## What happened

_(the user attached a screenshot here)_

Good catch — and I can see the cause. When I reversed the game to a climb I updated `Cavern.setActiveLevel` to show the level *below*, but left `Props.setActiveLevel` showing `level + 1` — which is now the level **above**, so those props render 9 units overhead. Their emissive materials make them glow even unlit, which is exactly what you're seeing.

**`Bash`** — Confirm the level-visibility mismatch
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== the mismatch ==="
grep -n "level === i" src/game/Props.js
grep -n "idx === i" src/game/Cavern.js
```
<details><summary>result</summary>

```
=== the mismatch ===
69:      const on = !it.taken && (it.level === i || it.level === i + 1);
71:      if (it.light) it.light.visible = on && it.level === i;
53:      node.visible = idx === i || idx === i - 1;
```
</details>

**`Bash`** — Show only the current level for props and cavern
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Props.js'; s=open(p).read()
old = """      const on = !it.taken && (it.level === i || it.level === i + 1);
      it.mesh.visible = on;
      if (it.light) it.light.visible = on && it.level === i;"""
assert old in s
s = s.replace(old,
"""      // ONLY the current level. This used to also show `i + 1`, which was the
      // level BELOW back when the game was a descent - after it was reversed
      // into a climb, i+1 became the level ABOVE and every ember and chest on
      // it hung 9 units over his head, still glowing because they are emissive.
      const on = !it.taken && it.level === i;
      it.mesh.visible = on;
      if (it.light) it.light.visible = on;""", 1)
open(p,'w').write(s)
assert 'it.level === i;' in open(p).read() and 'i + 1' not in open(p).read()
print('Props: current level only - verified')
PYEOF
python3 - <<'PYEOF'
p='src/game/Cavern.js'; s=open(p).read()
old = """      // the one he came up from stays loaded just below him
      node.visible = idx === i || idx === i - 1;"""
assert old in s
s = s.replace(old,
"""      // Only the current level. The floor slab is solid everywhere now (the
      // old stair shaft was a hole you could see down through; it is a walkable
      // staircase since the game became a climb), so a neighbouring level is
      // never visible - it just costs draw calls and invites off-by-one bugs
      // like props hanging in the sky.
      node.visible = idx === i;""", 1)
open(p,'w').write(s)
assert 'idx === i;' in open(p).read()
print('Cavern: current level only - verified')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
Traceback (most recent call last):
  File "<stdin>", line 15, in <module>
AssertionError
Cavern: current level only - verified
BUILD_OK
```
</details>

My assertion was wrong, not the edit — the comment I wrote itself contains `i + 1`. Verifying the actual file state:

**`Bash`** — Verify both visibility fixes landed
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== Props.setActiveLevel now ==="
sed -n '/setActiveLevel/,/^  }/p' src/game/Props.js
echo "=== Cavern.setActiveLevel now ==="
sed -n '/setActiveLevel/,/^  }/p' src/game/Cavern.js | head -14
```
<details><summary>result</summary>

```
=== Props.setActiveLevel now ===
  setActiveLevel(i) {
    for (const it of this.items) {
      // ONLY the current level. This used to also show `i + 1`, which was the
      // level BELOW back when the game was a descent - after it was reversed
      // into a climb, i+1 became the level ABOVE and every ember and chest on
      // it hung 9 units over his head, still glowing because they are emissive.
      const on = !it.taken && it.level === i;
      it.mesh.visible = on;
      if (it.light) it.light.visible = on;
    }
  }
=== Cavern.setActiveLevel now ===
  setActiveLevel(i) {
    this.levels.forEach((node, idx) => {
      if (!node) return;
      // Only the current level. The floor slab is solid everywhere now (the
      // old stair shaft was a hole you could see down through; it is a walkable
      // staircase since the game became a climb), so a neighbouring level is
      // never visible - it just costs draw calls and invites off-by-one bugs
      // like props hanging in the sky.
      node.visible = idx === i;
    });
  }
```
</details>

Both landed. Now let me verify the actual invariant you care about — that every interactive object sits on the ground, on every level:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T18-34-07-215Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-06T18-34-06-874Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  await wait(1200);
  const { grid, props, cavern } = g;
  const errs = [];

  // 1. every prop must sit on its own level's floor
  const offGround = [];
  for (const it of props.items) {
    const floor = grid.floorHeight(it.level, it.mesh.position.x, it.mesh.position.z);
    // bobbing pickups ride up to their bob amplitude above the floor
    const allowed = (it.spec.bob || 0) + (it.spec.y || 0) + 0.05;
    const above = it.mesh.position.y - floor;
    if (above < -0.05 || above > allowed) {
      offGround.push({ kind: it.spec.kind, level: it.level,
                       above: +above.toFixed(2), allowed: +allowed.toFixed(2) });
    }
  }

  // 2. nothing from another level may ever be visible
  const wrongLevelVisible = [];
  for (const lvl of [0, 1, 2]) {
    cavern.setActiveLevel(lvl);
    props.setActiveLevel(lvl);
    for (const it of props.items) {
      if (it.mesh.visible && it.level !== lvl)
        wrongLevelVisible.push({ kind: it.spec.kind, on: it.level, showingOn: lvl });
      if (it.light && it.light.visible && it.level !== lvl)
        wrongLevelVisible.push({ kind: it.spec.kind + ' LIGHT', on: it.level, showingOn: lvl });
    }
    cavern.levels.forEach((n, idx) => {
      if (n.visible && idx !== lvl) wrongLevelVisible.push({ kind: 'cavern', on: idx, showi
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "propsChecked": 26,
  "offGround": [],
  "offGroundCount": 0,
  "wrongLevelVisible": [],
  "wrongLevelCount": 0,
  "floatHeightIfBuggy": 9,
  "perLevelCounts": [
    9,
    9,
    8
  ]
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  await wait(1200);\n  const { grid, props, cavern } = g;\n  const errs = [];\n\n  // 1. every prop must sit on its own level\'s floor\n  const offGround = [];\n  for (const it of props.items) {\n    const floor = grid.floorHeight(it.level, it.mesh.position.x, it.mesh.position.z);\n    // bobbing pickups ride up to their bob amplitude above the floor\n    const allowed = (it.spec.bob || 0) + (it.spec.y || 0) + 0.05;\n    const above = it.mesh.position.y - floor;\n    if (above < -0.05 || above > allowed) {\n      offGround.push({ kind: it.spec.kind, level: it.level,\n                       above: +above.toFixed(2), allowed: +allowed.toFixed(2) });\n    }\n  }\n\n  // 2. nothing from another level may ever be visible\n  const wrongLevelVisible = [];\n  for (const lvl of [0, 1, 2]) {\n    cavern.setActiveLevel(lvl);\n    props.setActiveLevel(lvl);\n    for (const it of props.items) {\n      if (it.mesh.visible && it.level !== lvl)\n        wrongLevelVisible.push({ kind: it.spec.kind, on: it.level, showingOn: lvl });\n      if (it.light && it.light.visible && it.level !== lvl)\n        wrongLevelVisible.push({ kind: it.spec.kind + \' LIGHT\', on: it.level, showingOn: lvl });\n    }\n    cavern.levels.forEach((n, idx) => {\n      if (n.visible && idx !== lvl) wrongLevelVisible.push({ kind: \'cavern\', on: idx, showingOn: lvl });\n    });\n  }\n  cavern.setActiveLevel(g.game.level);\n  props.setActiveLevel(g.game.level);\n\n  // 3. how high WOULD a wrong-level prop have floated? (the reported symptom)\n  const drop = grid.doc.levelDrop;\n\n  return {\n    propsChecked: props.items.length,\n    offGround,\n    offGroundCount: offGround.length,\n    wrongLevelVisible,\n    wrongLevelCount: wrongLevelVisible.length,\n    floatHeightIfBuggy: drop,\n    perLevelCounts: [0,1,2].map(l => props.items.filter(i => i.level === l).length),\n  };\n}');
``​`
```
</details>

All 26 props sit on their floor, and nothing from another level is visible on any of the three. Let me add a boot-time check so this class of off-by-one can't recur silently, then confirm visually:

**`Bash`** — Add a boot-time props self-check
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Props.js'; s=open(p).read()
anchor = "  setActiveLevel(i) {"
assert anchor in s
s = s.replace(anchor,
"""  /**
   * Boot-time self-check. Reversing the game from a descent to a climb turned
   * an `i + 1` in setActiveLevel from "the level below" into "the level above",
   * and every pickup on it hung 9 units over his head - visible only because
   * they are emissive. Cheap to verify, and it would have caught that instantly.
   */
  selfCheck(grid) {
    const bad = [];
    for (const it of this.items) {
      const floor = grid.floorHeight(it.level, it.mesh.position.x, it.mesh.position.z);
      const slack = (it.spec.bob || 0) + (it.spec.y || 0) + 0.05;
      const above = it.mesh.position.y - floor;
      if (above < -0.05 || above > slack) bad.push(`${it.spec.kind}@L${it.level} ${above.toFixed(2)}u`);
    }
    for (let lvl = 0; lvl < grid.levels.length; lvl++) {
      this.setActiveLevel(lvl);
      for (const it of this.items)
        if (it.mesh.visible && it.level !== lvl)
          bad.push(`${it.spec.kind} from L${it.level} visible on L${lvl}`);
    }
    if (bad.length) console.warn('[props] off the ground or on the wrong level:', bad);
    return bad;
  }

""" + anchor, 1)
open(p,'w').write(s)
assert 'selfCheck(grid)' in open(p).read()
print('Props.selfCheck added - verified')
PYEOF
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()
anchor = "  bestowal = new Bestowal(scene);"
assert anchor in s
s = s.replace(anchor, "  props.selfCheck(grid);\n" + anchor, 1)
open(p,'w').write(s)
assert 'props.selfCheck(grid);' in open(p).read()
print('wired at boot - verified')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
Props.selfCheck added - verified
wired at boot - verified
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
- [Snapshot](.playwright-mcp/page-2026-09-06T18-34-55-588Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-06T18-34-55-392Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const warns=[]; const ow=console.warn;
  console.warn=(...a)=>{warns.push(a.map(String).join(' ').slice(0,200));ow(...a);};
  await wait(1400);
  const { grid, props, player: p, torch, cavern } = g;

  // stand him beside a prop so a screenshot shows one on the ground
  const near = props.items
    .filter(it => it.level === 0 && !it.taken && it.spec.kind !== 'up' && it.spec.kind !== 'down')
    .sort((a,b) => 0)[0];
  const w = grid.tileToWorld(0, near.tx, near.ty);
  // a couple of tiles off, so it is in frame but not yet collected
  let spot=null;
  for(let d=3; d<=4 && !spot; d++)
    for(let a=0;a<40 && !spot;a++){
      const ang=(a/40)*Math.PI*2;
      const tx=Math.round((w.x+Math.cos(ang)*d)/grid.tileSize+grid.W/2-0.5);
      const ty=Math.round((w.z+Math.sin(ang)*d)/grid.tileSize+grid.H/2-0.5);
      if(!grid.isSolid(0,tx,ty,cavern.revealed)) spot={tx,ty};
    }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.setZoom(13, innerWidth/innerHeight);
  g.cam.follow(p.pos, 0, true);
  await wait(900);

  const floor = grid.floorHeight(0, near.mesh.position.x, near.mesh.position.z);
  return {
    selfCheckWarnings: warns.filter(w => w.includes('[props]')),
    sampleProp: { kind: near.spec.kind,
                  aboveFloor: +(near.mesh.position.y - floor).toFixed(3),
          
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "selfCheckWarnings": [],
  "sampleProp": {
    "kind": "ember",
    "aboveFloor": 0.18,
    "visible": true
  },
  "visiblePropsAllCurrentLevel": true,
  "render": {
    "calls": 24,
    "tris": 27808
  }
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const warns=[]; const ow=console.warn;\n  console.warn=(...a)=>{warns.push(a.map(String).join(\' \').slice(0,200));ow(...a);};\n  await wait(1400);\n  const { grid, props, player: p, torch, cavern } = g;\n\n  // stand him beside a prop so a screenshot shows one on the ground\n  const near = props.items\n    .filter(it => it.level === 0 && !it.taken && it.spec.kind !== \'up\' && it.spec.kind !== \'down\')\n    .sort((a,b) => 0)[0];\n  const w = grid.tileToWorld(0, near.tx, near.ty);\n  // a couple of tiles off, so it is in frame but not yet collected\n  let spot=null;\n  for(let d=3; d<=4 && !spot; d++)\n    for(let a=0;a<40 && !spot;a++){\n      const ang=(a/40)*Math.PI*2;\n      const tx=Math.round((w.x+Math.cos(ang)*d)/grid.tileSize+grid.W/2-0.5);\n      const ty=Math.round((w.z+Math.sin(ang)*d)/grid.tileSize+grid.H/2-0.5);\n      if(!grid.isSolid(0,tx,ty,cavern.revealed)) spot={tx,ty};\n    }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.setZoom(13, innerWidth/innerHeight);\n  g.cam.follow(p.pos, 0, true);\n  await wait(900);\n\n  const floor = grid.floorHeight(0, near.mesh.position.x, near.mesh.position.z);\n  return {\n    selfCheckWarnings: warns.filter(w => w.includes(\'[props]\')),\n    sampleProp: { kind: near.spec.kind,\n                  aboveFloor: +(near.mesh.position.y - floor).toFixed(3),\n                  visible: near.mesh.visible },\n    visiblePropsAllCurrentLevel: props.items\n      .filter(i => i.mesh.visible).every(i => i.level === g.game.level),\n    render: { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles },\n  };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T18-35-20-708Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T18-35-20-708Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T18-35-20-708Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Everything's grounded now — the ember and the stairs sit on the floor, nothing overhead. But I want to check those dark rectangles on the ground before calling it done, since I recently ported the mesh generation and could have introduced bad geometry:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const before = g.renderer.shadowMap.enabled;
  // if the dark quads are shadows they vanish; if they are geometry they stay
  g.renderer.shadowMap.enabled = false;
  g.scene.traverse(o => { if (o.isMesh) o.material.needsUpdate = true; });
  await wait(600);
  const meshes = [];
  g.cavern.root.traverse(o => { if (o.isMesh && o.visible) meshes.push(o.name); });
  return {
    shadowsNowOff: !g.renderer.shadowMap.enabled,
    visibleCavernMeshes: meshes,
    propMeshesVisible: g.props.items.filter(i => i.mesh.visible).map(i => i.spec.kind),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "shadowsNowOff": true,
  "visibleCavernMeshes": [
    "L0_floor",
    "L0_rock",
    "L0_secret_18_6",
    "L0_secret_33_8",
    "L0_secret_16_23",
    "L0_deco",
    "L0_crystal",
    "L1_floor",
    "L1_rock",
    "L1_secret_22_6",
    "L1_secret_29_8",
    "L1_deco",
    "L1_crystal",
    "L2_floor",
    "L2_rock",
    "L2_secret_17_10",
    "L2_secret_8_16",
    "L2_deco",
    "L2_crystal"
  ],
  "propMeshesVisible": [
    "ember",
    "ember",
    "ember",
    "ember",
    "ember",
    "ember",
    "ember",
    "treasure",
    "up"
  ]
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const before = g.renderer.shadowMap.enabled;\n  // if the dark quads are shadows they vanish; if they are geometry they stay\n  g.renderer.shadowMap.enabled = false;\n  g.scene.traverse(o => { if (o.isMesh) o.material.needsUpdate = true; });\n  await wait(600);\n  const meshes = [];\n  g.cavern.root.traverse(o => { if (o.isMesh && o.visible) meshes.push(o.name); });\n  return {\n    shadowsNowOff: !g.renderer.shadowMap.enabled,\n    visibleCavernMeshes: meshes,\n    propMeshesVisible: g.props.items.filter(i => i.mesh.visible).map(i => i.spec.kind),\n  };\n}');
``​`
```
</details>

That listing is misleading — child meshes keep `visible = true` even when their parent group is hidden, so it isn't evidence of a bug. Let me confirm properly and see the shadowless view:

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T18-35-56-077Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T18-35-56-077Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T18-35-56-077Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Confirmed — they were shadows, not geometry. That toggle was runtime-only, so a reload restores them. Final check on a fresh session:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T18-36-06-634Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-06T18-36-06-446Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const warns=[]; const ow=console.warn; const errs=[]; const oe=console.error;
  console.warn=(...a)=>{warns.push(a.map(String).join(' ').slice(0,200));ow(...a);};
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,200));oe(...a);};
  await wait(1400);
  const { grid, props, cavern, player: p } = g;

  // group-level visibility, done correctly this time
  const groupVis = cavern.levels.map((n,i) => ({ level: i, groupVisible: n.visible }));

  // walk onto an ember and confirm it is still reachable and collectable
  const em = props.items.find(i => i.level===0 && i.spec.kind==='ember' && !i.taken);
  const w = grid.tileToWorld(0, em.tx, em.ty);
  const floorUnderIt = grid.floorHeight(0, w.x, w.z);
  const heightAbove = em.mesh.position.y - floorUnderIt;
  p.pos.set(w.x, grid.floorHeight(0,w.x,w.z), w.z); p.root.position.copy(p.pos);
  await wait(1600);

  // climb and re-check on every level
  const perLevel = [];
  for (let lvl = 0; lvl < 3; lvl++) {
    cavern.setActiveLevel(lvl); props.setActiveLevel(lvl);
    perLevel.push({
      level: lvl,
      cavernGroupsShown: cavern.levels.filter(n=>n.visible).length,
      propsShown: props.items.filter(i=>i.mesh.visible).length,
      anyFromOtherLevel: props.items.some(i=>i.mesh.visible && i.level!==lvl),
    });
 
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "shadowsOn": true,
  "groupVis": [
    {
      "level": 0,
      "groupVisible": true
    },
    {
      "level": 1,
      "groupVisible": false
    },
    {
      "level": 2,
      "groupVisible": false
    }
  ],
  "emberWasReachable": {
    "heightAboveFloor": -0.074,
    "collected": true
  },
  "perLevel": [
    {
      "level": 0,
      "cavernGroupsShown": 1,
      "propsShown": 8,
      "anyFromOtherLevel": false
    },
    {
      "level": 1,
      "cavernGroupsShown": 1,
      "propsShown": 8,
      "anyFromOtherLevel": false
    },
    {
      "level": 2,
      "cavernGroupsShown": 1,
      "propsShown": 8,
      "anyFromOtherLevel": false
    }
… [truncated]
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

Fixed. Reload and they'll all be on the floor.

## The cause

It was a leftover from reversing the game into a climb. `Props.setActiveLevel` showed `level === i || level === i + 1`. Back when the game was a *descent*, `i + 1` was the level **below** — visible through the old stair shaft, which was a hole in the floor. Once the game became a climb, `i + 1` became the level **above**, so every ember and chest on it hung exactly one `levelDrop` (9 units) over his head.

They stayed visible despite being unlit because they're emissive — which is why they read as glowing objects floating in the dark rather than as obviously wrong geometry.

I'd updated `Cavern.setActiveLevel` to `i - 1` when I made the change but missed the matching line in `Props`.

## The fix

Both now show **only the current level**. That's not just the minimal patch — the old stair shaft was a hole you could see down through, but it's a walkable staircase now, so the floor slab is solid everywhere and a neighbouring level is never visible anyway. It was purely costing draw calls and inviting exactly this off-by-one.

## Guard against a repeat

Added `Props.selfCheck(grid)` at boot, which verifies two things and warns loudly:
- every prop sits on its own level's floor (within its bob amplitude)
- no prop from another level is visible on any level

Verified on a fresh session: **26 props, 0 off the ground, 0 cross-level leaks on any of the three levels**, one cavern group visible at a time, no warnings, no errors. Ember picked up correctly to confirm nothing became unreachable.

One thing I checked before declaring done: there were dark rectangles on the ground in my screenshot, and since I'd just ported the mesh generation from Blender to JS I wanted to rule out degenerate geometry. Toggling `shadowMap` off made them disappear — they're torch shadows from the rubble, not a bug.


---
[← 13-ok-this-is-shaping-up-to.md](13-ok-this-is-shaping-up-to.md)  ·  [index](README.md)