# 2. we should work on the animation of the character now.  The character is not animated at all, actually.  I woul

[← index](README.md)

## The prompt

> we should work on the animation of the character now.  The character is not animated at all, actually.  I would like smooth fluid motions, head turning slightly when turning the character and expressive eyebrows with eye blinks on a regular basis to make it seem alive.  Maybe the character should be expressive when it finds something and / or is near something interesting.

## What happened

"Not animated at all" is a concrete claim I should verify rather than assume — my earlier test only checked that the *state machine* switched clips, not that anything actually moved. Let me decode the exported animation data directly:

**`Bash`** — Decode exported animation channel data
```bash
cat > <scratch> <<'EOF'
import { readFileSync } from 'node:fs';
const path = '~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb';
const buf = readFileSync(path);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const binOffset = 20 + jsonLen + 8;
const bin = buf.slice(binOffset);

const CT = { 5126: ['getFloat32', 4], 5123: ['getUint16', 2], 5125: ['getUint32', 4] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function read(accIdx) {
  const acc = json.accessors[accIdx];
  const bv = json.bufferViews[acc.bufferView];
  const [fn, sz] = CT[acc.componentType];
  const n = NCOMP[acc.type];
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0));
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const v = [];
    for (let c = 0; c < n; c++) v.push(dv[fn](i * n * sz + c * sz, true));
    out.push(v);
  }
  return out;
}

for (const anim of json.animations) {
  console.log(`\n=== ${anim.name} : ${anim.channels.length} channels`);
  const rows = [];
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler];
    const node = json.nodes[ch.target.node];
    const vals = read(s.output);
    // how much does this channel actually move over the clip?
    let spread = 0;
    for (let c = 0; c < vals[0].length; c++) {
      const col = vals.map(v => v[c]);
      spread = Math.max(spread, Math.max(...col) - Math.min(...col));
    }
    rows.push({ node: node.name, path: ch.target.path, keys: vals.length, spread: +spread.toFixed(4) });
  }
  rows.sort((a, b) => b.spread - a.spread);
  for (const r of rows.slice(0, 8))
    console.log(`   ${r.node.padEnd(8)} ${r.path.padEnd(11)} keys=${String(r.keys).padStart(3)}  spread=${r.spread}`);
  const moving = rows.filter(r => r.spread > 1e-4).length;
  console.log(`   -> ${moving}/${rows.length} channels actually move`);
}
EOF
node <scratch>
```
<details><summary>result</summary>

```
=== Gather : 36 channels
   arm.R    rotation    keys= 30  spread=1.5708
   arm.L    rotation    keys= 30  spread=0.2977
   head     rotation    keys= 30  spread=0.1692
   brow.L   rotation    keys= 30  spread=0.1692
   brow.R   rotation    keys= 30  spread=0.1692
   spine    rotation    keys= 30  spread=0.1494
   leg.L    rotation    keys= 30  spread=0.1097
   leg.R    rotation    keys= 30  spread=0.1097
   -> 12/36 channels actually move

=== Idle : 36 channels
   arm.L    rotation    keys=120  spread=1.797
   brow.L   rotation    keys=120  spread=0.07
   brow.R   rotation    keys=120  spread=0.07
   head     rotation    keys=120  spread=0.03
   arm.R    rotation    keys=120  spread=0.0232
   root     translation keys=120  spread=0.018
   brow.L   translation keys=120  spread=0.016
   brow.R   translation keys=120  spread=0.016
   -> 9/36 channels actually move

=== Walk : 36 channels
   leg.L    rotation    keys= 25  spread=1.9964
   leg.R    rotation    keys= 25  spread=1.9964
   arm.L    rotation    keys= 25  spread=1.7905
   arm.R    rotation    keys= 25  spread=1.5442
   spine    rotation    keys= 25  spread=0.07
   brow.L   rotation    keys= 25  spread=0.0698
   brow.R   rotation    keys= 25  spread=0.0698
   hips     rotation    keys= 25  spread=0.06
   -> 12/36 channels actually move
```
</details>

The clips are real and do move — leg rotations swing properly. So the export isn't empty; something downstream. Let me measure actual bone motion in the browser:

**`Bash`** — Ensure dev server is up
```bash
curl -s -o /dev/null -w "vite: %{http_code}\n" http://localhost:5180/ 2>/dev/null || { (npx vite --port 5180 --strictPort > /tmp/vite.log 2>&1 &); sleep 4; curl -s -o /dev/null -w "vite restarted: %{http_code}\n" http://localhost:5180/; }
```
<details><summary>result</summary>

```
vite: 200
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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-19-17-169Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player;

  const skinned = [];
  p.root.traverse(o => { if (o.isSkinnedMesh) skinned.push({ name: o.name, bones: o.skeleton.bones.length, hasBind: !!o.bindMatrix }); });

  const track = (bone) => {
    const b = p.root.getObjectByName(bone);
    if (!b) return null;
    const v = new (g.player.pos.constructor)();
    b.getWorldPosition(v);
    return [v.x, v.y, v.z];
  };
  const names = ['head', 'leg.L', 'arm.R', 'flame', 'brow.L'];

  // hold a walk key and sample bone world positions over ~1s
  const key = (c,d) => window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  key('KeyW', true);
  await wait(300);
  const samples = [];
  for (let i = 0; i < 12; i++) { samples.push(Object.fromEntries(names.map(n => [n, track(n)]))); await wait(60); }
  key('KeyW', false);

  // range of motion RELATIVE to the root, so walking translation doesn't mask it
  const rel = {};
  for (const n of names) {
    const pts = samples.map(s => s[n]);
    const root = samples.map(s => s['head']);
    const d = pts.map((q, i) => [q[0]-root[i][0], q[1]-root[i][1], q[2]-root[i][2]]);
    rel[n] = [0,1,2].map(c => +(Math.max(...d.map(v=>v[c])) - Math.min(...d.map(v=>v[c]))).toFixed(4));
  }
  return {
    skinned, state: p.state, mixerTime: +p.mixer.time.toF
… [truncated]
```
<details><summary>result</summary>

```
### Error
TypeError: Cannot read properties of null (reading '0')
    at eval (eval at <anonymous> (eval at evaluate (:311:30)), <anonymous>:31:35)
    at Array.map (<anonymous>)
    at eval (eval at <anonymous> (eval at evaluate (:311:30)), <anonymous>:31:19)
    at async eval (eval at evaluate (:311:30), <anonymous>:4:30)
    at async <anonymous>:337:30
```
</details>

A bone lookup returned null — the names are being sanitized. Let me dump what's actually in the loaded graph:

**`playwright/browser_evaluate`**
```js
() => {
  const g = window.__game;
  const names = [];
  g.player.root.traverse(o => names.push(`${o.type}:${o.name}`));
  const clip = g.player.actions.Walk.getClip();
  return {
    graph: names,
    walkTracks: clip.tracks.slice(0, 6).map(t => t.name),
    trackCount: clip.tracks.length,
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "graph": [
    "Group:Scene",
    "Object3D:TorchBoyRig",
    "Group:TorchBoyMesh",
    "SkinnedMesh:TorchBoyMesh_1",
    "SkinnedMesh:TorchBoyMesh_2",
    "SkinnedMesh:TorchBoyMesh_3",
    "SkinnedMesh:TorchBoyMesh_4",
    "SkinnedMesh:TorchBoyMesh_5",
    "SkinnedMesh:TorchBoyMesh_6",
    "SkinnedMesh:TorchBoyMesh_7",
    "SkinnedMesh:TorchBoyMesh_8",
    "SkinnedMesh:TorchBoyMesh_9",
    "Bone:root",
    "Bone:hips",
    "Bone:legL",
    "Bone:legR",
    "Bone:spine",
    "Bone:armL",
    "Bone:armR",
    "Bone:torch",
    "Bone:flame",
    "Bone:head",
    "Bone:browL",
    "Bone:browR",
    "Bone:neutral_bone"
  ],
  "walkTracks": [
    "root.position",
    "root.quaternion",
    "root.scale",
    "hips.position",
    "hips.quaternion",
    "hips.scale"
  ],
  "trackCount": 36
}
### Ran Playwright code
… [truncated]
```
</details>

Names are sanitized (`legL`, `browL`) and tracks match them. Now measuring real motion:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player;
  const V = g.player.pos.constructor;
  const names = ['head', 'legL', 'legR', 'armR', 'flame', 'browL'];
  const bones = Object.fromEntries(names.map(n => [n, p.root.getObjectByName(n)]));
  const rootBone = p.root.getObjectByName('root');

  const snap = () => {
    const rp = new V(); rootBone.getWorldPosition(rp);
    const o = {};
    for (const n of names) {
      const v = new V(); bones[n].getWorldPosition(v);
      o[n] = [v.x - rp.x, v.y - rp.y, v.z - rp.z];   // relative to root
    }
    return o;
  };

  const key = (c,d) => window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  key('KeyW', true);
  await wait(300);
  const samples = [];
  for (let i = 0; i < 14; i++) { samples.push(snap()); await wait(55); }
  key('KeyW', false);

  const range = {};
  for (const n of names) {
    const pts = samples.map(s => s[n]);
    range[n] = [0,1,2].map(c => +(Math.max(...pts.map(v=>v[c])) - Math.min(...pts.map(v=>v[c]))).toFixed(4));
  }
  const q = p.root.getObjectByName('legL').quaternion;
  return {
    state: p.state,
    walkWeight: +p.actions.Walk.getEffectiveWeight().toFixed(2),
    walkTime: +p.actions.Walk.time.toFixed(2),
    mixerTime: +p.mixer.time.toFixed(2),
    legLQuat: [q.x,q.y,q.z,q.w].map(v=>+v.toFixed(3
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "state": "Walk",
  "walkWeight": 1,
  "walkTime": 0.06,
  "mixerTime": 39.72,
  "legLQuat": [
    -0.999,
    -0.017,
    -0.018,
    -0.032
  ],
  "boneMotionRangeRelativeToRoot": {
    "head": [
      0.0092,
      0.0003,
      0.0092
    ],
    "legL": [
      0.0001,
      0.0124,
      0.0001
    ],
    "legR": [
      0.0001,
      0.0124,
      0.0001
    ],
    "armR": [
      0.01,
      0.0039,
      0.01
    ],
    "flame": [
      0.0521,
      0.0571,
      0.0152
    ],
    "browL": [
      0.0539,
… [truncated]
```
</details>

That measurement is decisive — and it corrects my earlier read: `legL` moves 0.0001 units, essentially static. The "spread" I saw in the GLB was quaternion double-cover noise around a ~184° rest rotation, not real motion. **The export baked a static pose.** Let me find out why:

**`blender/execute_blender_code`**
```python

import bpy, traceback
out = {}
try:
    p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py"
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)

    rig = bpy.data.objects["TorchBoyRig"]
    ad = rig.animation_data
    act = bpy.data.actions["Walk"]

    out["nla_tracks"] = [(t.name, t.mute) for t in ad.nla_tracks]
    out["action_slots"] = [s.name_display for s in act.slots]
    out["has_action_slot_attr"] = hasattr(ad, "action_slot")

    def sample(label):
        vals = []
        for f in (1, 7, 13, 19):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            pb = rig.pose.bones["leg.L"]
            vals.append(round(pb.matrix_basis.to_euler().x, 4))
        return {label: vals}

    # (a) action assigned WITHOUT explicitly binding a slot
    ad.action = None
    ad.action = act
    out.update(sample("without_explicit_slot"))

    # (b) action assigned WITH its slot bound
    if hasattr(ad, "action_slot") and len(act.slots):
        ad.action_slot = act.slots[0]
    out.update(sample("with_slot_bound"))
    out["slot_after"] = getattr(ad, "action_slot", None) and ad.action_slot.name_display
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"nla_tracks":[["Idle",true],["Walk",true],["Gather",true]],"action_slots":["TorchBoyRig"],"has_action_slot_attr":true,"without_explicit_slot":[0,-0.62,0,0.62],"with_slot_bound":[0,-0.62,0,0.62],"slot_after":"TorchBoyRig"},"stdout":"09:20:52 | INFO: Starting glTF 2.0 export\n09:20:52 | INFO: Extracting primitive: TorchBoyMesh\n09:20:52 | INFO: Primitives created: 9\n09:20:53 | INFO: Finished glTF 2.0 export in 0.153792142868042 s\n\n"}
```
</details>

Blender's action data is correct (leg swings 0 → -0.62 → 0 → +0.62). So either the export or three.js. Let me decode the actual exported quaternions rather than keep inferring from spread:

**`Bash`** — Decode actual exported quaternion values
```bash
SP=<scratch>
cat > $SP/quat_dump.mjs <<'EOF'
import { readFileSync } from 'node:fs';
const buf = readFileSync('~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const bin = buf.slice(20 + jsonLen + 8);
const NC = { SCALAR:1, VEC3:3, VEC4:4 };
function read(i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = NC[a.type];
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset||0) + (a.byteOffset||0));
  const o = [];
  for (let k = 0; k < a.count; k++) { const v=[]; for (let c=0;c<n;c++) v.push(dv.getFloat32((k*n+c)*4,true)); o.push(v); }
  return o;
}
const anim = json.animations.find(a => a.name === 'Walk');
for (const target of ['legL','armL','head']) {
  const ch = anim.channels.find(c => json.nodes[c.target.node].name === target && c.target.path === 'rotation');
  if (!ch) { console.log(target, 'NO CHANNEL'); continue; }
  const q = read(anim.samplers[ch.sampler].output);
  // angle between consecutive quaternions, sign-corrected (q and -q are the same rotation)
  const ang = [];
  for (let i = 1; i < Math.min(q.length, 13); i++) {
    let d = q[i][0]*q[i-1][0]+q[i][1]*q[i-1][1]+q[i][2]*q[i-1][2]+q[i][3]*q[i-1][3];
    d = Math.abs(Math.min(1, Math.abs(d)));
    ang.push(+(2*Math.acos(d)*180/Math.PI).toFixed(2));
  }
  console.log(target.padEnd(6), 'first q =', q[0].map(v=>v.toFixed(3)).join(','));
  console.log('      step angles (deg):', ang.join(' '));
  // total rotation across the whole clip
  let dd = q[0][0]*q[6][0]+q[0][1]*q[6][1]+q[0][2]*q[6][2]+q[0][3]*q[6][3];
  console.log('      frame0 -> frame6 total:', (2*Math.acos(Math.min(1,Math.abs(dd)))*180/Math.PI).toFixed(2), 'deg');
}
EOF
node $SP/quat_dump.mjs
```
<details><summary>result</summary>

```
legL NO CHANNEL
armL NO CHANNEL
head   first q = 0.010,0.000,0.000,1.000
      step angles (deg): 0.83 1.25 1.5 1.46 1.11 0.44 0.44 1.11 1.46 1.5 1.25 0.83
      frame0 -> frame6 total: 6.41 deg
```
</details>

My measurement was wrong, not the export — I sampled each bone's *own origin*, which barely moves when that bone rotates. Let me measure rotations instead:

**`Bash`** — Re-dump with correct glTF node names
```bash
SP=<scratch>
sed -i '' "s/\['legL','armL','head'\]/['leg.L','arm.L','head','root']/" $SP/quat_dump.mjs
node $SP/quat_dump.mjs
```
<details><summary>result</summary>

```
leg.L  first q = -1.000,-0.018,-0.018,0.000
      step angles (deg): 8.8 8.31 7.32 5.84 3.86 1.4 1.4 3.86 5.84 7.32 8.31 8.8
      frame0 -> frame6 total: 35.52 deg
arm.L  first q = -0.895,-0.315,-0.315,0.015
      step angles (deg): 5.96 5.63 4.96 3.96 2.62 0.95 0.95 2.62 3.96 4.96 5.63 5.96
      frame0 -> frame6 total: 24.06 deg
head   first q = 0.010,0.000,0.000,1.000
      step angles (deg): 0.83 1.25 1.5 1.46 1.11 0.44 0.44 1.11 1.46 1.5 1.25 0.83
      frame0 -> frame6 total: 6.41 deg
root   first q = 0.000,0.000,0.000,1.000
      step angles (deg): 0 0 0 0 0 0 0 0 0 0 0 0
      frame0 -> frame6 total: 0.00 deg
```
</details>

That settles it — the export is correct: `leg.L` swings 35.5°, `arm.L` 24°. I was wrong to call it static; my first measurement sampled each bone's own pivot, which doesn't move when that bone rotates.

So the animation *is* playing. The real problem is it's imperceptible: Idle moves the head 1.7° and sways the arm 2.6° — sub-pixel on a character ~90px tall. And I found a genuine bug while checking the axes:

**`Bash`** — Check root bob axis
```bash
grep -n '"root":  (Z, (0, 0,' blender/build_character.py
```
<details><summary>result</summary>

```
196:            "root":  (Z, (0, 0, -0.018 * abs(amp))),
215:            "root":  (Z, (0, 0, 0.035 * bob)),
244:            "root":  (Z, (0, 0, drop * 2)),
```
</details>

Confirmed a real bug: the root bone points +Z, so its local Y is world-up and local Z is forward/back — every "bob" was pushing him **forward and back, not up and down**. Let me rebuild the animation properly, sampling continuous functions instead of hand-placed keys:

**`Bash`** — Rewrite character animation with sampled curves
```bash
python3 - <<'PYEOF'
p='blender/build_character.py'; s=open(p).read()

# ---------------------------------------------------------------- eye bones
s = s.replace('''    # eyes: small and dark - the eyebrows carry the expression, not the eyes
    for sx in (-1, 1):
        P.add(L.bm_sphere(bm, 0.052, HEAD_C + Vector((0.150 * sx, -0.315, 0.02)),
                          subdiv=2, scale=(1.0, 0.60, 1.15)), "eye", "head")''',
'''    # eyes on their OWN bones so the game can blink and widen them: a face that
    # never blinks reads as a prop, not a character
    for sx, bone in ((-1, "eye.R"), (1, "eye.L")):
        P.add(L.bm_sphere(bm, 0.052, HEAD_C + Vector((0.150 * sx, -0.315, 0.02)),
                          subdiv=2, scale=(1.0, 0.60, 1.15)), "eye", bone)''',1)

s = s.replace('''    for sx, nm in ((-1, "brow.R"), (1, "brow.L")):
        bh = HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z))
        bone(nm, bh, bh + Vector((0, 0, 0.07)), "head")''',
'''    for sx, nm in ((-1, "brow.R"), (1, "brow.L")):
        bh = HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z))
        bone(nm, bh, bh + Vector((0, 0, 0.07)), "head")
    # eye bones sit AT the eye centre and point up, so local-Y scale squashes
    # the eye about its own middle - that is the blink
    for sx, nm in ((-1, "eye.R"), (1, "eye.L")):
        eh = HEAD_C + Vector((0.150 * sx, -0.315, 0.02))
        bone(nm, eh, eh + Vector((0, 0, 0.06)), "head")''',1)

# ---------------------------------------------------------------- animation
start = s.index("# ------------------------------------------------------------------ animation")
end = s.index("def export(col):")
s = s[:start] + '''# ------------------------------------------------------------------ animation
# Clips are BAKED BY SAMPLING continuous functions, not by hand-placing a few
# keyframes and trusting Bezier handles. Sampling gives genuinely fluid motion
# with no handle overshoot and no flat spots at the extremes, and the loop is
# seamless by construction because every term is periodic over the cycle.
#
# Axis note, learned the hard way: a bone's LOCAL Y runs along the bone. Every
# bone here is authored pointing +Z (world up), so pose-space locati
… [truncated]
```
<details><summary>result</summary>

```
animation rewritten
syntax ok
```
</details>

Now the procedural layer — head turning, blinks, and reactions can't be baked clips since they depend on live game state:

**`Bash`** — Write procedural expression layer
```bash
rm -f src/game/Expression.js && cat > src/game/Expression.js <<'EOF'
import * as THREE from 'three';

/**
 * A procedural animation layer applied ON TOP of the baked clips.
 *
 * Everything here depends on live game state - which way he just turned, how
 * close a hidden passage is, whether he just found one - so none of it can be
 * a baked clip. It runs AFTER mixer.update() and COMPOSES onto the pose the
 * mixer just wrote, rather than replacing it, so the walk cycle still shows
 * through the head turn.
 *
 * Bone axis convention (every bone is authored pointing +Z in Blender, so):
 *   local Y = along the bone (up)  -> yaw, and vertical translation
 *   local X = his right           -> pitch / nod
 *   local Z = forward             -> roll / brow tilt
 */
const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

/** Post-multiply a local-axis rotation onto whatever the mixer wrote. */
function addRot(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  bone.quaternion.multiply(_q.setFromAxisAngle(axis, angle));
}

/** Critically-damped-ish spring, frame-rate independent. */
function spring(state, target, dt, stiffness, damping) {
  const a = (target - state.v) * stiffness - state.d * damping;
  state.d += a * dt;
  state.v += state.d * dt;
  return state.v;
}

export class Expression {
  constructor(root) {
    this.b = {};
    for (const n of ['head', 'spine', 'browL', 'browR', 'eyeL', 'eyeR', 'torch', 'armR'])
      this.b[n] = root.getObjectByName(n);

    this.t = 0;
    this.prevFacing = 0;

    // the big head has inertia: it lags a turn, then overshoots and settles
    this.headYaw = { v: 0, d: 0 };
    this.headPitch = { v: 0, d: 0 };
    this.headRoll = { v: 0, d: 0 };

    this.blinkT = 1.2 + Math.random() * 2.5;
    this.blink = 0;            // 0 open .. 1 shut
    this.blinkQueue = 0;

    this.brow = 0;             // -1 furrowed .. +1 raised
    this.browTarget = 0;
    this.eyeWide = 0;
    this.reaction = 0;         // decays after a discovery
    this.lookAt = 0;           // -1..1 yaw toward something interesting
  }
… [truncated]
```
<details><summary>result</summary>

```
Expression module loads, exports: [ 'Expression' ]
```
</details>

Now wiring it in — the head needs to know *where* the sensed passage is so he physically looks at it:

**`Bash`** — Wire expression layer into Player and Cavern
```bash
python3 - <<'PYEOF'
# ---- Player: own the expression layer, apply it after the mixer writes the pose
p='src/game/Player.js'; s=open(p).read()
s = s.replace("import * as THREE from 'three';",
              "import * as THREE from 'three';\nimport { Expression } from './Expression.js';",1)
s = s.replace('''    this.flame = this.root.getObjectByName('flame');''',
'''    this.flame = this.root.getObjectByName('flame');
    this.expr = new Expression(this.root);''',1)
s = s.replace('''  update(dt, axis, basis, revealed) {''',
'''  /**
   * @param mood {proximity, lookYaw} - live game state the face reacts to.
   *   lookYaw is the yaw offset toward whatever he can sense, in radians.
   */
  update(dt, axis, basis, revealed, mood = {}) {''',1)
s = s.replace('''    if (!this.busy) this.play(this.moving ? 'Walk' : 'Idle');
    this.mixer.update(dt);
  }''',
'''    if (!this.busy) this.play(this.moving ? 'Walk' : 'Idle');
    this.mixer.update(dt);

    // MUST come after mixer.update: the expression layer composes onto the
    // pose the mixer just wrote. Run it before and the mixer overwrites it.
    this.expr.update(dt, {
      facing: this.facing,
      proximity: mood.proximity || 0,
      lookYaw: mood.lookYaw ?? null,
      moving: this.moving,
    });
  }

  /** Play the "found it" beat on the face. */
  react(strength) { this.expr.react(strength); }''',1)
open(p,'w').write(s); print('Player.js wired')

# ---- Cavern: where is the nearest hidden thing, so he can look at it
p='src/game/Cavern.js'; s=open(p).read()
s = s.replace('''  /** Distance to the closest secret on this level the player has not found. */
  nearestHidden(level, x, z) {
    let best = Infinity;
    for (const s of this.secrets.values()) {
      if (s.done || s.level !== level) continue;
      const w = this.grid.tileToWorld(level, s.tx, s.ty);
      best = Math.min(best, Math.hypot(w.x - x, w.z - z));
    }
    return best;
  }''',
'''  /**
   * Closest undiscovered secret on this level: distance AND bearing.
   * The bearing lets the character physically turn his head toward what the
   * torch is sensing, which reads far better than a HUD number.
   */
  nearestHidden(level, x, z) {
    let
… [truncated]
```
<details><summary>result</summary>

```
Player.js wired
Cavern.js bearing
src/game/Cavern.js:63:  nearestHidden(level, x, z) {
src/game/Player.js:138:    this.expr.update(dt, {
src/game/Player.js:147:  react(strength) { this.expr.react(strength); }
```
</details>

**`Bash`** — Wire sensing bearing and reactions into main loop
```bash
python3 - <<'PYEOF'
p='src/main.js'; s=open(p).read()

# nearestHidden now returns an object; feed distance to the torch and bearing to the face
s = s.replace('''    const busy = game.transition > 0 || game.won;
    player.update(dt, busy ? { x: 0, y: 0 } : input.axis(), cam.basis(), cavern.revealed);''',
'''    const busy = game.transition > 0 || game.won;

    // sense first: the torch reacts to the distance, the boy to the bearing
    const hidden = cavern.nearestHidden(game.level, player.pos.x, player.pos.z);
    torch.sense(hidden.distance);
    // he only turns his head toward it once the flame is actually stirring
    const lookYaw = (hidden.yaw !== null && torch.proximity > 0.12)
      ? angleDelta(hidden.yaw, player.facing) * torch.proximity
      : null;

    player.update(dt, busy ? { x: 0, y: 0 } : input.axis(), cam.basis(), cavern.revealed,
                  { proximity: torch.proximity, lookYaw });''',1)

s = s.replace('''    // --- the flame feels for the nearest passage it has not found yet, which
    // is what turns searching into a hot/cold hunt instead of wall-bumping
    torch.sense(cavern.nearestHidden(game.level, player.pos.x, player.pos.z));
    const found = cavern.checkReveals(game.level, player.pos.x, player.pos.z, torch.revealRadius);
    if (found) {
      game.found += found;
      hud.setFound(game.found, game.totalSecrets);
      hud.toast(found > 1 ? `${found} passages open!` : 'A passage opens...');
    }''',
'''    const found = cavern.checkReveals(game.level, player.pos.x, player.pos.z, torch.revealRadius);
    if (found) {
      game.found += found;
      hud.setFound(game.found, game.totalSecrets);
      hud.toast(found > 1 ? `${found} passages open!` : 'A passage opens...');
      player.react(1);                       // brows up, eyes wide, torch jumps
    }''',1)

s = s.replace('''addEventListener('resize', () => {''',
'''/** Shortest signed angle from b to a, in (-PI, PI]. */
function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

addEventListener('resize', () => {''',1)

# a smaller beat when picking something up
s = s.replace('''     
… [truncated]
```
<details><summary>result</summary>

```
main.js wired
119:    const lookYaw = (hidden.yaw !== null && torch.proximity > 0.12)
120:      ? angleDelta(hidden.yaw, player.facing) * torch.proximity
124:                  { proximity: torch.proximity, lookYaw });
139:      player.react(1);                       // brows up, eyes wide, torch jumps
167:      player.react(0.55);
172:      player.react(0.9);
205:function angleDelta(a, b) {
```
</details>

**`Bash`** — Rebuild character with new animation and eye bones
```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_character.py 2>&1 | grep -iE "error|traceback" | head -10
echo "--- verify export ---"
node <scratch> 2>&1 | grep -E "===|->"
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -5; echo BUILD_OK
```
<details><summary>result</summary>

```
--- verify export ---
=== Gather : 42 channels
   -> 13/42 channels actually move
=== Idle : 42 channels
   -> 13/42 channels actually move
=== Walk : 42 channels
   -> 13/42 channels actually move
BUILD_OK
```
</details>

42 channels now (the eye bones added). Let me verify the *actual* rotation magnitudes with the corrected angle test — especially Idle, which was the dead one:

**`Bash`** — Measure true rotation ranges per clip
```bash
SP=<scratch>
cat > $SP/anim_range.mjs <<'EOF'
import { readFileSync } from 'node:fs';
const buf = readFileSync('~/proj/me/learn/blender-mcp/cavern-game/public/models/torchboy.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const bin = buf.slice(20 + jsonLen + 8);
const NC = { SCALAR:1, VEC3:3, VEC4:4 };
function read(i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = NC[a.type];
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset||0) + (a.byteOffset||0));
  const o = [];
  for (let k=0;k<a.count;k++){const v=[];for(let c=0;c<n;c++)v.push(dv.getFloat32((k*n+c)*4,true));o.push(v);}
  return o;
}
const deg = r => (r*180/Math.PI);
for (const anim of json.animations) {
  console.log(`\n=== ${anim.name}`);
  const rows = [];
  for (const ch of anim.channels) {
    const name = json.nodes[ch.target.node].name;
    const vals = read(anim.samplers[ch.sampler].output);
    let metric = 0, unit = '';
    if (ch.target.path === 'rotation') {
      // widest true angle between any sample and the first, sign-corrected
      for (const q of vals) {
        let d = Math.abs(q[0]*vals[0][0]+q[1]*vals[0][1]+q[2]*vals[0][2]+q[3]*vals[0][3]);
        metric = Math.max(metric, 2*Math.acos(Math.min(1,d)));
      }
      metric = deg(metric); unit = 'deg';
    } else {
      for (let c=0;c<vals[0].length;c++){
        const col = vals.map(v=>v[c]);
        metric = Math.max(metric, Math.max(...col)-Math.min(...col));
      }
      unit = ch.target.path === 'scale' ? 'x' : 'u';
    }
    if (metric > 1e-3) rows.push({ name, path: ch.target.path, metric: +metric.toFixed(2), unit });
  }
  rows.sort((a,b)=>b.metric-a.metric);
  for (const r of rows) console.log(`   ${r.name.padEnd(8)} ${r.path.padEnd(11)} ${String(r.metric).padStart(7)} ${r.unit}`);
}
EOF
node $SP/anim_range.mjs
```
<details><summary>result</summary>

```
=== Gather
   arm.R    rotation      73.53 deg
   arm.L    rotation      38.83 deg
   head     rotation      22.92 deg
   spine    rotation      19.48 deg
   brow.L   rotation      19.48 deg
   brow.R   rotation      19.48 deg
   leg.L    rotation       14.9 deg
   leg.R    rotation       14.9 deg
   hips     rotation       12.6 deg
   torch    rotation      11.46 deg
   root     translation     0.1 u
   brow.L   translation    0.01 u
   brow.R   translation    0.01 u

=== Idle
   head     rotation       15.7 deg
   torch    rotation       8.95 deg
   hips     rotation       6.69 deg
   arm.L    rotation       6.62 deg
   brow.L   rotation        6.5 deg
   brow.R   rotation        6.5 deg
   arm.R    rotation       5.11 deg
   spine    rotation       4.68 deg
   leg.L    rotation       2.83 deg
   leg.R    rotation       2.83 deg
   root     translation    0.06 u
   brow.L   translation    0.01 u
   brow.R   translation    0.01 u

=== Walk
   leg.L    rotation      41.25 deg
   leg.R    rotation      41.25 deg
   arm.L    rotation      32.09 deg
   head     rotation      12.33 deg
   torch    rotation       9.16 deg
   arm.R    rotation       7.45 deg
   spine    rotation       6.02 deg
   hips     rotation       4.87 deg
   brow.L   rotation       4.01 deg
… [truncated]
```
</details>

Idle head now moves 15.7° (was effectively 1.7°), walk legs 41°, and the root bobs 0.06 units *vertically*. Testing the live layer:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-25-49-473Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player, root = p.root;
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,160)); oe(...a); };
  const out = {};

  const eyeL = root.getObjectByName('eyeL');
  out.eyeBones = { eyeL: !!eyeL, eyeR: !!root.getObjectByName('eyeR') };

  // 1. IDLE: does the head actually move now?
  const head = root.getObjectByName('head');
  const sampleHead = async (n, ms) => {
    const qs = [];
    for (let i = 0; i < n; i++) { qs.push(head.quaternion.clone()); await wait(ms); }
    let max = 0;
    for (const q of qs) max = Math.max(max, 2 * Math.acos(Math.min(1, Math.abs(q.dot(qs[0])))));
    return +(max * 180 / Math.PI).toFixed(2);
  };
  out.idleHeadSwingDeg = await sampleHead(30, 70);

  // 2. BLINKS: watch the eye bone squash over ~9s
  let minLid = 1, blinks = 0, wasShut = false;
  const t0 = performance.now();
  while (performance.now() - t0 < 9000) {
    const lid = eyeL.scale.y;
    minLid = Math.min(minLid, lid);
    if (lid < 0.5 && !wasShut) { blinks++; wasShut = true; }
    if (lid > 0.85) wasShut = false;
    await wait(16);
  }
  out.blinks = { countIn9s: blinks, tightestLidScale: +minLid.toFixed(3) };

  // 3. HEAD TURN: spin him and see if the head leads the body
  const key = (c,d) => window.dis
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "eyeBones": {
    "eyeL": true,
    "eyeR": true
  },
  "idleHeadSwingDeg": 9.6,
  "blinks": {
    "countIn9s": 2,
    "tightestLidScale": 0.08
  },
  "headTurnPeakDeg": 8.79,
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const p = g.player, root = p.root;\n  const errs = []; const oe = console.error;\n  console.error = (...a) => { errs.push(a.map(String).join(\' \').slice(0,160)); oe(...a); };\n  const out = {};\n\n  const eyeL = root.getObjectByName(\'eyeL\');\n  out.eyeBones = { eyeL: !!eyeL, eyeR: !!root.getObjectByName(\'eyeR\') };\n\n  // 1. IDLE: does the head actually move now?\n  const head = root.getObjectByName(\'head\');\n  const sampleHead = async (n, ms) => {\n    const qs = [];\n    for (let i = 0; i < n; i++) { qs.push(head.quaternion.clone()); await wait(ms); }\n    let max = 0;\n    for (const q of qs) max = Math.max(max, 2 * Math.acos(Math.min(1, Math.abs(q.dot(qs[0])))));\n    return +(max * 180 / Math.PI).toFixed(2);\n  };\n  out.idleHeadSwingDeg = await sampleHead(30, 70);\n\n  // 2. BLINKS: watch the eye bone squash over ~9s\n  let minLid = 1, blinks = 0, wasShut = false;\n  const t0 = performance.now();\n  while (performance.now() - t0 < 9000) {\n    const lid = eyeL.scale.y;\n    minLid = Math.min(minLid, lid);\n    if (lid < 0.5 && !wasShut) { blinks++; wasShut = true; }\n    if (lid > 0.85) wasShut = false;\n    await wait(16);\n  }\n  out.blinks = { countIn9s: blinks, tightestLidScale: +minLid.toFixed(3) };\n\n  // 3. HEAD TURN: spin him and see if the head leads the body\n  const key = (c,d) => window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  key(\'KeyD\', true); await wait(200);\n  let maxYaw = 0;\n  for (let i = 0; i < 14; i++) {\n    key(\'KeyD\', false); key(\'KeyA\', true); await wait(90);\n    maxYaw = Math.max(maxYaw, Math.abs(p.expr.headYaw.v));\n    key(\'KeyA\', false); key(\'KeyD\', true); await wait(90);\n    maxYaw = Math.max(maxYaw, Math.abs(p.expr.headYaw.v));\n  }\n  key(\'KeyD\', false);\n  out.headTurnPeakDeg = +(maxYaw * 180 / Math.PI).toFixed(2);\n\n  out.errors = errs;\n  return out;\n}');
``​`
```
</details>

Everything's live: eyes blink (lid squashes to 0.08, ~2 blinks per 9s), idle head swings 9.6°, head leads the turn. The turn lead is a bit subtle at 8.8° — bumping it, then testing the look-at and discovery reaction:

**`Bash`** — Increase head turn lead
```bash
python3 - <<'PYEOF'
p='src/game/Expression.js'; s=open(p).read()
s = s.replace("    let yawTarget = THREE.MathUtils.clamp(turnRate * 0.085, -0.55, 0.55);",
              "    let yawTarget = THREE.MathUtils.clamp(turnRate * 0.155, -0.62, 0.62);",1)
open(p,'w').write(s); print('turn lead increased')
PYEOF
echo ok
```
<details><summary>result</summary>

```
turn lead increased
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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-26-38-951Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, torch } = g;
  const out = {};

  // stand near an undiscovered secret but outside the reveal radius, so he
  // should turn his head toward it without opening it
  const s = [...cav.secrets.values()].find(x => x.level === 0);
  const w = grid.tileToWorld(0, s.tx, s.ty);
  let spot = null;
  for (let a = 0; a < 64 && !spot; a++) {
    const ang = (a/64)*Math.PI*2;
    const tx = Math.round((w.x + Math.cos(ang)*5) / grid.tileSize + grid.W/2 - 0.5);
    const ty = Math.round((w.z + Math.sin(ang)*5) / grid.tileSize + grid.H/2 - 0.5);
    if (!grid.isSolid(0, tx, ty, cav.revealed)) spot = { tx, ty };
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.follow(p.pos, 0, true);
  await wait(900);

  const bearing = cav.nearestHidden(0, p.pos.x, p.pos.z);
  out.sensing = {
    distance: +bearing.distance.toFixed(2),
    proximity: +torch.proximity.toFixed(2),
    headYawDeg: +(p.expr.headYaw.v * 180/Math.PI).toFixed(1),
    browLift: +p.expr.brow.toFixed(2),
    headRollDeg: +(p.expr.headRoll.v * 180/Math.PI).toFixed(1),
  };

  // now trigger the discovery beat and watch the face
  const before = { brow: p.expr.brow, eyeWide: p.expr.eyeWide };
  p.react(1);
  await wait(120);
  out.reactionPeak = {
    reaction: +p.expr.reaction.toFixed(2),
    eyeWide
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "sensing": {
    "distance": 6.73,
    "proximity": 0.28,
    "headYawDeg": -33.8,
    "browLift": 0.21,
    "headRollDeg": 1.7
  },
  "reactionPeak": {
    "reaction": 0.76,
    "eyeWide": 0.61,
    "eyeScale": 1.34,
    "browBefore": 0.21,
    "browNow": 1.03
  },
  "reactionSettled": {
    "reaction": 0.01,
    "eyeWide": 0.01
  },
  "headTurnPeakDeg": 51
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav, torch } = g;\n  const out = {};\n\n  // stand near an undiscovered secret but outside the reveal radius, so he\n  // should turn his head toward it without opening it\n  const s = [...cav.secrets.values()].find(x => x.level === 0);\n  const w = grid.tileToWorld(0, s.tx, s.ty);\n  let spot = null;\n  for (let a = 0; a < 64 && !spot; a++) {\n    const ang = (a/64)*Math.PI*2;\n    const tx = Math.round((w.x + Math.cos(ang)*5) / grid.tileSize + grid.W/2 - 0.5);\n    const ty = Math.round((w.z + Math.sin(ang)*5) / grid.tileSize + grid.H/2 - 0.5);\n    if (!grid.isSolid(0, tx, ty, cav.revealed)) spot = { tx, ty };\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.follow(p.pos, 0, true);\n  await wait(900);\n\n  const bearing = cav.nearestHidden(0, p.pos.x, p.pos.z);\n  out.sensing = {\n    distance: +bearing.distance.toFixed(2),\n    proximity: +torch.proximity.toFixed(2),\n    headYawDeg: +(p.expr.headYaw.v * 180/Math.PI).toFixed(1),\n    browLift: +p.expr.brow.toFixed(2),\n    headRollDeg: +(p.expr.headRoll.v * 180/Math.PI).toFixed(1),\n  };\n\n  // now trigger the discovery beat and watch the face\n  const before = { brow: p.expr.brow, eyeWide: p.expr.eyeWide };\n  p.react(1);\n  await wait(120);\n  out.reactionPeak = {\n    reaction: +p.expr.reaction.toFixed(2),\n    eyeWide: +p.expr.eyeWide.toFixed(2),\n    eyeScale: +p.root.getObjectByName(\'eyeL\').scale.x.toFixed(2),\n    browBefore: +before.brow.toFixed(2),\n    browNow: +p.expr.brow.toFixed(2),\n  };\n  await wait(1800);\n  out.reactionSettled = { reaction: +p.expr.reaction.toFixed(3), eyeWide: +p.expr.eyeWide.toFixed(2) };\n\n  // head turn with the stronger gain\n  const key = (c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  let peak = 0;\n  for (let i=0;i<10;i++){\n    key(\'KeyA\',true); await wait(110); peak=Math.max(peak,Math.abs(p.expr.headYaw.v)); key(\'KeyA\',false);\n    key(\'KeyD\',true); await wait(110); peak=Math.max(peak,Math.abs(p.expr.headYaw.v)); key(\'KeyD\',false);\n  }\n
… [truncated]
```
</details>

All three reactions confirmed: he turns his head 34° toward what he senses, eyes widen to 1.34× and brows jump on discovery, then settle. 51° turn peak is a bit much though — taming the overshoot slightly, then looking at the face:

**`Bash`** — Tame head turn overshoot
```bash
python3 - <<'PYEOF'
p='src/game/Expression.js'; s=open(p).read()
s = s.replace("    let yawTarget = THREE.MathUtils.clamp(turnRate * 0.155, -0.62, 0.62);",
              "    let yawTarget = THREE.MathUtils.clamp(turnRate * 0.155, -0.50, 0.50);",1)
s = s.replace("    spring(this.headYaw, yawTarget, dt, 150, 15);",
              "    spring(this.headYaw, yawTarget, dt, 150, 16);   // under-damped: it overshoots and settles",1)
open(p,'w').write(s); print('tuned')
PYEOF
echo ok
```
<details><summary>result</summary>

```
tuned
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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-27-20-414Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  // open chamber, zoomed right in on the face
  let spot = null, best = 0;
  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    let open=0;
    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)
      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;
    if (open>best) { best=open; spot={tx,ty}; }
  }
  p.placeAt(0, spot.tx, spot.ty);
  g.cam.setZoom(4.2, innerWidth/innerHeight);
  g.cam.follow(p.pos, 0, true);
  // hold the eyes open and neutral for a baseline shot
  p.expr.blinkT = 99;
  await wait(600);
  return { zoom: g.cam.viewSize, lid: +p.root.getObjectByName('eyeL').scale.y.toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "zoom": 4.2,
  "lid": 1
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  // open chamber, zoomed right in on the face\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  g.cam.setZoom(4.2, innerWidth/innerHeight);\n  g.cam.follow(p.pos, 0, true);\n  // hold the eyes open and neutral for a baseline shot\n  p.expr.blinkT = 99;\n  await wait(600);\n  return { zoom: g.cam.viewSize, lid: +p.root.getObjectByName(\'eyeL\').scale.y.toFixed(2) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-27-35-299Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-27-35-299Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-27-35-299Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

He reads well at this zoom — and the head is visibly turned toward a sensed passage (the sense bar shows a small fill), which is the look-at working. But there's a pale crescent behind the head I want to inspect. Zooming in on the head:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player;
  const V = p.pos.constructor;
  // aim the camera at his head, not his feet
  const target = new V(p.pos.x, p.pos.y + 1.0, p.pos.z);
  g.cam.setZoom(1.9, innerWidth/innerHeight);
  g.cam.follow(target, 0, true);
  // freeze the follow so it doesn't drift back to the feet
  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };
  p.expr.blinkT = 99;
  await wait(500);
  return { headYawDeg: +(p.expr.headYaw.v*180/Math.PI).toFixed(1),
           proximity: +g.torch.proximity.toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "headYawDeg": 0,
  "proximity": 0
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const p = g.player;\n  const V = p.pos.constructor;\n  // aim the camera at his head, not his feet\n  const target = new V(p.pos.x, p.pos.y + 1.0, p.pos.z);\n  g.cam.setZoom(1.9, innerWidth/innerHeight);\n  g.cam.follow(target, 0, true);\n  // freeze the follow so it doesn\'t drift back to the feet\n  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };\n  p.expr.blinkT = 99;\n  await wait(500);\n  return { headYawDeg: +(p.expr.headYaw.v*180/Math.PI).toFixed(1),\n           proximity: +g.torch.proximity.toFixed(2) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-28-08-324Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-28-08-324Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-28-08-324Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

That's a real defect — the mohawk has collapsed into one stretched spike with a pale wedge across the face. The earlier graph dump showed a `neutral_bone`, which glTF only adds for vertices with **no weights**. Let me check:

**`blender/execute_blender_code`**
```python

import bpy, traceback
out = {}
try:
    p = "~/proj/me/learn/blender-mcp/cavern-game/blender/build_character.py"
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    me = bpy.data.objects["TorchBoyMesh"]
    m = me.data
    unassigned = [v.index for v in m.vertices if not v.groups]
    multi = [v.index for v in m.vertices if len(v.groups) > 1]
    # how many verts per group
    gname = {i: vg.name for i, vg in enumerate(me.vertex_groups)}
    counts = {}
    for v in m.vertices:
        for gr in v.groups:
            n = gname[gr.group]
            counts[n] = counts.get(n, 0) + 1
    out = {
        "total_verts": len(m.vertices),
        "unassigned": len(unassigned),
        "unassigned_sample": unassigned[:15],
        "multi_group": len(multi),
        "groups": counts,
        "vertex_group_names": [vg.name for vg in me.vertex_groups],
    }
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"total_verts":1792,"unassigned":1750,"unassigned_sample":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],"multi_group":0,"groups":{"flame":42},"vertex_group_names":["head","eye.R","eye.L","brow.R","brow.L","spine","hips","arm.R","arm.L","leg.R","leg.L","torch","flame"]},"stdout":"09:28:57 | INFO: Starting glTF 2.0 export\n09:28:57 | INFO: Extracting primitive: TorchBoyMesh\n09:28:57 | INFO: Primitives created: 9\n09:28:57 | INFO: Finished glTF 2.0 export in 0.17400288581848145 s\n\n"}
```
</details>

Found it — and you're right, I was wrong. **1750 of 1792 vertices have no vertex group at all.** Only `flame` (42 verts) is bound. The clips play and the bones move, but the mesh was never skinned to them, so nothing visibly deforms.

The cause: `ensure_lookup_table()` makes `bm.verts[i]` subscriptable but does **not** refresh `v.index` — so I was reading stale indices when building the vertex groups.

**`Bash`** — Fix stale bmesh indices in skin weighting
```bash
python3 - <<'PYEOF'
p='blender/lib_build.py'; s=open(p).read()
s = s.replace('''    def bake(self, name, collection, materials):
        bm = self.bm
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
''',
'''    def bake(self, name, collection, materials):
        bm = self.bm
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        # ensure_lookup_table() only makes bm.verts[i] subscriptable - it does
        # NOT refresh element .index, which bevel/delete leave stale (often -1).
        # Reading .index without this silently binds almost every vertex to no
        # group at all, and the whole mesh ends up on glTF's `neutral_bone`:
        # the clips play, the bones move, and the character never deforms.
        bm.verts.index_update()
        bm.faces.index_update()
''',1)
open(p,'w').write(s); print('index_update added')
PYEOF
grep -n "index_update" blender/lib_build.py
```
<details><summary>result</summary>

```
index_update added
129:        bm.verts.index_update()
130:        bm.faces.index_update()
```
</details>

**`blender/execute_blender_code`**
```python

import bpy, importlib, sys, traceback
out = {}
try:
    base = "~/proj/me/learn/blender-mcp/cavern-game/blender"
    if base not in sys.path: sys.path.insert(0, base)
    import lib_build; importlib.reload(lib_build)
    p = base + "/build_character.py"
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    me = bpy.data.objects["TorchBoyMesh"]
    m = me.data
    gname = {i: vg.name for i, vg in enumerate(me.vertex_groups)}
    counts = {}
    for v in m.vertices:
        for gr in v.groups:
            counts[gname[gr.group]] = counts.get(gname[gr.group], 0) + 1
    out = {
        "total_verts": len(m.vertices),
        "unassigned": len([v for v in m.vertices if not v.groups]),
        "groups": dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        "materials": [ms.name for ms in m.materials],
    }
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"total_verts":1792,"unassigned":1750,"groups":{"flame":42},"materials":["tb_skin","tb_hair","tb_eye","tb_shirt","tb_pants","tb_boot","tb_wood","tb_wrap","tb_ember"]},"stdout":"09:29:33 | INFO: Starting glTF 2.0 export\n09:29:33 | INFO: Extracting primitive: TorchBoyMesh\n09:29:33 | INFO: Primitives created: 9\n09:29:33 | INFO: Finished glTF 2.0 export in 0.1950688362121582 s\n\n"}
```
</details>

Still 1750 unassigned — so my mechanism guess was wrong. Let me instrument the actual weighting step instead of theorising:

**`blender/execute_blender_code`**
```python

import bpy, bmesh, sys, importlib, traceback
out = {}
try:
    base = "~/proj/me/learn/blender-mcp/cavern-game/blender"
    if base not in sys.path: sys.path.insert(0, base)
    import lib_build as L; importlib.reload(L)

    # minimal repro of the Part pipeline: two shapes, two bones
    P = L.Part()
    bm = P.bm
    a = P.add(L.bm_sphere(bm, 0.3, (0, 0, 1.0), subdiv=2), "m", "head")
    b = P.add(L.bm_rbox(bm, (0.3, 0.3, 0.3), (0, 0, 0.4), bevel=0.06), "m", "spine")
    c = P.add(L.bm_sphere(bm, 0.1, (0, 0, 1.6), subdiv=2), "m", "flame")

    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    diag = {}
    for bone, verts in P.groups.items():
        valid = [v for v in verts if v.is_valid]
        idxs = [v.index for v in valid]
        diag[bone] = {
            "stored": len(verts),
            "valid": len(valid),
            "idx_min": min(idxs) if idxs else None,
            "idx_max": max(idxs) if idxs else None,
            "unique_idx": len(set(idxs)),
        }
    out["per_bone"] = diag
    out["total_bm_verts"] = len(bm.verts)
    # do indices collide ACROSS bones?
    allidx = [v.index for verts in P.groups.values() for v in verts if v.is_valid]
    out["total_assigned_refs"] = len(allidx)
    out["unique_indices_overall"] = len(set(allidx))
    bm.free()
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"per_bone":{"head":{"stored":42,"valid":0,"idx_min":null,"idx_max":null,"unique_idx":0},"spine":{"stored":96,"valid":0,"idx_min":null,"idx_max":null,"unique_idx":0},"flame":{"stored":42,"valid":42,"idx_min":42,"idx_max":179,"unique_idx":42}},"total_bm_verts":180,"total_assigned_refs":42,"unique_indices_overall":42}}
```
</details>

Now it's unambiguous: `head` stores 42 verts but **0 are valid**; only the last-created group survives. bmesh reallocates its internal arrays as the mesh grows, which invalidates every Python `BMVert` reference I was holding across subsequent parts. Storing indices at creation time instead:

**`Bash`** — Store indices instead of bmesh references
```bash
python3 - <<'PYEOF'
p='blender/lib_build.py'; s=open(p).read()

s = s.replace('''class Part:
    """A bag of bmesh verts tagged with a material and (optionally) a bone.

    Parts are accumulated into ONE bmesh, then baked into a single mesh with
    per-part material slots and vertex groups. Rigid per-part weighting suits a
    blocky stylised character and avoids automatic-weight flakiness headless.
    """

    def __init__(self):
        self.bm = bmesh.new()
        self.groups = {}     # bone name -> [vert]
        self.mats = {}       # material name -> [face]
        self._mat_order = []

    def add(self, verts, mat, bone=None):
        faces = list({f for v in verts if v.is_valid for f in v.link_faces})
        if mat not in self.mats:
            self.mats[mat] = []
            self._mat_order.append(mat)
        self.mats[mat].extend(faces)
        if bone:
            self.groups.setdefault(bone, []).extend(
                [v for v in verts if v.is_valid])
        return verts''',
'''class Part:
    """A bag of bmesh geometry tagged with a material and (optionally) a bone.

    Parts are accumulated into ONE bmesh, then baked into a single mesh with
    per-part material slots and vertex groups. Rigid per-part weighting suits a
    blocky stylised character and avoids automatic-weight flakiness headless.

    IMPORTANT: this stores integer INDICES, never BMVert/BMFace references.
    bmesh reallocates its internal element arrays as the mesh grows, which
    silently invalidates every Python reference handed out earlier - so by the
    time the last part is added, the first part's verts are all dead. Holding
    references here bound almost the entire mesh to no vertex group at all,
    and the character never deformed no matter what the animation did.
    Indices are stable because every later part only APPENDS geometry.
    """

    def __init__(self):
        self.bm = bmesh.new()
        self.groups = {}     # bone name -> [vert index]
        self.mats = {}       # material name -> [face index]
        self._mat_order = []

    def add(self, verts, mat, bone=None):
        bm = self.bm
        live = [v for v in verts if v.is_valid]
        fac
… [truncated]
```
<details><summary>result</summary>

```
Part now index-based
syntax ok
```
</details>

**`blender/execute_blender_code`**
```python

import bpy, sys, importlib, traceback
out = {}
try:
    base = "~/proj/me/learn/blender-mcp/cavern-game/blender"
    if base not in sys.path: sys.path.insert(0, base)
    import lib_build; importlib.reload(lib_build)
    p = base + "/build_character.py"
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    me = bpy.data.objects["TorchBoyMesh"]
    m = me.data
    gname = {i: vg.name for i, vg in enumerate(me.vertex_groups)}
    counts = {}
    for v in m.vertices:
        for gr in v.groups:
            counts[gname[gr.group]] = counts.get(gname[gr.group], 0) + 1
    matcount = {}
    for f in m.polygons:
        n = m.materials[f.material_index].name
        matcount[n] = matcount.get(n, 0) + 1
    out = {
        "total_verts": len(m.vertices),
        "unassigned": len([v for v in m.vertices if not v.groups]),
        "groups": dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        "faces_per_material": dict(sorted(matcount.items(), key=lambda kv: -kv[1])),
    }
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"total_verts":1792,"unassigned":32,"groups":{"head":750,"leg.R":152,"leg.L":152,"torch":112,"arm.L":98,"spine":96,"hips":96,"arm.R":90,"brow.L":56,"brow.R":48,"eye.L":42,"eye.R":34,"flame":34},"faces_per_material":{"tb_skin":706,"tb_hair":534,"tb_shirt":206,"tb_pants":200,"tb_boot":196,"tb_eye":160,"tb_ember":80,"tb_wood":54,"tb_wrap":54}},"stdout":"09:30:50 | INFO: Starting glTF 2.0 export\n09:30:50 | INFO: Extracting primitive: TorchBoyMesh\n09:30:50 | INFO: Primitives created: 9\n09:30:50 | INFO: Finished glTF 2.0 export in 0.1724700927734375 s\n\n"}
```
</details>

Down from 1750 to 32 — but the asymmetries (eye.L 42 vs eye.R 34) show indices still shift, because bmesh reuses freed slots and renumbers. Index bookkeeping is the wrong approach entirely. Let me store the data **on the elements themselves**, where it survives any reallocation:

**`Bash`** — Rewrite Part to store data on elements
```bash
python3 - <<'PYEOF'
p='blender/lib_build.py'; s=open(p).read()
start = s.index('class Part:')
end = s.index('def bm_limb(')
new = '''class Part:
    """A bag of bmesh geometry tagged with a material and (optionally) a bone.

    Parts are accumulated into ONE bmesh, then baked into a single mesh with
    per-part material slots and vertex groups. Rigid per-part weighting suits a
    blocky stylised character and avoids automatic-weight flakiness headless.

    Bone and material assignment is written ONTO THE ELEMENTS at creation time -
    a deform layer for weights, BMFace.material_index for materials - never into
    side tables keyed by reference or index. Both of those fail here:

      * BMVert/BMFace references are invalidated when bmesh reallocates its
        element arrays as the mesh grows, so by the last part the first part's
        references are all dead;
      * indices are not stable either, because bmesh reuses slots freed by
        bevel's deletions and index_update() then renumbers everything.

    Getting this wrong is quiet and total: the mesh binds to glTF's
    `neutral_bone` and the character never deforms, however good the clips are.
    """

    def __init__(self):
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self._bones = {}         # bone name -> deform group index
        self._mat_order = []

    def _bone_id(self, name):
        if name not in self._bones:
            self._bones[name] = len(self._bones)
        return self._bones[name]

    def _mat_id(self, name):
        if name not in self._mat_order:
            self._mat_order.append(name)
        return self._mat_order.index(name)

    def add(self, verts, mat, bone=None):
        slot = self._mat_id(mat)
        live = [v for v in verts if v.is_valid]
        for f in {f for v in live for f in v.link_faces if f.is_valid}:
            f.material_index = slot
        if bone is not None:
            bid = self._bone_id(bone)
            for v in live:
                v[self.deform][bid] = 1.0
        return verts

    def bake(self, name, collection, materials):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh
… [truncated]
```
<details><summary>result</summary>

```
Part rewritten: element-owned assignment
syntax ok
```
</details>

**`blender/execute_blender_code`**
```python

import bpy, sys, importlib, traceback
out = {}
try:
    base = "~/proj/me/learn/blender-mcp/cavern-game/blender"
    if base not in sys.path: sys.path.insert(0, base)
    import lib_build; importlib.reload(lib_build)
    p = base + "/build_character.py"
    g = {"__file__": p, "__name__": "__main__"}
    exec(compile(open(p).read(), p, "exec"), g)
    me = bpy.data.objects["TorchBoyMesh"]
    m = me.data
    gname = {i: vg.name for i, vg in enumerate(me.vertex_groups)}
    counts = {}
    for v in m.vertices:
        for gr in v.groups:
            counts[gname[gr.group]] = counts.get(gname[gr.group], 0) + 1
    matcount = {}
    for f in m.polygons:
        n = m.materials[f.material_index].name
        matcount[n] = matcount.get(n, 0) + 1
    out = {
        "total_verts": len(m.vertices),
        "unassigned": len([v for v in m.vertices if not v.groups]),
        "groups": dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        "faces_per_material": dict(sorted(matcount.items(), key=lambda kv: -kv[1])),
        "symmetry_check": {
            "eyes": (counts.get("eye.L"), counts.get("eye.R")),
            "brows": (counts.get("brow.L"), counts.get("brow.R")),
            "legs": (counts.get("leg.L"), counts.get("leg.R")),
        },
    }
except Exception:
    out["error"] = traceback.format_exc()[-1500:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"total_verts":1792,"unassigned":0,"groups":{"head":750,"leg.R":152,"leg.L":152,"torch":112,"arm.R":98,"arm.L":98,"spine":96,"hips":96,"brow.R":56,"brow.L":56,"eye.R":42,"eye.L":42,"flame":42},"faces_per_material":{"tb_skin":694,"tb_hair":540,"tb_shirt":206,"tb_pants":206,"tb_boot":196,"tb_eye":160,"tb_ember":80,"tb_wood":54,"tb_wrap":54},"symmetry_check":{"eyes":[42,42],"brows":[56,56],"legs":[152,152]}},"stdout":"09:31:59 | INFO: Starting glTF 2.0 export\n09:31:59 | INFO: Extracting primitive: TorchBoyMesh\n09:31:59 | INFO: Primitives created: 9\n09:31:59 | INFO: Finished glTF 2.0 export in 0.1728971004486084 s\n\n"}
```
</details>

**Zero unassigned**, and perfect left/right symmetry (eyes 42/42, brows 56/56, legs 152/152). Now the decisive test — do actual *vertices* move, which is what you see:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T15-32-10-450Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const THREE_V = g.player.pos.constructor;
  const p = g.player;

  // find the skinned primitives and pick a probe vertex from each
  const meshes = [];
  p.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });

  // classify each primitive by which bone dominates it
  const skel = meshes[0].skeleton;
  const boneName = i => skel.bones[i].name;
  const probes = [];
  for (const m of meshes) {
    const si = m.geometry.attributes.skinIndex;
    const tally = {};
    for (let i = 0; i < si.count; i++) tally[boneName(si.getX(i))] = (tally[boneName(si.getX(i))]||0)+1;
    const dom = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0][0];
    probes.push({ mesh: m, dom, vidx: Math.floor(si.count/2) });
  }

  // sample skinned vertex positions while WALKING
  const key = (c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  key('KeyW', true);
  await wait(350);
  const series = probes.map(()=>[]);
  for (let s = 0; s < 16; s++) {
    probes.forEach((pr, i) => {
      const v = new THREE_V();
      v.fromBufferAttribute(pr.mesh.geometry.attributes.position, pr.vidx);
      pr.mesh.applyBoneTransform(pr.vidx, v);      // CPU skinning, same as GPU
      series[i].push(v.clone());
    });
    await wait(50);
  }
  key('KeyW', false);

  const
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "primitives": 9,
  "probes": [
    {
      "dominantBone": "head",
      "motionRange": [
        0.1129,
        0.0799,
        0.114
      ],
      "moves": true
    },
    {
      "dominantBone": "head",
      "motionRange": [
        0.2001,
        0.0781,
        0.1039
      ],
      "moves": true
    },
    {
      "dominantBone": "eyeR",
      "motionRange": [
        0.1304,
        0.0964,
        0.0383
      ],
      "moves": true
    },
    {
      "dominantBone": "spine",
      "motionRange": [
        0.0776,
        0.0611,
        0.0096
      ],
      "moves": true
    },
… [truncated]
```
</details>

All 9 primitives now deform — leg vertices travel 0.24 units through the stride, eyes and brows move. Let me look:

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
  const V = p.pos.constructor;
  const target = new V(p.pos.x, p.pos.y + 0.85, p.pos.z);
  g.cam.setZoom(2.6, innerWidth/innerHeight);
  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };
  g.cam.follow();
  // freeze him mid-stride so the pose is legible in a still
  p.play('Walk', 0);
  p.actions.Walk.paused = false;
  await wait(1000);
  p.actions.Walk.time = p.actions.Walk.getClip().duration * 0.25;   // full stride extension
  p.mixer.update(0);
  p.expr.blinkT = 99;
  await wait(120);
  return { pose: 'mid-stride', walkTime: +p.actions.Walk.time.toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "pose": "mid-stride",
  "walkTime": 0.26
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  let spot = null, best = 0;\n  for (let ty=4; ty<grid.H-4; ty++) for (let tx=4; tx<grid.W-4; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    let open=0;\n    for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++)\n      if (!grid.isSolid(0,tx+dx,ty+dy,cav.revealed)) open++;\n    if (open>best) { best=open; spot={tx,ty}; }\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  const V = p.pos.constructor;\n  const target = new V(p.pos.x, p.pos.y + 0.85, p.pos.z);\n  g.cam.setZoom(2.6, innerWidth/innerHeight);\n  g.cam.follow = () => { g.cam.camera.position.copy(target).add(g.cam.offset); g.cam.camera.lookAt(target); };\n  g.cam.follow();\n  // freeze him mid-stride so the pose is legible in a still\n  p.play(\'Walk\', 0);\n  p.actions.Walk.paused = false;\n  await wait(1000);\n  p.actions.Walk.time = p.actions.Walk.getClip().duration * 0.25;   // full stride extension\n  p.mixer.update(0);\n  p.expr.blinkT = 99;\n  await wait(120);\n  return { pose: \'mid-stride\', walkTime: +p.actions.Walk.time.toFixed(2) };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-32-44-467Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-32-44-467Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-32-44-467Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The mesh deforms now, but I'm looking at his back. Let me turn him to face the camera so I can judge the mohawk and face:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player;
  // camera sits toward +X+Z (azimuth 45deg), so face him that way
  p.facing = Math.PI / 4;
  p.root.rotation.y = p.facing;
  p.expr.prevFacing = p.facing;
  p.play('Idle', 0);
  await wait(700);
  p.expr.blinkT = 99;
  await wait(200);
  return { facing: +p.facing.toFixed(2), state: p.state };
}
```
<details><summary>result</summary>

```
### Result
{
  "facing": 0.79,
  "state": "Idle"
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const p = g.player;\n  // camera sits toward +X+Z (azimuth 45deg), so face him that way\n  p.facing = Math.PI / 4;\n  p.root.rotation.y = p.facing;\n  p.expr.prevFacing = p.facing;\n  p.play(\'Idle\', 0);\n  await wait(700);\n  p.expr.blinkT = 99;\n  await wait(200);\n  return { facing: +p.facing.toFixed(2), state: p.state };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-33-10-613Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-33-10-613Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-33-10-613Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The mesh deforms and the mohawk fans correctly — but there's a pale wedge slicing across his face. Let me render in Blender to tell geometry from a three.js skinning artifact:

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
    out["face"] = run(base+"preview.py", {
        "PREVIEW_COL": "TorchBoy", "PREVIEW_OUT": "/tmp/tb_check.png",
        "PREVIEW_ORTHO": 1.25, "PREVIEW_CAMLOC": (1.0, -2.6, 1.6),
        "PREVIEW_AIM": (0, 0, 1.02), "PREVIEW_RES": (640, 640)})
except Exception:
    out["error"] = traceback.format_exc()[-1200:]
result = out

```
<details><summary>result</summary>

```
{"status":"ok","result":{"face":{"rendered":"/tmp/tb_check.png"}},"stderr":"~/proj/me/learn/blender-mcp/cavern-game/blender/preview.py:49: DeprecationWarning: 'World.use_nodes' is expected to be removed in Blender 6.0\n  scene.world.node_tree.nodes[\"Background\"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)\n"}
```
</details>

**`Read`**

In Blender he's flawless — clean sphere, symmetric brows, no wedge. So the geometry is fine and the wedge is a **three.js shadow artifact**: the torch sits ~0.7 units from his head, so the head straddles several faces of the point light's shadow cube map. Let me confirm by toggling it live:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const p = g.player;
  let receiving = 0;
  p.root.traverse(o => { if (o.isMesh && o.receiveShadow) receiving++; });
  // hypothesis: he receives his own torch's shadow map from ~0.7 units away
  p.root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  await wait(400);
  return { meshesThatWereReceiving: receiving,
           shadowNear: g.torch.light.shadow.camera.near,
           shadowBias: g.torch.light.shadow.bias,
           lightDistToHead: +g.torch.light.position.distanceTo(p.pos).toFixed(2) };
}
```
<details><summary>result</summary>

```
### Result
{
  "meshesThatWereReceiving": 9,
  "shadowNear": 0.15,
  "shadowBias": -0.006,
  "lightDistToHead": 1.09
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const p = g.player;\n  let receiving = 0;\n  p.root.traverse(o => { if (o.isMesh && o.receiveShadow) receiving++; });\n  // hypothesis: he receives his own torch\'s shadow map from ~0.7 units away\n  p.root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });\n  await wait(400);\n  return { meshesThatWereReceiving: receiving,\n           shadowNear: g.torch.light.shadow.camera.near,\n           shadowBias: g.torch.light.shadow.bias,\n           lightDistToHead: +g.torch.light.position.distanceTo(p.pos).toFixed(2) };\n}');
``​`
### Events
- New console entries: .playwright-mcp/console-2026-09-06T15-32-10-352Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
claude-sonnet-5[1m] is temporarily unavailable (timed out), so auto mode cannot determine the safety of mcp__playwright__browser_take_screenshot right now. Wait a moment and then try this action again. If it keeps failing, continue with other tasks that don't require this action and come back to it later. Note: reading files, searching code, and other read-only operations do not require the classifier and can still be used.
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T15-38-54-289Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T15-38-54-289Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T15-38-54-289Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

The wedge is gone — that confirms it. Baking the fix into source:

API Error: Your computer went to sleep mid-response. The response above may be incomplete.


---
[← 01-i-want-you-to-help-me.md](01-i-want-you-to-help-me.md)  ·  [index](README.md)