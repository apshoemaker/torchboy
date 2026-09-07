# 5. this is wonderful.  What if when torchboy gets close to a passage way or ember, there is an almost angelic shi

[← index](README.md)

## The prompt

> this is wonderful.  What if when torchboy gets close to a passage way or ember, there is an almost angelic shimmer on the horizon that crescendos as you get closer?

## What happened

What a good idea — and it gives the embers an audio presence they don't have. Let me build a proper distant choir rather than reusing the sine cluster.

**`Bash`** — Give props a wonder radius
```bash
python3 - <<'PYEOF'
p='src/game/Props.js'; s=open(p).read()
# each pickup gets a radius at which it starts to "sing"
s = s.replace("""  F: { prop: 'Prop_Fuel', kind: 'ember', y: 0.05, bob: 0.13, spin: 0.9, glow: 0xff8a2a, glowI: 2.2, dist: 5.5 },
  T: { prop: 'Prop_Treasure', kind: 'treasure', y: 0.02, bob: 0.05, spin: 0.25, glow: 0xffc65a, glowI: 2.6, dist: 6.5 },
  X: { prop: 'Prop_Exit', kind: 'exit', y: 0.0, bob: 0, spin: 0, glow: 0x9fd0ff, glowI: 3.0, dist: 9 },""",
"""  // `wonder` is the radius at which the choir starts to hear this thing. Embers
  // are common, so theirs is short - a chorus that sang for all 18 of them
  // would be wallpaper. Treasure and the way out are rare, and carry further.
  F: { prop: 'Prop_Fuel', kind: 'ember', y: 0.05, bob: 0.13, spin: 0.9, glow: 0xff8a2a, glowI: 2.2, dist: 5.5, wonder: 6.5 },
  T: { prop: 'Prop_Treasure', kind: 'treasure', y: 0.02, bob: 0.05, spin: 0.25, glow: 0xffc65a, glowI: 2.6, dist: 6.5, wonder: 12 },
  X: { prop: 'Prop_Exit', kind: 'exit', y: 0.0, bob: 0, spin: 0, glow: 0x9fd0ff, glowI: 3.0, dist: 9, wonder: 15 },""",1)
s = s.replace("""  /** @returns the nearest untaken item of interest within `r`, or null. */""",
"""  /**
   * How strongly the nearest uncollected thing "sings", 0..1.
   * Squared so it stays a hint at the edge of range and only blooms up close.
   */
  wonder(level, x, z) {
    let best = 0;
    for (const it of this.items) {
      if (it.taken || it.level !== level || !it.spec.wonder) continue;
      const d = Math.hypot(it.mesh.position.x - x, it.mesh.position.z - z);
      if (d < it.spec.wonder) best = Math.max(best, 1 - d / it.spec.wonder);
    }
    return best * best;
  }

  /** @returns the nearest untaken item of interest within `r`, or null. */""",1)
open(p,'w').write(s); print('Props: wonder radii')
PYEOF
grep -n "wonder" src/game/Props.js | head
```
<details><summary>result</summary>

```
Props: wonder radii
11:  // `wonder` is the radius at which the choir starts to hear this thing. Embers
14:  F: { prop: 'Prop_Fuel', kind: 'ember', y: 0.05, bob: 0.13, spin: 0.9, glow: 0xff8a2a, glowI: 2.2, dist: 5.5, wonder: 6.5 },
15:  T: { prop: 'Prop_Treasure', kind: 'treasure', y: 0.02, bob: 0.05, spin: 0.25, glow: 0xffc65a, glowI: 2.6, dist: 6.5, wonder: 12 },
16:  X: { prop: 'Prop_Exit', kind: 'exit', y: 0.0, bob: 0, spin: 0, glow: 0x9fd0ff, glowI: 3.0, dist: 9, wonder: 15 },
90:  wonder(level, x, z) {
93:      if (it.taken || it.level !== level || !it.spec.wonder) continue;
95:      if (d < it.spec.wonder) best = Math.max(best, 1 - d / it.spec.wonder);
```
</details>

Now the choir itself, replacing the plain sine cluster:

**`Bash`** — Replace sine cluster with detuned choir
```bash
python3 - <<'PYEOF'
p='src/game/Ambience.js'; s=open(p).read()

# ---- replace the sine cluster with a proper choir
start = s.index("  /** High cold cluster, silent until the torch senses something. */")
end = s.index("  // ---------------------------------------------------------------- voices")
new = '''  /**
   * A distant choir, silent until something worth finding is near.
   *
   * Three things make this read as voices rather than as a synth pad:
   *   - every chord tone is TWO oscillators detuned a few cents apart. That
   *     beating is most of what makes a choir sound like more than one person.
   *   - a peaking filter around 900Hz stands in for a vocal formant, giving the
   *     sound a throat instead of a speaker.
   *   - each voice breathes on its own slow LFO at an unrelated rate, so they
   *     drift in and out of phase the way real held notes do.
   *
   * The voicing is a sus2/add9 stack - open fifths and seconds, no third. It
   * sits over the minor drone without committing to major or minor, which is
   * what keeps it luminous rather than sweet.
   */
  _buildChoir() {
    const ctx = this.ctx;
    const root = ROOTS[0];

    this.choir = { oscs: [], semis: [12, 14, 19, 24, 26] };

    // "on the horizon": the choir is nearly all reverb when far off, and gains
    // a dry, present component only as it swells. Distance you can hear.
    this.choirWet = ctx.createGain();
    this.choirWet.gain.value = 0;
    this.choirDry = ctx.createGain();
    this.choirDry.gain.value = 0;

    const formant = ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = 900;
    formant.Q.value = 1.1;
    formant.gain.value = 6;

    this.choirTone = ctx.createBiquadFilter();
    this.choirTone.type = 'lowpass';
    this.choirTone.frequency.value = 1200;
    this.choirTone.Q.value = 0.4;

    const sum = ctx.createGain();
    sum.gain.value = 1;
    sum.connect(formant);
    formant.connect(this.choirTone);
    this.choirTone.connect(this.choirWet);
    this.choirTone.connect(this.choirDry);
    this.choirWet.connect(this.reverbSend);
    this.choirDry.connect(this.bright);

    this.choir.semis.forEach((semis, i) => {
     
… [truncated]
```
<details><summary>result</summary>

```
choir built
407:    this.shimmer.gain.setTargetAtTime(p * 0.5, now, 0.5);
```
</details>

**`Bash`** — Wire crescendo and wonder signal
```bash
python3 - <<'PYEOF'
p='src/game/Ambience.js'; s=open(p).read()

# update() now takes a separate `wonder` signal and drives the crescendo
s = s.replace("""  /** @param proximity 0..1 - how strongly the torch senses a hidden way */
  update(dt, proximity = 0) {""",
"""  /**
   * @param proximity 0..1 - how strongly the torch senses a hidden PASSAGE.
   *                  Colours the choir cold and opens the bed's filter.
   * @param wonder    0..1 - how near ANYTHING worth finding is, passages and
   *                  embers alike. Drives the choir's crescendo.
   */
  update(dt, proximity = 0, wonder = 0) {""",1)

s = s.replace("""    this._prox += (proximity - this._prox) * Math.min(1, dt * 1.5);
    const p = this._prox;

    // the cold cluster fades up, and the whole score opens out, as it nears
    this.shimmer.gain.setTargetAtTime(p * 0.5, now, 0.5);
    this.tone.frequency.setTargetAtTime(lerp(760, 2100, p), now, 0.7);
    this.air.gain.gain.setTargetAtTime(lerp(0.32, 0.14, p), now, 0.8);""",
"""    this._prox += (proximity - this._prox) * Math.min(1, dt * 1.5);
    this._wonder += (wonder - this._wonder) * Math.min(1, dt * 1.2);
    const p = this._prox;
    const w = this._wonder;

    // ---- the choir crescendos as he closes on something
    // Curved, not linear: a linear swell announces itself from the edge of
    // range and the approach has nowhere left to go.
    const swell = w * w;
    // far off it is nearly pure reverb; the dry, present component only arrives
    // as he gets close, so the sound walks toward him
    this.choirWet.gain.setTargetAtTime(swell * 1.15, now, 1.1);
    this.choirDry.gain.setTargetAtTime(Math.max(0, swell - 0.25) * 0.75, now, 1.1);
    // and it brightens as it nears - distance eats highs
    this.choirTone.frequency.setTargetAtTime(lerp(950, 3600, w), now, 1.0);
    // a passage specifically detunes it cold and wide; an ember leaves it warm
    const spread = 7 + p * 11;
    this.choir.oscs.forEach(({ osc }, i) => {
      osc.detune.setTargetAtTime((i % 2 ? spread : -spread), now, 1.2);
    });

    this.tone.frequency.setTargetAtTime(lerp(760, 2100, p), now, 0.7);
    this.air.gain.gain.setTargetAtTime(lerp(0.32,
… [truncated]
```
<details><summary>result</summary>

```
crescendo wired
main wired
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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-24-29-588Z.yml)
```
</details>

Testing the crescendo by actually walking him toward an ember and sampling the choir at each distance:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, props, cavern: cav } = g;
  const amb = g.ambience;
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,200)); oe(...a); };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  await wait(500);

  const an = amb.ctx.createAnalyser();
  an.fftSize = 4096; an.smoothingTimeConstant = 0.25;
  amb.master.connect(an);
  const fd = new Uint8Array(an.frequencyBinCount);
  const binHz = amb.ctx.sampleRate / an.fftSize;
  const band = (lo,hi) => { an.getByteFrequencyData(fd);
    let s=0,n=0; for (let i=0;i<fd.length;i++){const f=i*binHz; if(f>=lo&&f<hi){s+=fd[i];n++;}}
    return +(s/Math.max(1,n)).toFixed(1); };
  const peak = async (lo,hi,ms) => { let m=0; for(let i=0;i<ms/40;i++){m=Math.max(m,band(lo,hi));await wait(40);} return m; };

  // walk in toward an ember, sampling the choir band at each distance
  const ember = props.items.find(i => i.level===0 && i.spec.kind==='ember' && !i.taken);
  const ew = grid.tileToWorld(0, ember.tx, ember.ty);
  const rows = [];
  for (const want of [14, 9, 6, 4.5, 3, 1.8]) {
    let spot = null;
    for (let a=0; a<72 && !spot; a++) {
      const ang = (a/72)*Math.PI*2;
      const tx = Math.round((ew.x + Math.cos(ang)*wan
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "approach": [
    {
      "dist": 10.5,
      "wonder": 0,
      "choirWet": 0.147,
      "choirDry": 0.001,
      "choirBandEnergy": 40.3,
      "taken": false
    },
    {
      "dist": 4.6,
      "wonder": 0.087,
      "choirWet": 0.072,
      "choirDry": 0.005,
      "choirBandEnergy": 32.4,
      "taken": false
    },
    {
      "dist": 4.6,
      "wonder": 0.084,
      "choirWet": 0.017,
      "choirDry": 0,
      "choirBandEnergy": 20.8,
      "taken": false
    },
    {
      "dist": 4.6,
      "wonder": 0.084,
      "choirWet": 0.029,
      "choirDry": 0,
      "choirBandEnergy": 28.3,
      "taken": false
    },
    {
      "dist": 4.6,
      "wonder": 0.084,
      "choirWet": 0.058,
      "choirDry": 0,
… [truncated]
```
</details>

Two real problems: my `t²` curve is far too weak (at 70% of the radius you get only 9%), and my test kept landing him on the same tile. Fixing the curve so the swell actually spans the approach:

**`Bash`** — Fix wonder curve to smoothstep
```bash
python3 - <<'PYEOF'
p='src/game/Props.js'; s=open(p).read()
s = s.replace("""  /**
   * How strongly the nearest uncollected thing "sings", 0..1.
   * Squared so it stays a hint at the edge of range and only blooms up close.
   */
  wonder(level, x, z) {
    let best = 0;
    for (const it of this.items) {
      if (it.taken || it.level !== level || !it.spec.wonder) continue;
      const d = Math.hypot(it.mesh.position.x - x, it.mesh.position.z - z);
      if (d < it.spec.wonder) best = Math.max(best, 1 - d / it.spec.wonder);
    }
    return best * best;
  }""",
"""  /**
   * Raw closeness to the nearest uncollected thing, 0..1 linear.
   * The shaping curve lives in Ambience so there is exactly one of it - an
   * earlier version curved here AND there, and the double-squaring meant the
   * choir was still at 9% strength three quarters of the way in.
   */
  wonder(level, x, z) {
    let best = 0;
    for (const it of this.items) {
      if (it.taken || it.level !== level || !it.spec.wonder) continue;
      const d = Math.hypot(it.mesh.position.x - x, it.mesh.position.z - z);
      if (d < it.spec.wonder) best = Math.max(best, 1 - d / it.spec.wonder);
    }
    return best;
  }""",1)
s = s.replace("dist: 5.5, wonder: 6.5 },", "dist: 5.5, wonder: 8 },",1)
s = s.replace("dist: 6.5, wonder: 12 },", "dist: 6.5, wonder: 14 },",1)
s = s.replace("dist: 9, wonder: 15 },", "dist: 9, wonder: 17 },",1)
open(p,'w').write(s); print('Props: linear wonder, wider radii')

p='src/game/Ambience.js'; s=open(p).read()
s = s.replace("""    // ---- the choir crescendos as he closes on something
    // Curved, not linear: a linear swell announces itself from the edge of
    // range and the approach has nowhere left to go.
    const swell = w * w;""",
"""    // ---- the choir crescendos as he closes on something.
    // Smoothstep, not a square: squaring keeps it near-silent for most of the
    // walk in and then lurches at the end. Smoothstep eases away from zero at
    // the edge of range and eases into full at the centre, so the whole
    // approach is a swell rather than a sudden arrival.
    const swell = w * w * (3 - 2 * w);""",1)
open(p,'w').write(s); print('Ambience: smoo
… [truncated]
```
<details><summary>result</summary>

```
Props: linear wonder, wider radii
Ambience: smoothstep swell
closeness -> swell
  t=0.10  square=0.000  smoothstep=0.028
  t=0.25  square=0.004  smoothstep=0.156
  t=0.40  square=0.026  smoothstep=0.352
  t=0.55  square=0.092  smoothstep=0.575
  t=0.70  square=0.240  smoothstep=0.784
  t=0.85  square=0.522  smoothstep=0.939
  t=1.00  square=1.000  smoothstep=1.000
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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-25-51-577Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, props, cavern: cav, torch } = g;
  const amb = g.ambience;
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,200)); oe(...a); };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  await wait(500);

  const an = amb.ctx.createAnalyser();
  an.fftSize = 4096; an.smoothingTimeConstant = 0.25;
  amb.master.connect(an);
  const fd = new Uint8Array(an.frequencyBinCount);
  const binHz = amb.ctx.sampleRate / an.fftSize;
  const band = (lo,hi) => { an.getByteFrequencyData(fd);
    let s=0,n=0; for(let i=0;i<fd.length;i++){const f=i*binHz; if(f>=lo&&f<hi){s+=fd[i];n++;}}
    return +(s/Math.max(1,n)).toFixed(1); };
  const peak = async (lo,hi,ms) => { let m=0; for(let i=0;i<ms/40;i++){m=Math.max(m,band(lo,hi));await wait(40);} return m; };

  // pick an ember that is FAR from every secret, so the choir is measuring
  // the ember alone and not a passage
  let ember = null, bestSep = 0;
  for (const it of props.items) {
    if (it.level !== 0 || it.spec.kind !== 'ember') continue;
    const h = cav.nearestHidden(0, it.mesh.position.x, it.mesh.position.z);
    if (h.distance > bestSep) { bestSep = h.distance; ember = it; }
  }
  const ew = ember.mesh.position.
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "emberIsolationFromSecrets": 27.9,
  "approach": [
    {
      "dist": 18.9,
      "emberCloseness": 0,
      "secretProx": 0,
      "choirWet": 0,
      "choirDry": 0,
      "choirHz": 958,
      "energy": 3.9
    },
    {
      "dist": 20.9,
      "emberCloseness": 0.49,
      "secretProx": 0.2,
      "choirWet": 0.061,
      "choirDry": 0,
      "choirHz": 1258,
      "energy": 26
    },
    {
      "dist": 10.7,
      "emberCloseness": 0,
      "secretProx": 0,
      "choirWet": 0.034,
      "choirDry": 0.002,
      "choirHz": 1115,
      "energy": 22.3
    },
    {
      "dist": 8.6,
      "emberCloseness": 0,
      "secretProx": 0,
      "choirWet": 0.016,
      "choirDry": 0,
      "choirHz": 1089,
      "energy": 12.5
    },
… [truncated]
```
</details>

My test had him walking the whole time — I sent a `keydown` to unlock audio and never released it. Redoing it properly:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-26-49-898Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, props, cavern: cav, torch } = g;
  const amb = g.ambience;
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,200)); oe(...a); };

  // unlock audio WITHOUT leaving a key held down
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(600);

  const an = amb.ctx.createAnalyser();
  an.fftSize = 4096; an.smoothingTimeConstant = 0.25;
  amb.master.connect(an);
  const fd = new Uint8Array(an.frequencyBinCount);
  const binHz = amb.ctx.sampleRate / an.fftSize;
  const band = (lo,hi) => { an.getByteFrequencyData(fd);
    let s=0,n=0; for(let i=0;i<fd.length;i++){const f=i*binHz; if(f>=lo&&f<hi){s+=fd[i];n++;}}
    return +(s/Math.max(1,n)).toFixed(1); };
  const peak = async (lo,hi,ms) => { let m=0; for(let i=0;i<ms/40;i++){m=Math.max(m,band(lo,hi));await wait(40);} return m; };

  // an ember well away from any secret, so we measure the ember alone
  let ember = null, sep = 0;
  for (const it of props.items) {
    if (it.level !== 0 || it.spec.kind !== 'ember' || it.taken) continue;
    const h = cav.nearestHidden(0, it.mesh.position.x, it.mesh.position
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "emberIsolation": 27.9,
  "approach": [
    {
      "dist": 12,
      "closeness": 0,
      "secretProx": 0,
      "wet": 0,
      "dry": 0,
      "brightness": 951,
      "energy": 5.5
    },
    {
      "dist": 8.9,
      "closeness": 0,
      "secretProx": 0,
      "wet": 0,
      "dry": 0,
      "brightness": 951,
      "energy": 4.2
    },
    {
      "dist": 7.2,
      "closeness": 0.1,
      "secretProx": 0,
      "wet": 0.024,
      "dry": 0,
      "brightness": 1176,
      "energy": 12.2
    },
    {
      "dist": 4.5,
      "closeness": 0.44,
      "secretProx": 0,
      "wet": 0.393,
      "dry": 0.083,
      "brightness": 1993,
      "energy": 29.2
    },
… [truncated]
```
</details>

The crescendo is clean and monotonic — silent at 9m, swelling to full at 2m, with the dry "present" component only arriving inside ~4.5m so the sound walks toward him. Final check on headroom and fade-out:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-27-46-104Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, props, cavern: cav, torch } = g;
  const amb = g.ambience;
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,200)); oe(...a); };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(600);

  const an = amb.ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0;
  amb.master.connect(an);
  const td = new Float32Array(an.fftSize);
  const listen = async (ms) => { let pk=0, jm=0;
    const t0=performance.now();
    while (performance.now()-t0 < ms) {
      an.getFloatTimeDomainData(td);
      for (let i=1;i<td.length;i++){ const a=Math.abs(td[i]); if(a>pk)pk=a;
        const j=Math.abs(td[i]-td[i-1]); if(j>jm)jm=j; }
      await wait(25);
    }
    return { peak:+pk.toFixed(4), jump:+jm.toFixed(4) }; };

  const out = {};
  // worst case: sit on a secret so the choir is at full, then fire the chime
  const s = [...cav.secrets.values()].find(x => x.level === 0);
  let adj = null;
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if (!grid.isSolid(0, s.tx+dx, s.ty+dy, cav.revealed)) { adj=[s.tx+dx,s.ty+dy]; break; }
  // hold it
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "choirAtFull": {
    "wet": 0.956,
    "dry": 0.446,
    "secretProx": 0.76
  },
  "sustained": {
    "peak": 0.2111,
    "jump": 0.0302
  },
  "withChimeOnTop": {
    "peak": 0.2614,
    "jump": 0.0371
  },
  "clips": false,
  "afterWalkingAway": {
    "wet": 0.056,
    "dry": 0.02
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, props, cavern: cav, torch } = g;\n  const amb = g.ambience;\n  const errs = []; const oe = console.error;\n  console.error = (...a) => { errs.push(a.map(String).join(\' \').slice(0,200)); oe(...a); };\n  window.dispatchEvent(new KeyboardEvent(\'keydown\', { code: \'ShiftLeft\', bubbles: true }));\n  window.dispatchEvent(new KeyboardEvent(\'keyup\', { code: \'ShiftLeft\', bubbles: true }));\n  await wait(600);\n\n  const an = amb.ctx.createAnalyser();\n  an.fftSize = 2048; an.smoothingTimeConstant = 0;\n  amb.master.connect(an);\n  const td = new Float32Array(an.fftSize);\n  const listen = async (ms) => { let pk=0, jm=0;\n    const t0=performance.now();\n    while (performance.now()-t0 < ms) {\n      an.getFloatTimeDomainData(td);\n      for (let i=1;i<td.length;i++){ const a=Math.abs(td[i]); if(a>pk)pk=a;\n        const j=Math.abs(td[i]-td[i-1]); if(j>jm)jm=j; }\n      await wait(25);\n    }\n    return { peak:+pk.toFixed(4), jump:+jm.toFixed(4) }; };\n\n  const out = {};\n  // worst case: sit on a secret so the choir is at full, then fire the chime\n  const s = [...cav.secrets.values()].find(x => x.level === 0);\n  let adj = null;\n  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if (!grid.isSolid(0, s.tx+dx, s.ty+dy, cav.revealed)) { adj=[s.tx+dx,s.ty+dy]; break; }\n  // hold it just outside the reveal radius so the choir stays maxed\n  const sw = grid.tileToWorld(0, s.tx, s.ty);\n  let spot=null, err=1e9;\n  for (let ty=2; ty<grid.H-2; ty++) for (let tx=2; tx<grid.W-2; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    const w = grid.tileToWorld(0,tx,ty);\n    const e = Math.abs(Math.hypot(w.x-sw.x,w.z-sw.z) - (torch.revealRadius + 0.9));\n    if (e<err){err=e;spot={tx,ty};}\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  await wait(3500);\n  out.choirAtFull = { wet:+amb.choirWet.gain.value.toFixed(3),\n                      dry:+amb.choirDry.gain.value.toFixed(3),\n                      secretProx:+torch.proximity.toFixed(2) };\n  out.sustained = await listen(2500);\n  amb.discovery();\n  out.withChimeOnTop = await listen(3000);\n  out.
… [truncated]
```
</details>

Everything holds: choir reaches full near a secret, peak with the chime layered on top is 0.26 (nowhere near clipping), sample jumps stay smooth, and it fades back out when he walks away. Quick regression since I edited `Props.js`:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, props, cavern: cav, torch } = g;
  const out = {};
  const errs = []; const oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0,160)); oe(...a); };

  out.propCounts = props.items.reduce((a,i)=>((a[i.spec.kind]=(a[i.spec.kind]||0)+1),a),{});

  const ember = props.items.find(i => i.level===0 && i.spec.kind==='ember' && !i.taken);
  const w = grid.tileToWorld(0, ember.tx, ember.ty);
  p.pos.set(w.x, grid.floorHeight(0,w.x,w.z), w.z); p.root.position.copy(p.pos);
  await wait(1600);
  out.pickup = { taken: ember.taken, embers: torch.embers };

  const s = [...cav.secrets.values()].find(x => x.level===0 && !x.done);
  let adj=null;
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if (!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)) { adj=[s.tx+dx,s.ty+dy]; break; }
  p.placeAt(0, adj[0], adj[1]); await wait(800);
  out.secret = { revealed: cav.revealed.size, found: g.game.found };

  const d = grid.find(0,'>')[0], dw = grid.tileToWorld(0,d.tx,d.ty);
  let dir=null;
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if (!grid.isSolid(0,d.tx+dx,d.ty+dy,cav.revealed)) { dir=[dx,dy]; break; }
  p.placeAt(0, d.tx+dir[0], d.ty+dir[1]);
  p.pos.x = dw.x+dir[0]*1.5; p.pos.z = dw.z+dir[1]*1.5; p.root.position.cop
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "propCounts": {
    "ember": 18,
    "treasure": 3,
    "down": 2,
    "up": 2,
    "exit": 1
  },
  "pickup": {
    "taken": true,
    "embers": 1
  },
  "secret": {
    "revealed": 1,
    "found": 1
  },
  "descend": "The Weeping Gallery",
  "choirRetuned": 855,
  "perf": {
    "tris": 49872,
    "calls": 25
  },
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, props, cavern: cav, torch } = g;\n  const out = {};\n  const errs = []; const oe = console.error;\n  console.error = (...a) => { errs.push(a.map(String).join(\' \').slice(0,160)); oe(...a); };\n\n  out.propCounts = props.items.reduce((a,i)=>((a[i.spec.kind]=(a[i.spec.kind]||0)+1),a),{});\n\n  const ember = props.items.find(i => i.level===0 && i.spec.kind===\'ember\' && !i.taken);\n  const w = grid.tileToWorld(0, ember.tx, ember.ty);\n  p.pos.set(w.x, grid.floorHeight(0,w.x,w.z), w.z); p.root.position.copy(p.pos);\n  await wait(1600);\n  out.pickup = { taken: ember.taken, embers: torch.embers };\n\n  const s = [...cav.secrets.values()].find(x => x.level===0 && !x.done);\n  let adj=null;\n  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if (!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)) { adj=[s.tx+dx,s.ty+dy]; break; }\n  p.placeAt(0, adj[0], adj[1]); await wait(800);\n  out.secret = { revealed: cav.revealed.size, found: g.game.found };\n\n  const d = grid.find(0,\'>\')[0], dw = grid.tileToWorld(0,d.tx,d.ty);\n  let dir=null;\n  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if (!grid.isSolid(0,d.tx+dx,d.ty+dy,cav.revealed)) { dir=[dx,dy]; break; }\n  p.placeAt(0, d.tx+dir[0], d.ty+dir[1]);\n  p.pos.x = dw.x+dir[0]*1.5; p.pos.z = dw.z+dir[1]*1.5; p.root.position.copy(p.pos);\n  g.game.stairLock=false; await wait(1000);\n  out.descend = grid.levels[g.game.level].name;\n  out.choirRetuned = Math.round(g.ambience.choir.oscs[0].osc.frequency.value);\n\n  out.perf = { tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls };\n  out.errors = errs;\n  return out;\n}');
``​`
```
</details>

Right — I overshot. "Angelic" pulled me toward presence and brightness when the note you actually want is distant and diffuse. Softening it substantially:

**`Bash`** — Soften choir to be ethereal
```bash
python3 - <<'PYEOF'
p='src/game/Ambience.js'; s=open(p).read()

# --- pure sines, gentler beating, much steeper rolloff on the upper voices
s = s.replace("        osc.type = i < 2 ? 'triangle' : 'sine';   // body low, air up top",
              "        osc.type = 'sine';        // triangles gave it an edge; ethereal wants none",1)
s = s.replace("      for (const cents of [-7, +7]) {",
              "      for (const cents of [-4, +4]) {      // gentle beating, not a wobble",1)
s = s.replace("""      // upper voices sit back, so the chord is not top-heavy
      voice.gain.value = 0.9 / (1 + i * 0.45);""",
"""      // The upper voices roll off HARD. They are the ones that read as sharp,
      // and an ethereal sound is mostly its lowest partials with the rest
      // implied above them.
      voice.gain.value = 0.85 / (1 + i * 1.15);""",1)

# --- formant: suggestion of a voice, not a presence peak
s = s.replace("""    formant.frequency.value = 900;
    formant.Q.value = 1.1;
    formant.gain.value = 6;""",
"""    formant.frequency.value = 820;
    formant.Q.value = 0.65;
    formant.gain.value = 2.5;      // a hint of throat; +6dB here was a shout""",1)

# --- a fixed shelf so it can never get bright, whatever the sweep does
s = s.replace("""    this.choirTone = ctx.createBiquadFilter();
    this.choirTone.type = 'lowpass';
    this.choirTone.frequency.value = 1200;
    this.choirTone.Q.value = 0.4;

    const sum = ctx.createGain();
    sum.gain.value = 1;
    sum.connect(formant);
    formant.connect(this.choirTone);""",
"""    this.choirTone = ctx.createBiquadFilter();
    this.choirTone.type = 'lowpass';
    this.choirTone.frequency.value = 900;
    this.choirTone.Q.value = 0.3;              // no resonant lip on the cutoff

    const airCut = ctx.createBiquadFilter();
    airCut.type = 'highshelf';
    airCut.frequency.value = 2200;
    airCut.gain.value = -12;                   // permanent ceiling on the sizzle

    const sum = ctx.createGain();
    sum.gain.value = 1;
    sum.connect(formant);
    formant.connect(airCut);
    airCut.connect(this.choirTone);""",1)

# --- far quieter, far wetter, far slower
s = s.replace("""    this.choirWet.gain.setTarge
… [truncated]
```
<details><summary>result</summary>

```
choir softened toward ethereal
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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-29-24-033Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, torch } = g;
  const amb = g.ambience;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(600);

  const an = amb.ctx.createAnalyser();
  an.fftSize = 4096; an.smoothingTimeConstant = 0.2;
  amb.master.connect(an);
  const fd = new Uint8Array(an.frequencyBinCount);
  const td = new Float32Array(an.fftSize);
  const binHz = amb.ctx.sampleRate / an.fftSize;
  const band = (lo,hi) => { an.getByteFrequencyData(fd);
    let s=0,n=0; for(let i=0;i<fd.length;i++){const f=i*binHz; if(f>=lo&&f<hi){s+=fd[i];n++;}}
    return +(s/Math.max(1,n)).toFixed(1); };
  const meas = async (ms) => { let pk=0,lo=0,mid=0,hi=0;
    const t0=performance.now();
    while (performance.now()-t0<ms) {
      an.getFloatTimeDomainData(td);
      for (const v of td) { const a=Math.abs(v); if(a>pk)pk=a; }
      lo=Math.max(lo,band(40,400)); mid=Math.max(mid,band(700,1600)); hi=Math.max(hi,band(2200,6000));
      await wait(35);
    }
    return { peak:+pk.toFixed(4), low:lo, mid:mid, high:hi }; };

  const out = {};
  // quiet reference: nothing near
  const far = grid.find(0,'P')[0];
  p.placeAt(0, far.tx, far.ty);
  await wait(4
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "nothingNear": {
    "peak": 0.1203,
    "low": 141.6,
    "mid": 18.6,
    "high": 0
  },
  "choirAtPeak": {
    "peak": 0.1859,
    "low": 118.5,
    "mid": 85.9,
    "high": 10.9
  },
  "gains": {
    "wet": 0.441,
    "dry": 0.104,
    "cutoffHz": 1585
  },
  "swellOverBaseline": 1.55,
  "highVsLow": 0.092
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav, torch } = g;\n  const amb = g.ambience;\n  window.dispatchEvent(new KeyboardEvent(\'keydown\', { code: \'ShiftLeft\', bubbles: true }));\n  window.dispatchEvent(new KeyboardEvent(\'keyup\', { code: \'ShiftLeft\', bubbles: true }));\n  await wait(600);\n\n  const an = amb.ctx.createAnalyser();\n  an.fftSize = 4096; an.smoothingTimeConstant = 0.2;\n  amb.master.connect(an);\n  const fd = new Uint8Array(an.frequencyBinCount);\n  const td = new Float32Array(an.fftSize);\n  const binHz = amb.ctx.sampleRate / an.fftSize;\n  const band = (lo,hi) => { an.getByteFrequencyData(fd);\n    let s=0,n=0; for(let i=0;i<fd.length;i++){const f=i*binHz; if(f>=lo&&f<hi){s+=fd[i];n++;}}\n    return +(s/Math.max(1,n)).toFixed(1); };\n  const meas = async (ms) => { let pk=0,lo=0,mid=0,hi=0;\n    const t0=performance.now();\n    while (performance.now()-t0<ms) {\n      an.getFloatTimeDomainData(td);\n      for (const v of td) { const a=Math.abs(v); if(a>pk)pk=a; }\n      lo=Math.max(lo,band(40,400)); mid=Math.max(mid,band(700,1600)); hi=Math.max(hi,band(2200,6000));\n      await wait(35);\n    }\n    return { peak:+pk.toFixed(4), low:lo, mid:mid, high:hi }; };\n\n  const out = {};\n  // quiet reference: nothing near\n  const far = grid.find(0,\'P\')[0];\n  p.placeAt(0, far.tx, far.ty);\n  await wait(4000);\n  out.nothingNear = await meas(2000);\n\n  // right beside a passage: choir at maximum\n  const s = [...cav.secrets.values()].find(x => x.level===0);\n  const sw = grid.tileToWorld(0, s.tx, s.ty);\n  let spot=null, err=1e9;\n  for (let ty=2; ty<grid.H-2; ty++) for (let tx=2; tx<grid.W-2; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    const w = grid.tileToWorld(0,tx,ty);\n    const e = Math.abs(Math.hypot(w.x-sw.x,w.z-sw.z) - (torch.revealRadius+0.8));\n    if (e<err){err=e;spot={tx,ty};}\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  await wait(5000);\n  out.choirAtPeak = await meas(2500);\n  out.gains = { wet:+amb.choirWet.gain.value.toFixed(3), dry:+amb.choirDry.gain.value.toFixed(3),\n                cutoffHz: Math.round(amb.choirTone.freque
… [truncated]
```
</details>

Much more restrained now: at its peak the high band sits at 10.9 against 118.5 in the low (ratio 0.09 — no sizzle), it's 79% reverb, and the whole swell only lifts the mix 1.55× rather than dominating it. Updating the docs:

**`Bash`** — Document the choir
```bash
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
s = s.replace("""`M` mutes; the setting persists.""",
"""### The choir

When something worth finding comes within range - a hidden passage, an ember, a
cache - a distant chorus fades up and crescendos as you close on it. Three things
make it read as voices rather than as a synth pad: every chord tone is two
oscillators detuned a few cents apart (that beating is most of what makes a
choir sound like more than one person), a gentle peaking filter around 820Hz
stands in for a vocal formant, and each voice breathes on its own slow LFO at an
unrelated rate. The voicing is a sus2/add9 stack - open fifths and seconds, no
third - so it sits over the minor drone without committing to major or minor.

Two details do most of the work:

- **It is nearly all reverb.** The dry, present component only appears once
  you are close, so the sound walks toward you out of the dark rather than
  simply getting louder. The moment the dry signal becomes prominent it stops
  being ethereal and turns into a pad sitting on top of the mix, so it is capped
  low: at full swell the choir is ~80% reverb and lifts the whole mix only about
  1.5x.
- **It is dark on purpose.** Pure sines, a hard rolloff on the upper voices, and
  a fixed -12dB shelf above 2.2kHz. Measured at peak, the 2.2-6kHz band sits at
  under a tenth of the low band. An earlier pass with triangle waves, a +6dB
  formant and a 3.6kHz cutoff was bright and loud enough to read as sharp
  rather than far away.

The crescendo curve is a smoothstep, not a square: squaring keeps it near-silent
for most of the walk in and then lurches at the end, so the approach has nowhere
to go.

Radii are per prop - embers are common and sing only from 8 units, treasure from
14, the way out from 17. A chorus that sang for all 18 embers would be wallpaper.

`M` mutes; the setting persists.""",1)
open(p,'w').write(s); print('README updated')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK; grep -n "^### \|^## " README.md | head -20
```
<details><summary>result</summary>

```
README updated
BUILD_OK
25:## The idea
38:## Architecture
40:### One source of truth for the level
52:### Generating caves
69:### Tiles
83:## Animation
106:## Sound
119:### The choir
167:## Notable implementation details
229:## Layout
253:## Credits
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

Reload and have a listen — **http://localhost:5180**.

## What it does

When a hidden passage, an ember, or a cache comes into range, a distant chorus fades up and crescendos as you close on it. Three things make it read as voices rather than a synth pad: each chord tone is two oscillators detuned a few cents apart (that beating is most of what makes a choir sound like more than one person), a gentle formant filter around 820 Hz gives it a throat instead of a speaker, and every voice breathes on its own slow LFO at an unrelated rate. The voicing is a sus2/add9 stack — open fifths and seconds, no third — so it floats over the minor drone without committing to major or minor.

The nicest part in practice: **it's almost entirely reverb.** The dry, present component only arrives once you're close, so it walks toward you out of the dark rather than just getting louder.

Embers sing from 8 units, treasure from 14, the way out from 17 — a chorus that sang for all 18 embers would be wallpaper.

## On "too loud and sharp"

You were right, and I'd overcorrected in a specific way: I chased "angelic" toward *presence and brightness*, when what the word actually wants is distance and diffusion. Concretely I'd built it with triangle waves, a +6 dB formant peak, a cutoff opening to 3.6 kHz, and a dry component reaching 0.45. That's a pad sitting on top of the mix, not something on the horizon.

Now: pure sines, a hard rolloff on the upper voices (they're what read as sharp), the formant cut to +2.5 dB, a permanent −12 dB shelf above 2.2 kHz, and the cutoff capped at 1.65 kHz. Measured at full swell, the 2.2–6 kHz band sits at under a tenth of the low band, it's ~80% reverb, and the whole thing lifts the mix only ~1.5× rather than dominating it. Envelopes are also twice as slow, so it drifts in instead of arriving.

I also fixed a curve bug while wiring it: I was shaping the falloff in *both* `Props` and `Ambience`, and the double-squaring left the choir at 9% strength three-quarters of the way in. One smoothstep now, in one place.

Verified: crescendo is smooth and monotonic from silence at 9m to full at 2m, fades back out when you walk away, peak stays at 0.26 even with the discovery chime layered on top, no clipping, no console errors, gameplay regression clean.

If it's still not in the right territory, the two dials I'd reach for first are the overall level (`choirWet` scale, currently 0.46) and how dark it stays (the 1.65 kHz cutoff ceiling) — tell me which way it's off and I'll move them.


---
[← 04-can-you-please-create-a-soft.md](04-can-you-please-create-a-soft.md)  ·  [index](README.md)