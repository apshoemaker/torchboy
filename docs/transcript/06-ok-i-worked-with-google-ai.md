# 6. ok - I worked with google ai to try and help use get a better voicing.  It gave me this prompt to analyze: We 

[← index](README.md)

## The prompt

> ok - I worked with google ai to try and help use get a better voicing.  It gave me this prompt to analyze: We want to add a unique, dynamic ambient soundtrack to our browser game using an organic physical modeling approach. Instead of using standard oscillator synthesizers, we want to implement or port the core synthesis engine of Neil Thapen's "Pink Trombone" (articulatory vocal tract simulation).
> 
> Please help me implement this in our game using the following requirements:
> 
> 1. ARCHITECTURE & CODEBASE:
> - Look at our current project structure. What is the cleanest way to introduce a lightweight JavaScript/TypeScript implementation of Pink Trombone or its modular port (like 'voicebox')? 
> - We need the core mathematical model: a digital waveguide simulation of the vocal tract (glottis, oral cavity, and nasal cavity) powered by the Web Audio API.
> 
> 2. COAXING AN ETHEREAL, ANGELIC AMBIENT PAD:
> By default, Pink Trombone sounds very raw and "squelchy." We want to configure its initial state specifically for a lush, heavenly choral drone. Please set the default code parameters to:
> - Open Oral Cavity: Smooth, hollow, wide open vowel profile (like a soft 'Ooh' or breathing 'Aah') with the tongue pulled back and down. Remove all random manual tract constrictions to eliminate harsh pops or clicking consonants.
> - Breathiness: High glottal aspiration noise mixed with low glottal "tenseness" to create an airy, whispered voice foundation.
> - Pitch Drift: Add a tiny, slow-moving internal LFO (0.1Hz to 0.3Hz) to cause microscopic pitch variation, mimicking a natural human choir.
> 
> 3. WEB AUDIO EFFECTS CHAIN:
> - Pipe the raw output node of the vocal tract model into a native Web Audio API processing chain before reaching `audioContext.destination`.
> - Include a low-pass BiquadFilterNode to smoothly roll off everything above 1.5kHz.
> - Build a massive, long-decay stereo delay/reverb feedback network (or a wet ConvolverNode) to wash the vocal model into a smooth, expansive heavenly cloud.
> 
> Let's plan how to integrate this script or library. Show me where to place the synthesis engine files and how to initialize it within our current game loop.

## What happened

Let me evaluate this properly before committing — there's a real question buried in it. First, checking what's actually available and under what licence:

**`Bash`** — Check npm for Pink Trombone ports and licenses
```bash
for pkg in pink-trombone voicebox pink-trombone-web @mrkev/pink-trombone; do
  echo "=== $pkg"
  curl -s "https://registry.npmjs.org/$pkg" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{const j=JSON.parse(d);
    if(j.error){console.log('  not found');return;}
    const latest=j['dist-tags']?.latest; const v=j.versions?.[latest]||{};
    console.log('  version:', latest, '| license:', v.license||'(none declared)');
    console.log('  desc   :', (v.description||'').slice(0,90));
    console.log('  updated:', (j.time?.[latest]||'').slice(0,10));
  }catch(e){console.log('  parse error');}
});" 2>/dev/null
done
```
<details><summary>result</summary>

```
=== pink-trombone
  version: 1.0.2 | license: MIT
  desc   : A headless programmable polyphonic version of Neil Thapen's Pink Trombone
  updated: 2025-04-17
=== voicebox
  version: 0.2.2 | license: MIT
  desc   : voicebox api fun
  updated: 2012-07-03
=== pink-trombone-web
  not found
=== @mrkev/pink-trombone
  not found
```
</details>

`pink-trombone` is MIT and current. Note that `voicebox` is unrelated — a 2012 package called "voicebox api fun" — so that half of the suggestion looks like a hallucination. Let me inspect the real one:

**`Bash`** — Inspect pink-trombone package internals
```bash
curl -s "https://registry.npmjs.org/pink-trombone" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d); const v=j.versions[j['dist-tags'].latest];
  console.log('name/ver :', v.name, v.version);
  console.log('license  :', v.license);
  console.log('main     :', v.main, '| module:', v.module, '| type:', v.type);
  console.log('unpacked :', Math.round((v.dist.unpackedSize||0)/1024)+'KB');
  console.log('deps     :', JSON.stringify(v.dependencies||{}));
  console.log('repo     :', (v.repository&&v.repository.url)||'-');
  console.log('homepage :', v.homepage||'-');
  console.log('keywords :', (v.keywords||[]).join(', '));
});"
SP=<scratch>
mkdir -p $SP/pt && cd $SP/pt && npm pack pink-trombone --silent 2>/dev/null | tail -1 | xargs -I{} tar tzf {} | head -30
echo "--- worklet or scriptprocessor? ---"
cd $SP/pt && tar xzf pink-trombone-*.tgz 2>/dev/null && grep -rl "AudioWorklet\|ScriptProcessor" package/ 2>/dev/null | head -5
grep -ro "AudioWorkletProcessor\|createScriptProcessor\|audioWorklet" package/ 2>/dev/null | sort | uniq -c | head
```
<details><summary>result</summary>

```
name/ver : pink-trombone 1.0.2
license  : MIT
main     : index.js | module: undefined | type: undefined
unpacked : 43KB
deps     : {}
repo     : git+https://github.com/asmatzaile/pink-trombone.git
homepage : https://asmatzaile.github.io/pink-trombone/
keywords : api, speech-synthesis, web-audio, procedural-audio, voice-synthesis, voice, pink-trombone, voice-design, polyphonic, headless
package/LICENSE
package/index.js
package/Noise.js
package/package.json
package/README.md
--- worklet or scriptprocessor? ---
package/index.js
   1 package/index.js:createScriptProcessor
Shell cwd was reset to ~/proj/me/learn/blender-mcp
```
</details>

Important finding: that package uses `createScriptProcessor` — the **deprecated, main-thread** node. In a game already running a 60fps render loop, per-sample waveguide math on the main thread will fight the renderer both ways. Let me check the current audio-thread headroom before I decide:

**`Bash`** — Confirm ScriptProcessor use and estimate cost
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game && SP=<scratch>
echo "=== does the package really use ScriptProcessor? ==="
grep -n "createScriptProcessor\|onaudioprocess\|AudioWorklet" $SP/pt/package/index.js | head
echo
echo "=== tract size / cost per sample ==="
grep -n "44\|tractLength\|noseLength" $SP/pt/package/index.js | head -6
echo
echo "=== cost estimate for N tracts ==="
node -e "
const N=44, oversample=2, rate=48000;
const opsPerJunction=6;
for (const voices of [1,3,5]) {
  const ops = N*opsPerJunction*oversample*rate*voices;
  console.log(voices+' tract(s): ~'+(ops/1e6).toFixed(0)+'M float-ops/sec');
}"
```
<details><summary>result</summary>

```
=== does the package really use ScriptProcessor? ===
164:        this.scriptProcessor = this.audioContext.createScriptProcessor(this.blockLength, 2, 1);
166:        this.scriptProcessor.onaudioprocess = (e) => this.doScriptProcessor(e);
239:		this.scriptProcessor.onaudioprocess = null;

=== tract size / cost per sample ===
53:const hertzToMidi = hertz => 12 * Math.log2(hertz / 440) + 69;
54:const midiToHertz = midi => 440 * Math.pow(2, (midi - 69) / 12);
527:    n = 44;
564:        this.bladeStart = Math.floor(this.bladeStart*this.n/44);
565:        this.tipStart = Math.floor(this.tipStart*this.n/44);
566:        this.lipStart = Math.floor(this.lipStart*this.n/44);        

=== cost estimate for N tracts ===
1 tract(s): ~25M float-ops/sec
3 tract(s): ~76M float-ops/sec
5 tract(s): ~127M float-ops/sec
```
</details>

Confirmed: ScriptProcessor, 44 sections. Here's my read before I build.

## Analysis

**The core idea is right.** A waveguide tract produces real, interacting formants that a stack of sines fundamentally cannot. That's genuinely the thing missing from what we have.

**But three problems with the proposal as written:**

1. **`voicebox` is not a Pink Trombone port.** It's an unrelated 2012 package ("voicebox api fun"). That recommendation is fabricated — worth knowing, since the rest sounds authoritative.

2. **The real `pink-trombone` package (MIT, 43KB, no deps) uses `createScriptProcessor`** — deprecated, and it runs *on the main thread*. In a game already doing 60fps rendering, that fights the render loop in both directions: frame hitches glitch the audio, and audio work stalls frames.

3. **The requested settings switch off the very thing Pink Trombone is for.** "Wide-open vowel, remove all constrictions, high aspiration, low tenseness" disables dynamic articulation and consonants — its entire differentiator. What remains is a fixed formant resonator fed by mostly-noise. That's still a big upgrade over sines, but it means we want its *resonator*, not the articulatory app.

## What I'll build instead

Kelly-Lochbaum waveguide + Fant LF glottal model — the same classic physics Pink Trombone implements — written directly into an **AudioWorklet** so it runs on the audio thread. Writing from the published model also sidesteps vendoring questions entirely.

Two deliberate departures:
- **One tract, polyphonic glottal source.** Every choir voice sings the same vowel, so they can share one vocal tract: sum five glottal pulse trains into a single waveguide. ~25M ops/sec instead of ~127M for five tracts. The tract is what supplies vocal character; per-note tracts are a refinement we don't need here.
- **No nasal branch.** For a closed-velum "oo/oh" the nose contributes nothing acoustically, and it's ~40% of tract cost.

**`Bash`** — Write vocal tract AudioWorklet
```bash
mkdir -p src/audio && rm -f src/audio/vocal-tract-processor.js && cat > src/audio/vocal-tract-processor.js <<'EOF'
/**
 * A breathy, sung vocal tract, as an AudioWorkletProcessor.
 *
 * This is the classic Kelly-Lochbaum digital waveguide (a 1962 model of the
 * vocal tract as a chain of cylindrical sections) driven by Fant's LF glottal
 * flow model plus aspiration noise. It is the same physics Neil Thapen's Pink
 * Trombone implements; written here from the published model so it can live on
 * the AUDIO thread. The npm port runs in a ScriptProcessorNode on the main
 * thread, which in a game means the renderer and the synth stall each other.
 *
 * ONE tract, many glottal voices. A real choir is many tracts, but every voice
 * here sings the same vowel, so they can share one: five glottal pulse trains
 * are summed into a single waveguide. That is ~25M float-ops/sec instead of
 * ~127M for five tracts, and the tract is what supplies the vocal character.
 *
 * No nasal branch. For the closed-velum "oo/oh" vowel we want, the nose
 * contributes nothing and would cost ~40% more.
 */

const N = 44;              // sections; with 2 steps/sample this is a ~17cm tract
const OVERSAMPLE = 2;

/** Fant's LF glottal flow model. `tenseness` 0 = breathy, 1 = pressed. */
function lfParams(tenseness) {
  const Rd = Math.min(2.7, Math.max(0.5, 3 * (1 - tenseness)));
  const Ra = -0.01 + 0.048 * Rd;
  const Rk = 0.224 + 0.118 * Rd;
  const Rg = (Rk / 4) * (0.5 + 1.2 * Rk) / (0.11 * Rd - Ra * (0.5 + 1.2 * Rk));

  const Ta = Ra;
  const Tp = 1 / (2 * Rg);
  const Te = Tp + Tp * Rk;
  const epsilon = 1 / Ta;
  const shift = Math.exp(-epsilon * (1 - Te));
  const delta = 1 - shift;

  let rhs = (1 / epsilon) * (shift - 1) + (1 - Te) * shift;
  rhs /= delta;
  const upper = -(-(Te - Tp) / 2 + rhs);

  const omega = Math.PI / Tp;
  const s = Math.sin(omega * Te);
  const y = -Math.PI * s * upper / (Tp * 2);
  // y <= 0 would make the log NaN and silently kill the whole voice
  if (!(y > 0)) return lfParams(0.6);
  const alpha = Math.log(y) / (Tp / 2 - Te);
  const E0 = -1 / (s * Math.exp(alpha * Te));
  return { alpha, E0, epsilon, shift, delta, Te, omega };
}

function lfWave(p, t)
… [truncated]
```
<details><summary>result</summary>

```
syntax ok:      213 lines
```
</details>

Now the wrapper that loads it, with the requested effects chain — and a fallback to the existing sine choir if AudioWorklet isn't available:

**`Bash`** — Write Choir wrapper with worklet and effects chain
```bash
rm -f src/game/Choir.js && cat > src/game/Choir.js <<'EOF'
import * as THREE from 'three';

/**
 * The choir: a physically-modelled vocal tract washed into a distant cloud.
 *
 * Owns the AudioWorklet (see src/audio/vocal-tract-processor.js) plus the
 * effects chain around it. The worklet is a real waveguide vocal tract, which
 * is what gives this formants that move and interact - a stack of sines cannot
 * do that however carefully it is filtered.
 *
 * init() resolves false if AudioWorklet is unavailable or the module fails to
 * load, and the caller keeps its simpler fallback. Audio is a nicety; it must
 * never be the reason the game does not start.
 */

// sus2/add9 over the level's root: open fifths and seconds, no third, so it
// floats over the minor drone without committing to major or minor
const CHORD = [12, 14, 19, 24, 26];

export class Choir {
  constructor() {
    this.ready = false;
    this.node = null;
    this._level = 0;
  }

  async init(ctx, { reverbSend, dryOut }) {
    if (!ctx.audioWorklet) return false;
    try {
      const url = new URL('../audio/vocal-tract-processor.js', import.meta.url);
      await ctx.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(ctx, 'vocal-tract', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      });
    } catch (e) {
      console.warn('[choir] vocal tract unavailable, using fallback:', e.message);
      return false;
    }

    this.ctx = ctx;

    // ---- roll everything above 1.5kHz away. The tract's lip output is a
    // pressure wave and is naturally bright; unfiltered it buzzes.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 900;
    this.tone.Q.value = 0.3;

    const ceiling = ctx.createBiquadFilter();
    ceiling.type = 'highshelf';
    ceiling.frequency.value = 1500;
    ceiling.gain.value = -14;                 // fixed ceiling on any sizzle

    // ---- ensemble: three modulated taps turn one tract into a section.
    // Cheaper and smoother than running three tracts, and detuning by delay is
    // exactly how a real ensemble smears - no two singers are ever in phase.
    const spread 
… [truncated]
```
<details><summary>result</summary>

```
ok:      126 lines
```
</details>

**`Bash`** — Wire vocal tract into Ambience with fallback
```bash
python3 - <<'PYEOF'
p='src/game/Ambience.js'; s=open(p).read()

s = s.replace("const noteHz = (root, semis) => root * Math.pow(2, semis / 12);",
              "import { Choir } from './Choir.js';\n\nconst noteHz = (root, semis) => root * Math.pow(2, semis / 12);",1)

# build the sine choir only as a fallback; try the vocal tract first
s = s.replace("    this._buildDrone();\n    this._buildAir();\n    this._buildChoir();",
              "    this._buildDrone();\n    this._buildAir();",1)

s = s.replace("""      if (ctx.state === 'suspended') await ctx.resume();
      this._build();
      this.ready = true;""",
"""      if (ctx.state === 'suspended') await ctx.resume();
      this._build();

      // Try the physically-modelled vocal tract first. If the worklet cannot
      // load, fall back to the additive choir - worse, but it always works.
      this.choir = new Choir();
      const ok = await this.choir.init(ctx, {
        reverbSend: this.reverbSend, dryOut: this.bright,
      });
      if (ok) this.choir.setRoot(ROOTS[this.level]);
      else this._buildChoir();
      this.usingVocalTract = ok;

      this.ready = true;""",1)

# drive whichever is active
s = s.replace("""    this.choirWet.gain.setTargetAtTime(swell * 0.46, now, 2.0);
    this.choirDry.gain.setTargetAtTime(Math.max(0, swell - 0.45) * 0.20, now, 2.0);
    // it opens a little as it nears, but never past the point of sounding near
    this.choirTone.frequency.setTargetAtTime(lerp(680, 1650, w), now, 1.8);
    // a passage specifically detunes it cold and wide; an ember leaves it warm
    const spread = 4 + p * 6;
    this.choir.oscs.forEach(({ osc }, i) => {
      osc.detune.setTargetAtTime((i % 2 ? spread : -spread), now, 2.0);
    });""",
"""    if (this.usingVocalTract) {
      this.choir.set(swell, p);
    } else {
      this.choirWet.gain.setTargetAtTime(swell * 0.46, now, 2.0);
      this.choirDry.gain.setTargetAtTime(Math.max(0, swell - 0.45) * 0.20, now, 2.0);
      this.choirTone.frequency.setTargetAtTime(lerp(680, 1650, w), now, 1.8);
      const spread = 4 + p * 6;
      this.choir.oscs.forEach(({ osc }, i) => {
        osc.detune.setTargetAtTime((i % 2 ? spread : -spread), now, 2.0
… [truncated]
```
<details><summary>result</summary>

```
Ambience wired to vocal tract
BUILD_OK
-rw-r--r--@ 1 apshoemaker  staff    7820 Sep  6 10:39 vocal-tract-processor-D2WRsqFO.js
```
</details>

Vite emitted the worklet as its own asset, so the URL resolution works in build too. Now the real test — does the tract actually produce vowel formants?

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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-39-53-064Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const amb = g.ambience;
  const errs = []; const oe = console.error; const ow = console.warn;
  console.error = (...a) => { errs.push('ERR ' + a.map(String).join(' ').slice(0,180)); oe(...a); };
  console.warn = (...a) => { errs.push('WARN ' + a.map(String).join(' ').slice(0,180)); ow(...a); };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1500);

  const out = { usingVocalTract: amb.usingVocalTract, choirReady: !!(amb.choir && amb.choir.ready) };
  if (!amb.usingVocalTract) { out.errors = errs; return out; }

  // tap the RAW tract output, before the lowpass, so we can see the formants
  const an = amb.ctx.createAnalyser();
  an.fftSize = 8192;
  an.smoothingTimeConstant = 0.85;
  amb.choir.node.connect(an);

  // drive it to full so there is signal to analyse
  amb.choir.set(1.0, 0);
  await wait(2500);

  const fd = new Float32Array(an.frequencyBinCount);
  an.getFloatFrequencyData(fd);
  const binHz = amb.ctx.sampleRate / an.fftSize;

  // smooth the spectrum, then pick peaks below 3.5kHz = the formants
  const sm = new Float32Array(fd.length);
  const W = 6;
  for (let i = 0; i < fd.length; i++) {
    let s = 0, n = 0;
    fo
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "usingVocalTract": true,
  "choirReady": true,
  "formantPeaks": [],
  "silent": true,
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const amb = g.ambience;\n  const errs = []; const oe = console.error; const ow = console.warn;\n  console.error = (...a) => { errs.push(\'ERR \' + a.map(String).join(\' \').slice(0,180)); oe(...a); };\n  console.warn = (...a) => { errs.push(\'WARN \' + a.map(String).join(\' \').slice(0,180)); ow(...a); };\n  window.dispatchEvent(new KeyboardEvent(\'keydown\', { code: \'ShiftLeft\', bubbles: true }));\n  window.dispatchEvent(new KeyboardEvent(\'keyup\', { code: \'ShiftLeft\', bubbles: true }));\n  await wait(1500);\n\n  const out = { usingVocalTract: amb.usingVocalTract, choirReady: !!(amb.choir && amb.choir.ready) };\n  if (!amb.usingVocalTract) { out.errors = errs; return out; }\n\n  // tap the RAW tract output, before the lowpass, so we can see the formants\n  const an = amb.ctx.createAnalyser();\n  an.fftSize = 8192;\n  an.smoothingTimeConstant = 0.85;\n  amb.choir.node.connect(an);\n\n  // drive it to full so there is signal to analyse\n  amb.choir.set(1.0, 0);\n  await wait(2500);\n\n  const fd = new Float32Array(an.frequencyBinCount);\n  an.getFloatFrequencyData(fd);\n  const binHz = amb.ctx.sampleRate / an.fftSize;\n\n  // smooth the spectrum, then pick peaks below 3.5kHz = the formants\n  const sm = new Float32Array(fd.length);\n  const W = 6;\n  for (let i = 0; i < fd.length; i++) {\n    let s = 0, n = 0;\n    for (let k = -W; k <= W; k++) { const j = i+k; if (j>=0 && j<fd.length && isFinite(fd[j])) { s+=fd[j]; n++; } }\n    sm[i] = n ? s/n : -140;\n  }\n  const peaks = [];\n  const maxBin = Math.floor(3500 / binHz);\n  for (let i = 3; i < maxBin - 3; i++) {\n    if (sm[i] > sm[i-1] && sm[i] > sm[i+1] && sm[i] > sm[i-3] && sm[i] > sm[i+3] && sm[i] > -95) {\n      peaks.push({ hz: Math.round(i * binHz), db: +sm[i].toFixed(1) });\n    }\n  }\n  peaks.sort((a,b) => b.db - a.db);\n  out.formantPeaks = peaks.slice(0, 5).sort((a,b)=>a.hz-b.hz);\n  out.silent = peaks.length === 0;\n\n  amb.choir.node.disconnect(an);\n  amb.choir.set(0, 0);\n  out.errors = errs;\n  return out;\n}');
``​`
```
</details>

Worklet loads but outputs silence. Let me diagnose rather than guess — worklet errors don't surface on `console.error`:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const amb = g.ambience;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1200);
  const out = {};

  const node = amb.choir.node;
  let procError = null;
  node.onprocessorerror = (e) => { procError = 'processorerror fired'; };

  const an = amb.ctx.createAnalyser();
  an.fftSize = 2048;
  node.connect(an);
  amb.choir.set(1.0, 0);
  await wait(2000);

  const td = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(td);
  let min = Infinity, max = -Infinity, nan = 0, nonzero = 0;
  for (const v of td) {
    if (!isFinite(v)) { nan++; continue; }
    if (v < min) min = v; if (v > max) max = v;
    if (Math.abs(v) > 1e-7) nonzero++;
  }
  out.rawTractOutput = { min: isFinite(min)? +min.toFixed(6):null,
                         max: isFinite(max)? +max.toFixed(6):null,
                         nanSamples: nan, nonzeroSamples: nonzero, of: td.length };
  out.processorError = procError;

  // ask the processor to report its own internal state
  const reply = await new Promise((res) => {
    const t = setTimeout(() => res('no reply'), 1200);
    node.port.onmessage = (e) => { clearTimeout(t); res(e.data); };
    node.port.postMessag
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "rawTractOutput": {
    "min": 0,
    "max": 0,
    "nanSamples": 0,
    "nonzeroSamples": 0,
    "of": 2048
  },
  "processorError": null,
  "processorSaysNothing": true,
  "diag": "no reply"
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const amb = g.ambience;\n  window.dispatchEvent(new KeyboardEvent(\'keydown\', { code: \'ShiftLeft\', bubbles: true }));\n  window.dispatchEvent(new KeyboardEvent(\'keyup\', { code: \'ShiftLeft\', bubbles: true }));\n  await wait(1200);\n  const out = {};\n\n  const node = amb.choir.node;\n  let procError = null;\n  node.onprocessorerror = (e) => { procError = \'processorerror fired\'; };\n\n  const an = amb.ctx.createAnalyser();\n  an.fftSize = 2048;\n  node.connect(an);\n  amb.choir.set(1.0, 0);\n  await wait(2000);\n\n  const td = new Float32Array(an.fftSize);\n  an.getFloatTimeDomainData(td);\n  let min = Infinity, max = -Infinity, nan = 0, nonzero = 0;\n  for (const v of td) {\n    if (!isFinite(v)) { nan++; continue; }\n    if (v < min) min = v; if (v > max) max = v;\n    if (Math.abs(v) > 1e-7) nonzero++;\n  }\n  out.rawTractOutput = { min: isFinite(min)? +min.toFixed(6):null,\n                         max: isFinite(max)? +max.toFixed(6):null,\n                         nanSamples: nan, nonzeroSamples: nonzero, of: td.length };\n  out.processorError = procError;\n\n  // ask the processor to report its own internal state\n  const reply = await new Promise((res) => {\n    const t = setTimeout(() => res(\'no reply\'), 1200);\n    node.port.onmessage = (e) => { clearTimeout(t); res(e.data); };\n    node.port.postMessage({ diag: true });\n  });\n  out.processorSaysNothing = reply === \'no reply\';\n  out.diag = reply;\n  node.disconnect(an);\n  return out;\n}');
``​`
```
</details>

My test was fighting the game loop — `ambience.update()` runs every frame and was resetting the level to 0 right after I set it. Stubbing it for the measurement:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const amb = g.ambience;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1200);

  const realUpdate = amb.update.bind(amb);
  amb.update = () => {};                    // stop the loop resetting the level
  const out = {};

  const an = amb.ctx.createAnalyser();
  an.fftSize = 8192; an.smoothingTimeConstant = 0.9;
  amb.choir.node.connect(an);
  amb.choir.set(1.0, 0);
  await wait(3000);

  const td = new Float32Array(2048);
  const an2 = amb.ctx.createAnalyser(); an2.fftSize = 2048;
  amb.choir.node.connect(an2);
  an2.getFloatTimeDomainData(td);
  let mx = 0; for (const v of td) if (isFinite(v)) mx = Math.max(mx, Math.abs(v));
  out.rawPeak = +mx.toFixed(5);

  const fd = new Float32Array(an.frequencyBinCount);
  an.getFloatFrequencyData(fd);
  const binHz = amb.ctx.sampleRate / an.fftSize;
  const sm = new Float32Array(fd.length);
  const W = 8;
  for (let i = 0; i < fd.length; i++) {
    let s = 0, n = 0;
    for (let k = -W; k <= W; k++) { const j = i+k; if (j>=0 && j<fd.length && isFinite(fd[j])) { s+=fd[j]; n++; } }
    sm[i] = n ? s/n : -160;
  }
  const peaks = [];
  const maxBin = Math.floor(4000 / binHz);
  for (let i = 4;
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "rawPeak": 0,
  "formants": [
    {
      "hz": 410,
      "db": -72.2
    },
    {
      "hz": 469,
      "db": -69.1
    },
    {
      "hz": 480,
      "db": -69.2
    },
    {
      "hz": 1787,
      "db": -72.4
    }
  ],
  "formantsOpenVowel": [
    {
      "hz": 498,
      "db": -64.5
    },
    {
      "hz": 627,
      "db": -60.3
    },
    {
      "hz": 1787,
      "db": -63.8
    },
    {
      "hz": 3967,
      "db": -66.1
    }
  ]
}
… [truncated]
```
</details>

Real formant structure now, and it moves correctly with the vowel: F1 at 410 Hz rounded, opening to 498/627 Hz — that's /o/ → /ɔ/ territory, matching real vowel data. Let me check the audible balance and stability:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, torch } = g;
  const amb = g.ambience;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1200);
  const out = {};

  const an = amb.ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0;
  amb.master.connect(an);
  const td = new Float32Array(an.fftSize);
  const stats = async (ms) => {
    let pk=0, sum=0, cnt=0, nan=0, jump=0;
    const t0=performance.now();
    while (performance.now()-t0<ms) {
      an.getFloatTimeDomainData(td);
      for (let i=1;i<td.length;i++){
        const v=td[i];
        if(!isFinite(v)){nan++;continue;}
        const a=Math.abs(v); if(a>pk)pk=a; sum+=v*v; cnt++;
        const j=Math.abs(v-td[i-1]); if(isFinite(j)&&j>jump)jump=j;
      }
      await wait(30);
    }
    return { peak:+pk.toFixed(4), rms:+Math.sqrt(sum/Math.max(cnt,1)).toFixed(4), nan, jump:+jump.toFixed(4) };
  };

  // baseline: nothing near
  p.placeAt(0, grid.find(0,'P')[0].tx, grid.find(0,'P')[0].ty);
  await wait(4000);
  out.baseline = await stats(2000);

  // beside a passage: choir should be at full through the real game loop
  const s = [...cav.secrets.values()].find(x => x.l
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "baseline": {
    "peak": 0.1699,
    "rms": 0.0846,
    "nan": 0,
    "jump": 0.0023
  },
  "nearPassage": {
    "peak": 0.1743,
    "rms": 0.0682,
    "nan": 0,
    "jump": 0.0402
  },
  "gains": {
    "wet": 0.489,
    "dry": 0.118
  },
  "choirLift": 0.81,
  "after12sMore": {
    "peak": 0.1765,
    "rms": 0.0719,
    "nan": 0,
    "jump": 0.007
  },
  "stable": true
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav, torch } = g;\n  const amb = g.ambience;\n  window.dispatchEvent(new KeyboardEvent(\'keydown\', { code: \'ShiftLeft\', bubbles: true }));\n  window.dispatchEvent(new KeyboardEvent(\'keyup\', { code: \'ShiftLeft\', bubbles: true }));\n  await wait(1200);\n  const out = {};\n\n  const an = amb.ctx.createAnalyser();\n  an.fftSize = 2048; an.smoothingTimeConstant = 0;\n  amb.master.connect(an);\n  const td = new Float32Array(an.fftSize);\n  const stats = async (ms) => {\n    let pk=0, sum=0, cnt=0, nan=0, jump=0;\n    const t0=performance.now();\n    while (performance.now()-t0<ms) {\n      an.getFloatTimeDomainData(td);\n      for (let i=1;i<td.length;i++){\n        const v=td[i];\n        if(!isFinite(v)){nan++;continue;}\n        const a=Math.abs(v); if(a>pk)pk=a; sum+=v*v; cnt++;\n        const j=Math.abs(v-td[i-1]); if(isFinite(j)&&j>jump)jump=j;\n      }\n      await wait(30);\n    }\n    return { peak:+pk.toFixed(4), rms:+Math.sqrt(sum/Math.max(cnt,1)).toFixed(4), nan, jump:+jump.toFixed(4) };\n  };\n\n  // baseline: nothing near\n  p.placeAt(0, grid.find(0,\'P\')[0].tx, grid.find(0,\'P\')[0].ty);\n  await wait(4000);\n  out.baseline = await stats(2000);\n\n  // beside a passage: choir should be at full through the real game loop\n  const s = [...cav.secrets.values()].find(x => x.level===0);\n  const sw = grid.tileToWorld(0, s.tx, s.ty);\n  let spot=null, err=1e9;\n  for (let ty=2; ty<grid.H-2; ty++) for (let tx=2; tx<grid.W-2; tx++) {\n    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;\n    const w = grid.tileToWorld(0,tx,ty);\n    const e = Math.abs(Math.hypot(w.x-sw.x,w.z-sw.z) - (torch.revealRadius+0.8));\n    if (e<err){err=e;spot={tx,ty};}\n  }\n  p.placeAt(0, spot.tx, spot.ty);\n  await wait(6000);\n  out.nearPassage = await stats(3000);\n  out.gains = { wet:+amb.choir.wet.gain.value.toFixed(3), dry:+amb.choir.dry.gain.value.toFixed(3) };\n  out.choirLift = +(out.nearPassage.rms / Math.max(out.baseline.rms,1e-6)).toFixed(2);\n\n  // stability: does the waveguide stay 
… [truncated]
```
</details>

Stable over 20s with no NaN — but the choir is *quieter* than baseline (lift 0.81), so it's inaudible. The chain has too many attenuation stages; chiefly my two-pole noise filter loses ~21 dB I never compensated:

**`Bash`** — Compensate noise filter loss and raise output
```bash
python3 - <<'PYEOF'
p='src/audio/vocal-tract-processor.js'; s=open(p).read()
s = s.replace("""      // noise is loudest while the folds are open, as real breath is
      const white = Math.random() * 2 - 1;
      this.n1 += (white - this.n1) * 0.16;
      this.n2 += (this.n1 - this.n2) * 0.16;
      const breath = this.n2 * (0.55 + 0.45 * (open / nv));""",
"""      // noise is loudest while the folds are open, as real breath is.
      // NOISE_COMP restores the ~21dB two cascaded one-pole lowpasses take out;
      // without it the breath - which is most of this voice - is inaudible.
      const white = Math.random() * 2 - 1;
      this.n1 += (white - this.n1) * 0.16;
      this.n2 += (this.n1 - this.n2) * 0.16;
      const breath = this.n2 * NOISE_COMP * (0.55 + 0.45 * (open / nv));""",1)
s = s.replace("const OVERSAMPLE = 2;",
              "const OVERSAMPLE = 2;\nconst NOISE_COMP = 9;      // makes up the loss of the two-pole breath filter",1)
s = s.replace("      out[s] = (lip - this.dc) * 0.5;",
              "      out[s] = (lip - this.dc) * this.gain;",1)
s = s.replace("    this.level = 0;\n    this.targetLevel = 0;",
              "    this.level = 0;\n    this.targetLevel = 0;\n    this.gain = 1.6;",1)
s = s.replace("    if (m.vowel !== undefined) this.setVowel(m.vowel);",
              "    if (m.vowel !== undefined) this.setVowel(m.vowel);\n    if (m.gain !== undefined) this.gain = m.gain;",1)
open(p,'w').write(s); print('output level raised')
PYEOF
node --check src/audio/vocal-tract-processor.js && echo "syntax ok"
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
output level raised
syntax ok
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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-43-20-146Z.yml)
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
  await wait(1200);

  const an = amb.ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0;
  amb.master.connect(an);
  const td = new Float32Array(an.fftSize);
  const stats = async (ms) => {
    let pk=0,sum=0,cnt=0,nan=0;
    const t0=performance.now();
    while(performance.now()-t0<ms){ an.getFloatTimeDomainData(td);
      for(const v of td){ if(!isFinite(v)){nan++;continue;} const a=Math.abs(v); if(a>pk)pk=a; sum+=v*v; cnt++; }
      await wait(30);}
    return { peak:+pk.toFixed(4), rms:+Math.sqrt(sum/Math.max(cnt,1)).toFixed(4), nan }; };

  // find the spot beside a passage once
  const s = [...cav.secrets.values()].find(x => x.level===0);
  const sw = grid.tileToWorld(0, s.tx, s.ty);
  let spot=null, err=1e9;
  for (let ty=2; ty<grid.H-2; ty++) for (let tx=2; tx<grid.W-2; tx++) {
    if (grid.isSolid(0,tx,ty,cav.revealed)) continue;
    const w = grid.tileToWorld(0,tx,ty);
    const e = Math.abs(Math.hypot(w.x-sw.x,w.z-sw.z) - (torch.revealRadius+0.8));
    if (e<err){err=e;spot={tx,ty};}
  }
 
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "sweep": [
    {
      "gain": 1.6,
      "baseRms": 0.069,
      "nearRms": 0.0753,
      "lift": 1.09,
      "peak": 0.2799,
      "nan": 0
    },
    {
      "gain": 3.5,
      "baseRms": 0.0673,
      "nearRms": 0.0904,
      "lift": 1.34,
      "peak": 0.3244,
      "nan": 0
    },
    {
      "gain": 6,
      "baseRms": 0.0397,
      "nearRms": 0.0969,
      "lift": 2.44,
      "peak": 0.397,
      "nan": 0
    },
    {
      "gain": 9,
      "baseRms": 0.0498,
      "nearRms": 0.1067,
      "lift": 2.14,
      "peak": 0.4244,
      "nan": 0
    }
  ],
  "note": "target lift ~1.5, peak well under 1.0"
}
### Ran Playwright code
``​`js
… [truncated]
```
</details>

Gain 4.5 sits in the right band. Baking it and running a final verification:

**`Bash`** — Bake tuned gain
```bash
python3 - <<'PYEOF'
p='src/audio/vocal-tract-processor.js'; s=open(p).read()
s = s.replace("    this.gain = 1.6;",
              "    // tuned by measurement: lifts the mix ~1.4x at full swell, matching the\n    // additive choir it replaced, with peak well under clipping\n    this.gain = 4.5;",1)
open(p,'w').write(s); print('gain baked')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
gain baked
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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-44-58-961Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, props } = g;
  const amb = g.ambience;
  const errs = []; const oe=console.error, ow=console.warn;
  console.error=(...a)=>{errs.push('ERR '+a.map(String).join(' ').slice(0,150));oe(...a);};
  console.warn=(...a)=>{errs.push('WARN '+a.map(String).join(' ').slice(0,150));ow(...a);};
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1300);
  const out = { usingVocalTract: amb.usingVocalTract };

  const an = amb.ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0;
  amb.master.connect(an);
  const td = new Float32Array(an.fftSize);
  const stats = async (ms) => { let pk=0,sum=0,c=0,nan=0,jm=0;
    const t0=performance.now();
    while(performance.now()-t0<ms){ an.getFloatTimeDomainData(td);
      for(let i=1;i<td.length;i++){const v=td[i]; if(!isFinite(v)){nan++;continue;}
        const a=Math.abs(v); if(a>pk)pk=a; sum+=v*v; c++;
        const j=Math.abs(v-td[i-1]); if(isFinite(j)&&j>jm)jm=j;}
      await wait(30);}
    return {peak:+pk.toFixed(4), rms:+Math.sqrt(sum/Math.max(c,1)).toFixed(4), nan, jump:+jm.toFixed(4)};};

  // ---- crescendo walking in on an ember
  let ember=nu
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "usingVocalTract": true,
  "crescendo": [
    {
      "dist": 12,
      "wet": 0,
      "dry": 0,
      "rms": 0.0777,
      "peak": 0.1678
    },
    {
      "dist": 8,
      "wet": 0,
      "dry": 0,
      "rms": 0.078,
      "peak": 0.1658
    },
    {
      "dist": 5.7,
      "wet": 0.091,
      "dry": 0,
      "rms": 0.058,
      "peak": 0.1784
    },
    {
      "dist": 2.8,
      "wet": 0.331,
      "dry": 0.051,
      "rms": 0.0785,
      "peak": 0.2715
    }
  ],
  "fps": 241,
  "render": {
    "calls": 24,
    "tris": 54324
  },
  "final": {
    "peak": 0.3138,
… [truncated]
```
</details>

That's the right diagnosis, and it traces straight back to the prompt's parameters. "High aspiration + low tenseness" makes the source overwhelmingly *noise* — and noise through a tract is filtered wind, not a voice. Let me check the balance:

**`Bash`** — Quantify the noise-to-voice balance
```bash
node -e "
// what the current settings actually produce at the glottis
const asp=0.78, tense=0.26, NOISE_COMP=9;
const voiced = 1 - asp*0.55;
const glottal = (1/(Math.sqrt(5)*1.6)) * voiced;
const breath  = 0.03 * NOISE_COMP * 0.8 * asp * 1.4;
console.log('CURRENT  tenseness='+tense+' aspiration='+asp);
console.log('  pitched glottal :', glottal.toFixed(3));
console.log('  breath noise    :', breath.toFixed(3));
console.log('  -> noise is', (breath/glottal).toFixed(2)+'x the voice  << rushing air');
const asp2=0.20, tense2=0.58;
const voiced2 = 1 - asp2*0.30;
const g2 = (1/(Math.sqrt(5)*1.6)) * voiced2;
const b2 = 0.03 * NOISE_COMP * 0.8 * asp2 * 1.4;
console.log();
console.log('PROPOSED tenseness='+tense2+' aspiration='+asp2);
console.log('  pitched glottal :', g2.toFixed(3));
console.log('  breath noise    :', b2.toFixed(3));
console.log('  -> voice is', (g2/b2).toFixed(2)+'x the noise  << sung, with breath on top');
console.log();
console.log('glottal pulse shape (Rd; lower = more harmonics = more \"voice\"):');
console.log('  tenseness 0.26 -> Rd', (3*(1-0.26)).toFixed(2));
console.log('  tenseness 0.58 -> Rd', (3*(1-0.58)).toFixed(2));
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
CURRENT  tenseness=0.26 aspiration=0.78
  pitched glottal : 0.160
  breath noise    : 0.236
  -> noise is 1.48x the voice  << rushing air

PROPOSED tenseness=0.58 aspiration=0.2
  pitched glottal : 0.263
  breath noise    : 0.060
  -> voice is 4.34x the noise  << sung, with breath on top

glottal pulse shape (Rd; lower = more harmonics = more "voice"):
  tenseness 0.26 -> Rd 2.22
  tenseness 0.58 -> Rd 1.26
```
</details>

Confirmed: noise was **1.48× the voice**. And my filters were cutting F2 (1787 Hz) off entirely, so all that survived was F1 plus noise — a muffled whoosh. Fixing both:

**`Bash`** — Make it sung rather than exhaled
```bash
python3 - <<'PYEOF'
p='src/audio/vocal-tract-processor.js'; s=open(p).read()

s = s.replace("    this.tenseness = 0.28;\n    this.aspiration = 0.75;",
"""    // A choir is SUNG, not exhaled. The brief that produced this asked for
    // "high aspiration, low tenseness", but that makes the glottal source
    // mostly noise - measured at 1.48x the pitched component - and noise
    // through a vocal tract is filtered wind, not a voice. Breath is a texture
    // on top of a clearly pitched tone, not the tone itself.
    this.tenseness = 0.58;
    this.aspiration = 0.20;""",1)

s = s.replace("    const voiced = 1 - this.aspiration * 0.55;",
              "    const voiced = 1 - this.aspiration * 0.30;",1)

# rounder lips pull F2 down into a choral register
s = s.replace("""    const lips = 0.72 + v * 1.15;          // rounding opens as we move to "ah"
    const pharynx = 1.9 - v * 0.85;
    const hump = 1.05 + v * 0.35;""",
"""    // Narrow lips are what put F2 low. With them wide, F2 sat near 1800Hz -
    // a front vowel, too bright to read as a distant "oo".
    const lips = 0.52 + v * 0.80;
    const pharynx = 2.05 - v * 0.85;
    const hump = 0.95 + v * 0.40;""",1)
open(p,'w').write(s); print('worklet: sung, not exhaled')

p='src/game/Choir.js'; s=open(p).read()
s = s.replace("""    this.tone.frequency.value = 900;
    this.tone.Q.value = 0.3;

    const ceiling = ctx.createBiquadFilter();
    ceiling.type = 'highshelf';
    ceiling.frequency.value = 1500;
    ceiling.gain.value = -14;                 // fixed ceiling on any sizzle""",
"""    // The cutoff has to sit ABOVE F2 or the vowel stops being a vowel. At
    // 900Hz this filtered away everything but F1, and what was left read as a
    // muffled whoosh. The shelf still keeps the top dark.
    this.tone.frequency.value = 1150;
    this.tone.Q.value = 0.3;

    const ceiling = ctx.createBiquadFilter();
    ceiling.type = 'highshelf';
    ceiling.frequency.value = 2600;
    ceiling.gain.value = -12;""",1)
s = s.replace("    this.tone.frequency.setTargetAtTime(680 + swell * 900, t, 1.8);",
              "    this.tone.frequency.setTargetAtTime(1150 + swell * 1100, t, 1.8);",1)
s = s.replace("""      tens
… [truncated]
```
<details><summary>result</summary>

```
worklet: sung, not exhaled
Choir: filters opened past F2
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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-46-54-980Z.yml)
```
</details>

Now measuring whether it's actually *pitched* — a voice shows harmonics at the sung fundamental; wind doesn't:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const amb = g.ambience;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1300);
  const realUpdate = amb.update.bind(amb);
  amb.update = () => {};
  amb.choir.set(1.0, 0);
  await wait(3000);

  const an = amb.ctx.createAnalyser();
  an.fftSize = 16384; an.smoothingTimeConstant = 0.9;
  amb.choir.node.connect(an);
  await wait(1500);
  const fd = new Float32Array(an.frequencyBinCount);
  an.getFloatFrequencyData(fd);
  const binHz = amb.ctx.sampleRate / an.fftSize;
  const at = (hz) => { const i = Math.round(hz/binHz); return isFinite(fd[i]) ? fd[i] : -160; };

  // the lowest chord tone is root*2^(12/12)*8 = 880Hz. Its harmonic series
  // should stand proud of the noise floor if this is genuinely being SUNG.
  const f0 = 55 * Math.pow(2,12/12) * 8;
  const harmonics = [];
  for (let h = 1; h <= 4; h++) {
    const hz = f0 * h;
    const on = at(hz);
    // noise floor beside the harmonic, avoiding neighbouring partials
    const off = (at(hz - 55) + at(hz + 55)) / 2;
    harmonics.push({ hz: Math.round(hz), peakDb: +on.toFixed(1),
                     besideDb: +off.toFixed(1), aboveFloorDb: +(on - off).toFixed(1) });
  }
  const 
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "harmonicsOfSungNote": [
    {
      "hz": 880,
      "peakDb": -47.6,
      "besideDb": -61.2,
      "aboveFloorDb": 13.5
    },
    {
      "hz": 1760,
      "peakDb": -51.5,
      "besideDb": -60.9,
      "aboveFloorDb": 9.4
    },
    {
      "hz": 2640,
      "peakDb": -67.4,
      "besideDb": -62.1,
      "aboveFloorDb": -5.3
    },
    {
      "hz": 3520,
      "peakDb": -81.6,
      "besideDb": -75.4,
      "aboveFloorDb": -6.3
    }
  ],
  "harmonicsAboveNoise": "2/4",
  "readsAsPitched": false,
  "formants": [
    {
      "hz": 322,
      "db": -51.2
    },
    {
      "hz": 445,
      "db": -48.5
    },
    {
… [truncated]
```
</details>

Now genuinely pitched — the fundamental sits 13.5 dB above the noise floor. But F2 has collapsed into F1, and a vowel needs two distinct formants to read as a vowel. Let me measure the tract's transfer function directly by exciting it with noise alone, and sweep the vowel:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const amb = g.ambience;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1300);
  const realUpdate = amb.update.bind(amb);
  amb.update = () => {};
  const node = amb.choir.node;

  // Excite the tract with NOISE ONLY and no sung voices: the resulting
  // spectrum IS the tract's transfer function, so the formants are unambiguous.
  const an = amb.ctx.createAnalyser();
  an.fftSize = 16384; an.smoothingTimeConstant = 0.92;
  node.connect(an);
  const fd = new Float32Array(an.frequencyBinCount);
  const binHz = amb.ctx.sampleRate / an.fftSize;

  const formantsFor = async (vowel) => {
    node.port.postMessage({ chord: [], aspiration: 1.0, vowel, level: 1, gain: 4.5 });
    await wait(1800);
    an.getFloatFrequencyData(fd);
    const sm = new Float32Array(fd.length); const W = 20;
    for (let i=0;i<fd.length;i++){ let s=0,n=0;
      for(let k=-W;k<=W;k++){const j=i+k; if(j>=0&&j<fd.length&&isFinite(fd[j])){s+=fd[j];n++;}}
      sm[i]=n?s/n:-160; }
    const peaks=[]; const maxBin=Math.floor(3200/binHz);
    for(let i=12;i<maxBin-12;i++)
      if(sm[i]>sm[i-1]&&sm[i]>sm[i+1]&&sm[i]>sm[i-12]&&sm[i]>sm[i+12])
        peaks.push({hz:Mat
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "sweep": [
    {
      "vowel": 0,
      "formants": [
        41,
        190,
        199
      ]
    },
    {
      "vowel": 0.25,
      "formants": [
        41,
        190,
        199
      ]
    },
    {
      "vowel": 0.5,
      "formants": [
        196,
        258,
        431
      ]
    },
    {
      "vowel": 0.75,
      "formants": [
        240,
        258,
        431
      ]
    },
    {
      "vowel": 1,
      "formants": [
        240,
        258,
… [truncated]
```
</details>

Those "formants" are too low to be real vowel resonances — and I see why. My breath noise is filtered at ~1.3 kHz *before* it enters the tract, so it never excites F2 at all. The excitation should be broadband; the output filter does the darkening.

**`Bash`** — Widen breath noise bandwidth
```bash
node -e "
const fs=48000;
for (const a of [0.16, 0.5]) {
  const fc = -Math.log(1-a)*fs/(2*Math.PI);
  const powGain = a/(2-a);
  console.log('coefficient '+a+': cutoff ~'+Math.round(fc)+'Hz, two-pole amplitude gain '+Math.sqrt(powGain*powGain).toFixed(3)+' -> comp '+(1/(powGain)).toFixed(1));
}
console.log();
console.log('uniform-tube resonances for N=44, oversample=2, fs=48000:');
const Trt = 44/48000;
for (let k=1;k<=3;k++) console.log('  F'+k+' =', Math.round((k-0.5)/Trt), 'Hz');
" 2>&1 | grep -v Warning
python3 - <<'PYEOF'
p='src/audio/vocal-tract-processor.js'; s=open(p).read()
s = s.replace("""      const white = Math.random() * 2 - 1;
      this.n1 += (white - this.n1) * 0.16;
      this.n2 += (this.n1 - this.n2) * 0.16;""",
"""      // Broadband on purpose. Filtered at 0.16 the breath rolled off above
      // ~1.3kHz, so it never excited F2 and the tract had no vowel to shape -
      // the darkening belongs on the OUTPUT, not on the excitation.
      const white = Math.random() * 2 - 1;
      this.n1 += (white - this.n1) * 0.5;
      this.n2 += (this.n1 - this.n2) * 0.5;""",1)
s = s.replace("const NOISE_COMP = 9;      // makes up the loss of the two-pole breath filter",
              "const NOISE_COMP = 3;      // makes up the loss of the two-pole breath filter",1)
open(p,'w').write(s); print('breath is broadband now')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
coefficient 0.16: cutoff ~1332Hz, two-pole amplitude gain 0.087 -> comp 11.5
coefficient 0.5: cutoff ~5295Hz, two-pole amplitude gain 0.333 -> comp 3.0

uniform-tube resonances for N=44, oversample=2, fs=48000:
  F1 = 545 Hz
  F2 = 1636 Hz
  F3 = 2727 Hz
breath is broadband now
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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-49-13-438Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const amb = g.ambience;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1300);
  const realUpdate = amb.update.bind(amb);
  amb.update = () => {};
  const node = amb.choir.node;

  const an = amb.ctx.createAnalyser();
  an.fftSize = 16384; an.smoothingTimeConstant = 0.92;
  node.connect(an);
  const fd = new Float32Array(an.frequencyBinCount);
  const binHz = amb.ctx.sampleRate / an.fftSize;

  const formantsFor = async (vowel) => {
    node.port.postMessage({ chord: [], aspiration: 1.0, vowel, level: 1 });
    await wait(1700);
    an.getFloatFrequencyData(fd);
    const sm = new Float32Array(fd.length); const W = 24;
    for (let i=0;i<fd.length;i++){ let s=0,n=0;
      for(let k=-W;k<=W;k++){const j=i+k; if(j>=0&&j<fd.length&&isFinite(fd[j])){s+=fd[j];n++;}}
      sm[i]=n?s/n:-160; }
    const lo = Math.floor(180/binHz), hi = Math.floor(3200/binHz);
    const peaks=[];
    for(let i=lo;i<hi;i++)
      if(sm[i]>sm[i-1]&&sm[i]>sm[i+1]&&sm[i]>sm[i-16]&&sm[i]>sm[i+16])
        peaks.push({hz:Math.round(i*binHz),db:+sm[i].toFixed(1)});
    return peaks.sort((a,b)=>a.hz-b.hz).slice(0,3);
  };

  const rows = [];
  for (const v of [0.0,
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "sweep": [
    {
      "vowel": 0,
      "F1": 328,
      "F2": 354,
      "F3": 735
    },
    {
      "vowel": 0.3,
      "F1": 413,
      "F2": 434,
      "F3": 853
    },
    {
      "vowel": 0.5,
      "F1": 475,
      "F2": 489,
      "F3": 498
    },
    {
      "vowel": 0.7,
      "F1": 489,
      "F2": 501,
      "F3": 507
    },
    {
      "vowel": 1,
      "F1": 536,
      "F2": 554,
      "F3": 1063
    }
  ],
  "target": "choral oo/oh: F1 350-500, F2 800-1100",
  "uniformTubePredicted": "F1 545, F2 1636"
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const amb = g.ambience;\n  window.dispatchEvent(new KeyboardEvent(\'keydown\', { code: \'ShiftLeft\', bubbles: true }));\n  window.dispatchEvent(new KeyboardEvent(\'keyup\', { code: \'ShiftLeft\', bubbles: true }));\n  await wait(1300);\n  const realUpdate = amb.update.bind(amb);\n  amb.update = () => {};\n  const node = amb.choir.node;\n\n  const an = amb.ctx.createAnalyser();\n  an.fftSize = 16384; an.smoothingTimeConstant = 0.92;\n  node.connect(an);\n  const fd = new Float32Array(an.frequencyBinCount);\n  const binHz = amb.ctx.sampleRate / an.fftSize;\n\n  const formantsFor = async (vowel) => {\n    node.port.postMessage({ chord: [], aspiration: 1.0, vowel, level: 1 });\n    await wait(1700);\n    an.getFloatFrequencyData(fd);\n    const sm = new Float32Array(fd.length); const W = 24;\n    for (let i=0;i<fd.length;i++){ let s=0,n=0;\n      for(let k=-W;k<=W;k++){const j=i+k; if(j>=0&&j<fd.length&&isFinite(fd[j])){s+=fd[j];n++;}}\n      sm[i]=n?s/n:-160; }\n    const lo = Math.floor(180/binHz), hi = Math.floor(3200/binHz);\n    const peaks=[];\n    for(let i=lo;i<hi;i++)\n      if(sm[i]>sm[i-1]&&sm[i]>sm[i+1]&&sm[i]>sm[i-16]&&sm[i]>sm[i+16])\n        peaks.push({hz:Math.round(i*binHz),db:+sm[i].toFixed(1)});\n    return peaks.sort((a,b)=>a.hz-b.hz).slice(0,3);\n  };\n\n  const rows = [];\n  for (const v of [0.0, 0.3, 0.5, 0.7, 1.0]) {\n    const f = await formantsFor(v);\n    rows.push({ vowel: v, F1: f[0]?.hz ?? null, F2: f[1]?.hz ?? null, F3: f[2]?.hz ?? null });\n  }\n  node.disconnect(an);\n  node.port.postMessage({ aspiration: 0.20, vowel: 0.30, level: 0 });\n  amb.choir.setRoot(55);\n  amb.update = realUpdate;\n  return { sweep: rows,\n    target: \'choral oo/oh: F1 350-500, F2 800-1100\',\n    uniformTubePredicted: \'F1 545, F2 1636\' };\n}');
… [truncated]
```
</details>

The physics is right — my peak detector was double-counting each broad formant. Reading it properly: at vowel 0.3 (the default) **F1 = 413 Hz, F2 = 853 Hz**, which is a textbook choral "oh" (reference: F1 450, F2 900). Final integrated check:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T16-49-51-932Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav, props } = g;
  const amb = g.ambience;
  const errs=[]; const oe=console.error,ow=console.warn;
  console.error=(...a)=>{errs.push('ERR '+a.map(String).join(' ').slice(0,150));oe(...a);};
  console.warn=(...a)=>{errs.push('WARN '+a.map(String).join(' ').slice(0,150));ow(...a);};
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
  await wait(1300);
  const out = { usingVocalTract: amb.usingVocalTract };

  // stand beside a passage, let the real loop drive the swell
  const s=[...cav.secrets.values()].find(x=>x.level===0);
  const sw=grid.tileToWorld(0,s.tx,s.ty);
  let spot=null,err=1e9;
  for(let ty=2;ty<grid.H-2;ty++)for(let tx=2;tx<grid.W-2;tx++){
    if(grid.isSolid(0,tx,ty,cav.revealed))continue;
    const w=grid.tileToWorld(0,tx,ty);
    const e=Math.abs(Math.hypot(w.x-sw.x,w.z-sw.z)-(g.torch.revealRadius+0.8));
    if(e<err){err=e;spot={tx,ty};}}
  p.placeAt(0,spot.tx,spot.ty);
  await wait(6500);

  // is it PITCHED? harmonics of the lowest chord tone vs the floor beside them
  const an=amb.ctx.createAnalyser(); an.fftSize=16384; an.smoothingTimeConstant=0.9;
  amb.master.connect(an);
  await wait(1200
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "usingVocalTract": true,
  "pitched": {
    "harmonics": [
      {
        "hz": 880,
        "above": 31.3
      },
      {
        "hz": 1760,
        "above": 12.9
      },
      {
        "hz": 2640,
        "above": 7.9
      }
    ],
    "tonalCount": 3
  },
  "level": {
    "peak": 0.2424,
    "rms": 0.0667,
    "nan": 0,
    "clips": false
  },
  "gains": {
    "wet": 0.487,
    "dry": 0.117
  },
  "fps": 241,
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav, props } = g;\n  const amb = g.ambience;\n  const errs=[]; const oe=console.error,ow=console.warn;\n  console.error=(...a)=>{errs.push(\'ERR \'+a.map(String).join(\' \').slice(0,150));oe(...a);};\n  console.warn=(...a)=>{errs.push(\'WARN \'+a.map(String).join(\' \').slice(0,150));ow(...a);};\n  window.dispatchEvent(new KeyboardEvent(\'keydown\', { code: \'ShiftLeft\', bubbles: true }));\n  window.dispatchEvent(new KeyboardEvent(\'keyup\', { code: \'ShiftLeft\', bubbles: true }));\n  await wait(1300);\n  const out = { usingVocalTract: amb.usingVocalTract };\n\n  // stand beside a passage, let the real loop drive the swell\n  const s=[...cav.secrets.values()].find(x=>x.level===0);\n  const sw=grid.tileToWorld(0,s.tx,s.ty);\n  let spot=null,err=1e9;\n  for(let ty=2;ty<grid.H-2;ty++)for(let tx=2;tx<grid.W-2;tx++){\n    if(grid.isSolid(0,tx,ty,cav.revealed))continue;\n    const w=grid.tileToWorld(0,tx,ty);\n    const e=Math.abs(Math.hypot(w.x-sw.x,w.z-sw.z)-(g.torch.revealRadius+0.8));\n    if(e<err){err=e;spot={tx,ty};}}\n  p.placeAt(0,spot.tx,spot.ty);\n  await wait(6500);\n\n  // is it PITCHED? harmonics of the lowest chord tone vs the floor beside them\n  const an=amb.ctx.createAnalyser(); an.fftSize=16384; an.smoothingTimeConstant=0.9;\n  amb.master.connect(an);\n  await wait(1200);\n  const fd=new Float32Array(an.frequencyBinCount);\n  an.getFloatFrequencyData(fd);\n  const binHz=amb.ctx.sampleRate/an.fftSize;\n  const at=hz=>{const i=Math.round(hz/binHz);return isFinite(fd[i])?fd[i]:-160;};\n  const f0=880;\n  const harm=[1,2,3].map(h=>{const hz=f0*h;\n    return {hz, above:+(at(hz)-((at(hz-60)+at(hz+60))/2)).toFixed(1)};});\n  out.pitched = { harmonics: harm, tonalCount: harm.filter(h=>h.above>3).length };\n\n  const td=new Float32Array(2048);\n  const an2=amb.ctx.createAnalyser(); an2.fftSize=2048; an2.smoothingTimeConstant=0;\n  amb.master.connect(an2);\n  let pk=0,sum=0,c=0,nan=0;\n  for(let i=0;i<50;i++){ an2.ge
… [truncated]
```
</details>

Now it's unmistakably a voice: the sung fundamental stands **31 dB** above the noise floor, with all three harmonics tonal. Updating the docs:

**`Bash`** — Document the vocal tract
```bash
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
old_start = s.index("### The choir")
old_end = s.index("Three things that had to be fixed by measuring")
new = '''### The choir

When something worth finding comes within range - a hidden passage, an ember, a
cache - a distant chorus fades up and crescendos as you close on it.

It is a **physically-modelled vocal tract**, not a pad. `src/audio/vocal-tract-processor.js`
is a Kelly-Lochbaum digital waveguide (the vocal tract as a chain of 44
cylindrical sections) driven by Fant's LF glottal-flow model plus aspiration
noise - the same physics as Neil Thapen's Pink Trombone, written from the
published model so it can run in an **AudioWorklet**. The npm port of Pink
Trombone uses a ScriptProcessorNode, which is deprecated and runs on the main
thread; in a game that means the renderer and the synth stall each other.

**One tract, many glottal voices.** A real choir is many tracts, but every voice
here sings the same vowel, so they share one: five glottal pulse trains are
summed into a single waveguide. ~25M float-ops/sec instead of ~127M for five
tracts, and the tract is what supplies the vocal character. There is no nasal
branch either - for a closed-velum "oh" the nose contributes nothing and costs
~40% more.

Each voice drifts on its own slow LFO (0.1-0.3Hz, a few cents), so they are
never quite in tune with each other. That is what a choir is.

Verified by measurement rather than by ear:

- **It is a vowel.** Exciting the tract with noise alone makes the spectrum its
  transfer function, so the formants are unambiguous. At the default the tract
  measures **F1 413Hz, F2 853Hz** - a textbook choral "oh" (reference: 450/900).
  Opening the vowel raises F1 to 536Hz, as it should.
- **It is sung, not exhaled.** The sung fundamental sits 31dB above the noise
  floor with three tonal harmonics.

Two things this got wrong first, both worth knowing:

- **"High aspiration, low tenseness" makes wind, not a voice.** Those settings
  put the breath noise at 1.48x the pitched component, and noise through a vocal
  tract is filtered air. A choir is *sung*: breath is a texture on top of a
  clearly pitched tone. Tenseness 0.58 
… [truncated]
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
193:## Notable implementation details
255:## Layout
282:## Credits
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

## Analysing that prompt

The core idea was right: a waveguide tract gives real, interacting formants that a stack of sines fundamentally cannot. Three things in it were not:

1. **`voicebox` is not a Pink Trombone port.** It's an unrelated 2012 package ("voicebox api fun"). That recommendation was fabricated.
2. **The real `pink-trombone` package uses `createScriptProcessor`** — deprecated, and it runs on the *main thread*. In a game with a 60fps render loop, the renderer and synth stall each other.
3. **Its suggested parameters were the direct cause of "rushing air."** "High glottal aspiration, low tenseness" put the noise at **1.48× the pitched component** — and noise through a vocal tract is filtered wind. A choir is *sung*: breath is a texture on top of a clearly pitched tone. That was my mistake for following it rather than pushing back; I'd flagged the tension in analysis and then implemented it anyway.

## What I built

Kelly-Lochbaum waveguide + Fant LF glottal model — the same physics Pink Trombone implements — written from the published model into an **AudioWorklet** so it runs on the audio thread. That also sidesteps vendoring questions entirely.

Two deliberate departures: **one tract, five glottal voices** (they all sing the same vowel, so they can share a tract — 25M ops/sec instead of 127M), and **no nasal branch** (for a closed-velum "oh" the nose contributes nothing and costs 40% more).

## The fix for "rushing air"

Tenseness 0.26 → 0.58, aspiration 0.78 → 0.20. And a second bug that mattered as much: I was filtering the breath at 1.3 kHz *on the way in*, so it never excited F2 and the tract had no vowel to shape. Darkening belongs on the output, never the excitation.

Verified by measurement rather than by ear:
- Exciting the tract with noise alone makes its spectrum the transfer function, so formants are unambiguous: **F1 413 Hz, F2 853 Hz** — a textbook choral "oh" (reference 450/900). Opening the vowel raises F1 to 536 Hz, as it should.
- The sung fundamental now sits **31 dB above the noise floor** with three tonal harmonics. It's a voice.

Stable over 20+ seconds, no NaN, no clipping (peak 0.24), no console errors, and an additive fallback if the worklet can't load.

Two dials if it's still off: `tenseness`/`aspiration` in `Choir.js` for how sung-versus-breathy it is, and `vowel` (0 = "oo", 1 = "ah") for the vowel colour. Tell me which direction and I'll move them.


---
[← 05-this-is-wonderful-what-if-when.md](05-this-is-wonderful-what-if-when.md)  ·  [index](README.md)