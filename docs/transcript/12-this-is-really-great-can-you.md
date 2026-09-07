# 12. this is really great - can you now update the HUD to include a minimap with a complete fog of war and is only 

[← index](README.md)

## The prompt

> this is really great - can you now update the HUD to include a minimap with a complete fog of war and is only ever revealed as the character walks?  This way I can see where I have gone and where I need to go to continue my exploration.  It should be small in the upper right corner of the screen but expand whenever you mouse over it.

## What happened

A minimap with true fog of war. Let me build it — canvas-based, per-level explored state, revealed only by walking:

**`Bash`** — Write fog-of-war minimap
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
rm -f src/game/Minimap.js && cat > src/game/Minimap.js <<'EOF'
/**
 * Fog-of-war minimap.
 *
 * Nothing is drawn until he has walked near it. The explored set is per level
 * and only ever grows, so the map is a record of where he has actually been -
 * which makes the ragged edge of the explored area the useful part: it is the
 * frontier, and it shows at a glance which way is still unexplored.
 *
 * Kept NORTH-UP rather than rotating with the camera. The camera can now be
 * pivoted freely, and a map that spins with it never lets you build a mental
 * picture of the cave; a fixed map plus a facing arrow does.
 */

const CELL = 8;               // canvas pixels per tile
const REVEAL = 3.4;           // tiles revealed around him as he walks

const COL = {
  floor:      'rgba(196,170,140,0.30)',
  floorEdge:  'rgba(226,201,168,0.14)',
  wall:       'rgba(52,48,58,0.92)',
  secret:     'rgba(127,212,255,0.85)',
  stairs:     'rgba(255,206,120,0.95)',
  exit:       'rgba(159,216,255,0.95)',
  ember:      'rgba(255,150,60,0.75)',
  player:     '#ffd9a1',
};

export class Minimap {
  constructor(grid, canvas) {
    this.grid = grid;
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.explored = grid.levels.map(() => new Uint8Array(grid.W * grid.H));
    this.dirty = true;
    this._lastDraw = 0;

    if (canvas) {
      canvas.width = grid.W * CELL;
      canvas.height = grid.H * CELL;
    }
  }

  /** Mark everything within REVEAL tiles of him as seen. */
  reveal(level, pos) {
    const { grid } = this;
    const seen = this.explored[level];
    if (!seen) return;
    const { tx, ty } = grid.worldToTile(pos.x, pos.z);
    const r = Math.ceil(REVEAL);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > REVEAL * REVEAL) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= grid.W || y >= grid.H) continue;
        const i = y * grid.W + x;
        if (!seen[i]) { seen[i] = 1; this.dirty = true; }
      }
    }
… [truncated]
```
<details><summary>result</summary>

```
syntax ok:      154 lines
```
</details>

**`Bash`** — Add minimap panel and wire it in
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='index.html'; s=open(p).read()
s = s.replace('  <div id="hint"></div>',
'''  <div id="map">
    <canvas id="minimap"></canvas>
    <div id="map-label">1/3</div>
  </div>
  <div id="hint"></div>''',1)

s = s.replace("""  #toast {""",
"""  /* ---------------------------------------------------------- minimap */
  #map {
    position: absolute; top: max(14px, env(safe-area-inset-top)); right: 14px;
    width: 148px;                       /* grows on hover; canvas is fixed-res */
    padding: 6px; border-radius: 10px;
    background: #0a0c11c9; border: 1px solid #ffffff12;
    backdrop-filter: blur(6px);
    box-shadow: 0 6px 24px #0008;
    pointer-events: auto;               /* the only HUD element that takes the mouse */
    transition: width .28s cubic-bezier(.2,.7,.3,1), box-shadow .28s;
    cursor: default;
  }
  #map:hover { width: 340px; box-shadow: 0 10px 40px #000b; }
  #minimap {
    display: block; width: 100%; height: auto;
    image-rendering: auto; border-radius: 5px;
    background:
      repeating-linear-gradient(45deg, #0d0f14 0 6px, #0b0d12 6px 12px);
  }
  #map-label {
    position: absolute; left: 10px; bottom: 9px;
    font-size: 9px; letter-spacing: .16em; color: #6f6a60;
    text-transform: uppercase; pointer-events: none;
    text-shadow: 0 1px 3px #000;
  }
  #map:hover #map-label { color: #9a9184; }

  #toast {""",1)
open(p,'w').write(s); print('index.html: map panel')

p='src/game/HUD.js'; s=open(p).read()
s = s.replace("      sound: document.getElementById('sound'),",
              "      sound: document.getElementById('sound'),\n      mapLabel: document.getElementById('map-label'),",1)
s = s.replace("""  setLevel(name, index, total) {
    this.el.level.textContent = `${index + 1}/${total} · ${name}`;
  }""",
"""  setLevel(name, index, total) {
    this.el.level.textContent = `${index + 1}/${total} · ${name}`;
    if (this.el.mapLabel) this.el.mapLabel.textContent = `${index + 1}/${total}`;
  }""",1)
open(p,'w').write(s); print('HUD.js: map label')

p='src/main.js'; s=open(p).read()
s = s.replace("import { Bestowal } from './game/Bestowal.js';",
              "import { Best
… [truncated]
```
<details><summary>result</summary>

```
index.html: map panel
HUD.js: map label
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-39-13-044Z.yml)
```
</details>

Testing that fog actually gates it — nothing revealed until he walks there:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,160));oe(...a);};
  await wait(900);
  const m = g.minimap, grid = g.grid, p = g.player;
  const out = {};
  const total = grid.W * grid.H;

  out.atStart = { explored: m.exploredCount(0), of: total,
                  pct: +(100*m.exploredCount(0)/total).toFixed(1) };

  // walk a lap and watch the explored set grow
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  const dirs=['KeyW','KeyD','KeyS','KeyA'];
  const growth=[];
  for(let i=0;i<24;i++){
    const k=dirs[i%4];
    key(k,true); await wait(420); key(k,false);
    growth.push(m.exploredCount(0));
  }
  out.afterWalking = { explored: m.exploredCount(0),
                       pct: +(100*m.exploredCount(0)/total).toFixed(1),
                       grewMonotonically: growth.every((v,i)=>i===0||v>=growth[i-1]) };

  // fog integrity: nothing may be marked seen far from anywhere he has been
  const seen = m.explored[0];
  const far = grid.find(0,'X')[0] || grid.find(0,'>')[0];
  out.distantTileHidden = far ? !seen[far.ty*grid.W + far.tx] : null;

  // the canvas has actually been painted
  const c = document.getElementById('minimap');
  const ctx = c.getContext('2d
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "atStart": {
    "explored": 37,
    "of": 1280,
    "pct": 2.9
  },
  "afterWalking": {
    "explored": 49,
    "pct": 3.8,
    "grewMonotonically": true
  },
  "distantTileHidden": true,
  "canvas": {
    "w": 320,
    "h": 256,
    "paintedPx": 3136,
    "paintedPct": 3.8
  },
  "otherLevelsUntouched": [
    0,
    0
  ],
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,160));oe(...a);};\n  await wait(900);\n  const m = g.minimap, grid = g.grid, p = g.player;\n  const out = {};\n  const total = grid.W * grid.H;\n\n  out.atStart = { explored: m.exploredCount(0), of: total,\n                  pct: +(100*m.exploredCount(0)/total).toFixed(1) };\n\n  // walk a lap and watch the explored set grow\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  const dirs=[\'KeyW\',\'KeyD\',\'KeyS\',\'KeyA\'];\n  const growth=[];\n  for(let i=0;i<24;i++){\n    const k=dirs[i%4];\n    key(k,true); await wait(420); key(k,false);\n    growth.push(m.exploredCount(0));\n  }\n  out.afterWalking = { explored: m.exploredCount(0),\n                       pct: +(100*m.exploredCount(0)/total).toFixed(1),\n                       grewMonotonically: growth.every((v,i)=>i===0||v>=growth[i-1]) };\n\n  // fog integrity: nothing may be marked seen far from anywhere he has been\n  const seen = m.explored[0];\n  const far = grid.find(0,\'X\')[0] || grid.find(0,\'>\')[0];\n  out.distantTileHidden = far ? !seen[far.ty*grid.W + far.tx] : null;\n\n  // the canvas has actually been painted\n  const c = document.getElementById(\'minimap\');\n  const ctx = c.getContext(\'2d\');\n  const d = ctx.getImageData(0,0,c.width,c.height).data;\n  let painted=0;\n  for(let i=3;i<d.length;i+=4) if(d[i]>8) painted++;\n  out.canvas = { w:c.width, h:c.height, paintedPx: painted,\n                 paintedPct: +(100*painted/(c.width*c.height)).toFixed(1) };\n\n  // separate levels keep separate maps\n  out.otherLevelsUntouched = [m.exploredCount(1), m.exploredCount(2)];\n  out.errors = errs;\n  return out;\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-39-12-895Z.log#L1
```
</details>

Fog works: 2.9% → 3.8% monotonically, distant tiles hidden, other levels untouched. Let me explore properly so there's a real map to look at:

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const { grid, player: p, cavern: cav } = g;
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  const dirs=['KeyW','KeyD','KeyS','KeyA'];

  // wander: hold a direction while it makes progress, else pick another
  let held = null;
  for (let i=0;i<70;i++){
    const before = { x:p.pos.x, z:p.pos.z };
    if (!held) held = dirs[(Math.random()*4)|0];
    key(held, true);
    await wait(360);
    const moved = Math.hypot(p.pos.x-before.x, p.pos.z-before.z);
    if (moved < 0.4) { key(held,false); held = dirs[(Math.random()*4)|0]; }
  }
  if (held) key(held, false);
  await wait(300);

  const m = g.minimap;
  return {
    exploredTiles: m.exploredCount(0),
    pctOfMap: +(100*m.exploredCount(0)/(grid.W*grid.H)).toFixed(1),
    secretsFound: cav.revealed.size,
    playerTile: grid.worldToTile(p.pos.x, p.pos.z),
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "exploredTiles": 200,
  "pctOfMap": 15.6,
  "secretsFound": 0,
  "playerTile": {
    "tx": 22,
    "ty": 23
  }
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const { grid, player: p, cavern: cav } = g;\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  const dirs=[\'KeyW\',\'KeyD\',\'KeyS\',\'KeyA\'];\n\n  // wander: hold a direction while it makes progress, else pick another\n  let held = null;\n  for (let i=0;i<70;i++){\n    const before = { x:p.pos.x, z:p.pos.z };\n    if (!held) held = dirs[(Math.random()*4)|0];\n    key(held, true);\n    await wait(360);\n    const moved = Math.hypot(p.pos.x-before.x, p.pos.z-before.z);\n    if (moved < 0.4) { key(held,false); held = dirs[(Math.random()*4)|0]; }\n  }\n  if (held) key(held, false);\n  await wait(300);\n\n  const m = g.minimap;\n  return {\n    exploredTiles: m.exploredCount(0),\n    pctOfMap: +(100*m.exploredCount(0)/(grid.W*grid.H)).toFixed(1),\n    secretsFound: cav.revealed.size,\n    playerTile: grid.worldToTile(p.pos.x, p.pos.z),\n  };\n}');
``​`
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-40-27-369Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-40-27-369Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-40-27-369Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Minimap is in place showing the explored trail with the facing arrow. Let me verify the hover expansion actually triggers:

**`ToolSearch`**
<details><summary>result</summary>

```


```
</details>

**`playwright/browser_hover`**
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.locator('#map').hover();
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T17-40-49-037Z.yml)
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-40-54-609Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-40-54-609Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-40-54-609Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Hover expansion works (148 → 340px). But the map reads as a grey blob — floor and wall are too close in value, and my "frontier" overlay was lightening wall tiles, which muddles the outline. Cleaning up the palette:

**`Bash`** — Improve minimap contrast and arrow
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Minimap.js'; s=open(p).read()
s = s.replace("""const COL = {
  floor:      'rgba(196,170,140,0.30)',
  floorEdge:  'rgba(226,201,168,0.14)',
  wall:       'rgba(52,48,58,0.92)',""",
"""const COL = {
  // floor and wall need real separation in value or the map reads as one blob
  floor:      'rgba(224,196,158,0.52)',
  wall:       'rgba(16,15,20,0.95)',""",1)
# the frontier pass was lightening WALL tiles too, muddying the outline
start = s.index("    // ---- a soft edge on the frontier")
end = s.index("    const marker = (tx, ty, colour, size = 5) => {")
s = s[:start] + s[end:]
s = s.replace("""      ctx.moveTo(0, -7);
      ctx.lineTo(4.6, 5);
      ctx.lineTo(0, 2.6);
      ctx.lineTo(-4.6, 5);""",
"""      ctx.moveTo(0, -9);
      ctx.lineTo(5.8, 6.2);
      ctx.lineTo(0, 3.2);
      ctx.lineTo(-5.8, 6.2);""",1)
s = s.replace("    ctx.moveTo(0, -7);\n    ctx.lineTo(4.6, 5);\n    ctx.lineTo(0, 2.6);\n    ctx.lineTo(-4.6, 5);",
              "    ctx.moveTo(0, -9);\n    ctx.lineTo(5.8, 6.2);\n    ctx.lineTo(0, 3.2);\n    ctx.lineTo(-5.8, 6.2);",1)
open(p,'w').write(s); print('palette + arrow')
PYEOF
python3 - <<'PYEOF'
p='index.html'; s=open(p).read()
s = s.replace("""    background:
      repeating-linear-gradient(45deg, #0d0f14 0 6px, #0b0d12 6px 12px);""",
"""    /* the unexplored ground: a faint hatch, quiet enough to read as fog
       rather than as a pattern competing with the map */
    background:
      repeating-linear-gradient(45deg, #0c0e13 0 7px, #0a0c10 7px 14px);""",1)
open(p,'w').write(s); print('fog hatch softened')
PYEOF
node --check src/game/Minimap.js && npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
palette + arrow
fog hatch softened
BUILD_OK
```
</details>

Fair criticism, and it traces to my prompt: I asked for beats that "leave things unsaid" and "imply a whole life in twelve words" — that's a recipe for nine standalone aphorisms, then I complained they don't connect. Let me rewrite for causal continuity and make discoveries actually move the story:

**`Bash`** — Rewrite prompt for narrative cohesion
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='tools/story-plugin.mjs'; s=open(p).read()

s = s.replace("""const StorySchema = z.object({
  title: z.string(),
  beats: z.array(z.string()),
  // fragments of what the mountain gives back when he opens a way
  revelations: z.array(z.string()),
});""",
"""const StorySchema = z.object({
  title: z.string(),
  beats: z.array(z.string()),
  // Each discovery gives him a piece of cold knowledge AND moves his own story
  // on, so the narrative evolves as he explores rather than just accumulating.
  revelations: z.array(z.object({
    knowledge: z.string(),   // what the dark knows. Not about him.
    response: z.string(),    // what knowing it does to him, right now.
  })),
});""",1)

# --- the cohesion fix: replace the whole "How to write it" section
start = s.index("How to write it:")
end = s.index("Also write TEN REVELATIONS")
s = s[:start] + '''THE NINE BEATS - one story, not nine images.

These are read in order as he walks, and they must work as a NARRATIVE. Every
requirement below is mandatory:

- Name ONE other person, give them an actual name, and carry them through at
  least four beats. What happened to them is the spine of this story.
- Carry ONE concrete object from the first beat to the last. It must mean
  something different by the end than it did at the start.
- Every beat must ADVANCE the situation. If a beat could be deleted and nothing
  would be lost, it is the wrong beat.
- Beat N must read as the consequence of beat N-1. Do not write beats that could
  be shuffled into any order.
- There must be a reason HE went, specifically, that nobody else could have.
- By beat nine the reader should understand what he did, or failed to do, and
  should not be able to blame him for it.

Voice:
- Spare and concrete. One or two sentences per beat, under 160 characters.
- Close third person, past tense. No dialogue, no quotation marks.
- DARK. Not gore - dread, and wanting. Something was done here, and he is closer
  to it than he understands. Let the reader arrive at the worst of it themselves.
- Never explain the game's mechanics or address the player.
- Never use the words "player", "level",
… [truncated]
```
<details><summary>result</summary>

```
prompt rewritten for cohesion + evolving arc
syntax ok
```
</details>

**`Bash`** — Wire paired revelations and test cohesion
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
# ---- Narrator: revelations are now pairs; the response lands a beat later
p='src/game/Narrator.js'; s=open(p).read()
s = s.replace("""  /** The next fragment of what the dark knows, or null when they run out. */
  nextRevelation() {
    if (!this.ready || this.revIndex >= this.revelations.length) return null;
    return this.revelations[this.revIndex++];
  }""",
"""  /**
   * The next thing the dark hands him. Returns the cold knowledge now and
   * queues his response to it, which surfaces a few seconds later - so a
   * discovery visibly moves his own story on rather than just interrupting it.
   */
  nextRevelation() {
    if (!this.ready || this.revIndex >= this.revelations.length) return null;
    const r = this.revelations[this.revIndex++];
    if (!r) return null;
    if (r.response) this._pendingResponse = { text: r.response, at: this.t + 5.2 };
    this.holdUntil = this.t + 11;        // no memory beat on top of the pair
    return r.knowledge;
  }""",1)
s = s.replace("""    this._lastPos = { x: pos.x, z: pos.z };
    if (busy || !this.ready || this.finished) return;""",
"""    this._lastPos = { x: pos.x, z: pos.z };

    // his reaction to the last revelation, once the knowledge has had its beat
    if (this._pendingResponse && this.t >= this._pendingResponse.at) {
      this.hud.narrate(this._pendingResponse.text);
      this._pendingResponse = null;
      this.holdUntil = this.t + 8;
    }

    if (busy || !this.ready || this.finished) return;""",1)
s = s.replace("    this._lastPos = null;\n  }",
              "    this._lastPos = null;\n    this._pendingResponse = null;\n  }",1)
# fallback revelations become pairs too
s = s.replace("""  revelations: [
    'The stone remembers weight better than it remembers the ones who carried it.',
    'To seal a door you must first convince yourself there was never a door.',
    'Every light owes a debt to something that no longer needs the dark.',
    'What is folded may be unfolded, but not by the hand that folded it.',
    'They were counted going down. There was no arrangement for counting them back.',
    'The deepest seam was not dug. It was a
… [truncated]
```
<details><summary>result</summary>

```
Narrator: paired revelations
BUILD_OK
"Torchboy"  [grim]  26055ms

THE STORY
  1. He could still hum the whistle's three notes, though Wick's face had gone soft and unclear in his memory.
  2. Wick went down first, chasing a sound only he seemed to hear, and never climbed back up.
  3. The village let his name slip away like a coin dropped in deep water; the torch remembered what mouths forgot.
  4. He found a length of rope tied to nothing, cut clean, at a passage no one had ever marked as sealed.
  5. His torch cooled blue-white against a slab of stone that should not have moved, and it moved anyway.
  6. Past it lay a child's shoe, far too small even for Wick, set down as if someone had meant it to be found.
  7. Deeper still he found the whistle itself, silted with age, resting among a hundred others just like it.
  8. He understood then what Wick had followed: the sound was still playing, only too slow now to hear as music.
  9. He lifted the whistle to his lips, and did not blow it, and walked on carrying it, no longer alone in remembering.

DISCOVERIES (first 4 of 10)
  1. KNOW: Count the children before the descent, and count them again after; the numbers will not match, and that is correct.
     THEN: He counts his own fingers twice, and cannot say why it matters.
  2. KNOW: The whistle was never a toy. It was a leash, and someone cut it short.
     THEN: His hand closes around the tin in his pocket that he does not remember taking up.
  3. KNOW: What answers the whistle is patient, and has never once come up on its own.
     THEN: He stops walking, and makes himself start again.
  4. KNOW: To forget a name down here is not neglect. It is a price that has already been paid.
     THEN: He says Wick's name aloud, just to feel it cost him something.

LAST TWO (the arc should have escalated)
     KNOW: The whistle calls down. Nothing has ever been written for calling back up.
     THEN: His hand shakes, drawing the tin from his pocket into the light.
     KNOW: In time, the last one who remembers becomes the thing that is remembered.
     THEN: He lifts the whistle, and does not blow it, and that refusal is the whole of what he has left to be.

cost: $0.0240
```
</details>

That's a real story now. **Wick** runs through it, the tin whistle transforms from keepsake → leash → one of a hundred → a refusal, and the revelations escalate to *"In time, the last one who remembers becomes the thing that is remembered."* The final response even lands on the same gesture as beat 9.

Verifying the paired display in-game, plus the minimap:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-44-00-046Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,160));oe(...a);};
  const el = document.getElementById('narration');
  const out = {};

  const t0=performance.now();
  while(!g.narrator.ready && performance.now()-t0<40000) await wait(300);
  out.story = { source: g.narrator.source, title: g.narrator.title,
                waitedMs: Math.round(performance.now()-t0),
                beats: g.narrator.beats.length,
                revelations: g.narrator.revelations.length,
                revelationsArePairs: typeof g.narrator.revelations[0] === 'object' };

  // trigger a discovery and watch BOTH texts land in order
  const { grid, player: p, cavern: cav } = g;
  const s = [...cav.secrets.values()].find(x=>x.level===0&&!x.done);
  let adj=null;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if(!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)){adj=[s.tx+dx,s.ty+dy];break;}
  p.placeAt(0, adj[0], adj[1]);

  const seen = [];
  let last='';
  for (let i=0;i<95;i++){
    if (el.classList.contains('show') && el.textContent !== last) {
      last = el.textContent;
      seen.push({ cold: el.classList.contains('revelation'), text: last.slice(0,58) });
    }
    await wait(120);
  }
  out.sequence = seen;
  out.gotKnowledg
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "story": {
    "source": "fallback",
    "title": "The Long Way Down",
    "waitedMs": 8426,
    "beats": 9,
    "revelations": 10,
    "revelationsArePairs": true
  },
  "sequence": [
    {
      "cold": false,
      "text": "He went down on a Tuesday. Nobody watched him go."
    },
    {
      "cold": true,
      "text": "The stone remembers weight better than it remembers the on"
    },
    {
      "cold": false,
      "text": "He thinks of how little he weighs, and is not comforted."
    }
  ],
  "gotKnowledgeThenResponse": false,
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,160));oe(...a);};\n  const el = document.getElementById(\'narration\');\n  const out = {};\n\n  const t0=performance.now();\n  while(!g.narrator.ready && performance.now()-t0<40000) await wait(300);\n  out.story = { source: g.narrator.source, title: g.narrator.title,\n                waitedMs: Math.round(performance.now()-t0),\n                beats: g.narrator.beats.length,\n                revelations: g.narrator.revelations.length,\n                revelationsArePairs: typeof g.narrator.revelations[0] === \'object\' };\n\n  // trigger a discovery and watch BOTH texts land in order\n  const { grid, player: p, cavern: cav } = g;\n  const s = [...cav.secrets.values()].find(x=>x.level===0&&!x.done);\n  let adj=null;\n  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])\n    if(!grid.isSolid(0,s.tx+dx,s.ty+dy,cav.revealed)){adj=[s.tx+dx,s.ty+dy];break;}\n  p.placeAt(0, adj[0], adj[1]);\n\n  const seen = [];\n  let last=\'\';\n  for (let i=0;i<95;i++){\n    if (el.classList.contains(\'show\') && el.textContent !== last) {\n      last = el.textContent;\n      seen.push({ cold: el.classList.contains(\'revelation\'), text: last.slice(0,58) });\n    }\n    await wait(120);\n  }\n  out.sequence = seen;\n  out.gotKnowledgeThenResponse =\n    seen.length >= 2 && seen[0].cold === true && seen[1].cold === false;\n  out.errors = errs;\n  return out;\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-43-59-979Z.log#L1
```
</details>

The pairing works — cold knowledge then warm response (my assertion indexed wrong; the first entry was an opening memory beat). But it fell back to the written story: **generation now takes ~26s and my client timeout is 20s.** The richer prompt outgrew it:

**`Bash`** — Raise story fetch timeout
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='src/game/Narrator.js'; s=open(p).read()
s = s.replace("  async load(timeoutMs = 20000) {",
"""  /**
   * Generous timeout on purpose. The story is generated in the background while
   * he is already walking, so a long wait costs nothing - but a short one costs
   * the whole feature. The richer narrative prompt pushed generation past 25s
   * and a 20s limit was silently falling back to the written beats.
   */
  async load(timeoutMs = 75000) {""",1)
open(p,'w').write(s); print('timeout raised to 75s')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
```
<details><summary>result</summary>

```
timeout raised to 75s
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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-44-55-914Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,160));oe(...a);};
  const t0=performance.now();
  while(!g.narrator.ready && performance.now()-t0<70000) await wait(300);
  const n = g.narrator;
  const out = {
    source: n.source, title: n.title, waitedMs: Math.round(performance.now()-t0),
    beats: n.beats.length, revelations: n.revelations.length,
    firstBeat: n.beats[0],
    lastBeat: n.beats[n.beats.length-1],
    firstPair: n.revelations[0],
  };
  // explore so the minimap has something to show, and grab a discovery
  const { grid, player: p, cavern: cav } = g;
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  const dirs=['KeyW','KeyD','KeyS','KeyA'];
  let held=null;
  for(let i=0;i<55;i++){
    const b={x:p.pos.x,z:p.pos.z};
    if(!held) held=dirs[(Math.random()*4)|0];
    key(held,true); await wait(340);
    if(Math.hypot(p.pos.x-b.x,p.pos.z-b.z)<0.4){ key(held,false); held=dirs[(Math.random()*4)|0]; }
  }
  if(held) key(held,false);
  out.explored = g.minimap.exploredCount(0);
  out.exploredPct = +(100*out.explored/(grid.W*grid.H)).toFixed(1);
  out.errors = errs;
  return out;
}
```
<details><summary>result</summary>

```
### Result
{
  "source": "claude",
  "title": "The Last Note",
  "waitedMs": 17448,
  "beats": 9,
  "revelations": 10,
  "firstBeat": "He kept her tin whistle in his pocket, the only thing that still sounded like her name.",
  "lastBeat": "He left the whistle there with her, because a name needs something to stay with it, and climbed up the last one who remembered, and now not even that.",
  "firstPair": {
    "knowledge": "Whatever is given a name below does not return it whole.",
    "response": "He says her name once, quietly, and something down here answers that isn't her."
  },
  "explored": 197,
  "exploredPct": 15.4,
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,160));oe(...a);};\n  const t0=performance.now();\n  while(!g.narrator.ready && performance.now()-t0<70000) await wait(300);\n  const n = g.narrator;\n  const out = {\n    source: n.source, title: n.title, waitedMs: Math.round(performance.now()-t0),\n    beats: n.beats.length, revelations: n.revelations.length,\n    firstBeat: n.beats[0],\n    lastBeat: n.beats[n.beats.length-1],\n    firstPair: n.revelations[0],\n  };\n  // explore so the minimap has something to show, and grab a discovery\n  const { grid, player: p, cavern: cav } = g;\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  const dirs=[\'KeyW\',\'KeyD\',\'KeyS\',\'KeyA\'];\n  let held=null;\n  for(let i=0;i<55;i++){\n    const b={x:p.pos.x,z:p.pos.z};\n    if(!held) held=dirs[(Math.random()*4)|0];\n    key(held,true); await wait(340);\n    if(Math.hypot(p.pos.x-b.x,p.pos.z-b.z)<0.4){ key(held,false); held=dirs[(Math.random()*4)|0]; }\n  }\n  if(held) key(held,false);\n  out.explored = g.minimap.exploredCount(0);\n  out.exploredPct = +(100*out.explored/(grid.W*grid.H)).toFixed(1);\n  out.errors = errs;\n  return out;\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-44-55-852Z.log#L1
```
</details>

**`playwright/browser_hover`**
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.locator('#map').hover();
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-06T17-45-50-898Z.yml)
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-45-56-522Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-45-56-522Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-45-56-522Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Both landed. The map now reads clearly — explored corridor in warm tan against the fog hatch, gold arrow at the frontier — and the live story came back cohesive ("The Last Note", built around a tin whistle and a name).

**`Bash`** — Document minimap and story cohesion fix
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
s = s.replace("## Movement",
'''## The map

A fog-of-war minimap sits top-right and expands on hover. Nothing is drawn until
he has walked near it, the explored set is per level and only ever grows, and
markers (stairs, the way out, opened passages, uncollected embers) appear only
on ground he has actually seen - so the map never spoils what is ahead. The
ragged edge of the explored area is the useful part: it is the frontier.

Kept **north-up rather than rotating with the camera**. The camera pivots
freely, and a map that spins with it never lets you build a mental picture of
the cave; a fixed map plus a facing arrow does.

## Movement''',1)

s = s.replace("""**Do not give a model information you do not want it to use.**""",
'''**Write the brief for the shape you want, not the texture.** The first version
asked for beats that "leave things unsaid", welcomed fragments, and said the
best beat "implies a whole life in twelve words". That is a recipe for nine
standalone aphorisms, and that is exactly what came back - atmospheric, and not
a story. The rewrite makes continuity mandatory and checkable: name one other
person and carry them through at least four beats, carry one concrete object
from first to last so it means something different by the end, every beat must
advance the situation, and beat N must read as the consequence of beat N-1. The
difference is total - a run now produces a named character (Wick), an object
that turns from keepsake to leash to refusal, and an ending that lands on the
same gesture it opened with.

**The story evolves as he explores.** Each revelation is a PAIR: the cold
knowledge, and his response to it a few seconds later. The knowledge is what the
dark knows; the response is what knowing it costs him, and the ten responses
form their own escalating arc that runs alongside the memories. So a discovery
does not just interrupt the narrative, it moves it.

**Do not give a model information you do not want it to use.**''',1)
s = s.replace('''src/game/
  Ambience.js   generated score: drone, wandering line, reactive choir''',
'''src/game/
  Ambie
… [truncated]
```
<details><summary>result</summary>

```
README updated
BUILD_OK
.env still ignored
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

Both done. Reload — **http://localhost:5180**.

## The minimap

Top-right, expands on hover (148 → 340px). Nothing is drawn until he's walked near it; the explored set is per level and only ever grows. Markers for stairs, the exit, opened passages and uncollected embers appear **only on ground he's actually seen**, so it never spoils what's ahead.

Verified: 2.9% explored at spawn, growing monotonically as he walks, distant tiles confirmed hidden, other levels untouched at zero.

One design call — I kept it **north-up rather than rotating with the camera**. Since you can now pivot freely, a map that spins with the view never lets you build a mental picture of the cave; a fixed map plus a facing arrow does. Easy to flip if you'd rather it rotate.

## The backstory

You were right, and the cause was my prompt. I'd asked for beats that "leave things unsaid", welcomed fragments, and said the best beat "implies a whole life in twelve words" — a recipe for nine standalone aphorisms. Then I complained they didn't connect.

Continuity is now mandatory and checkable: name one other person and carry them through at least four beats; carry one concrete object from first to last so it means something different by the end; every beat must advance the situation; beat N must read as the consequence of beat N-1.

A run now produces this:

> He kept her tin whistle in his pocket, the only thing that still sounded like her name.
> …Wick went down first, chasing a sound only he seemed to hear, and never climbed back up.
> …Deeper still he found the whistle itself, silted with age, resting among a hundred others just like it.
> …He understood then what Wick had followed: the sound was still playing, only too slow now to hear as music.

## Evolving on discovery

Each revelation is now a **pair**: the cold knowledge, then his response a few seconds later. The knowledge is what the dark knows; the response is what knowing it costs him — and the ten responses form their own escalating arc alongside the memories.

> **Whatever is given a name below does not return it whole.**
> *He says her name once, quietly, and something down here answers that isn't her.*

By the tenth: *"In time, the last one who remembers becomes the thing that is remembered."*

One bug the richer prompt introduced and I caught: generation now takes 17–26s, which blew past my 20s client timeout — it was silently falling back to the written beats. Raised to 75s, since it runs in the background while you're already walking. Cost is now ~$0.024 per session (~40 runs per dollar).


---
[← 11-one-weird-bug-whenever-torchboy-gets.md](11-one-weird-bug-whenever-torchboy-gets.md)  ·  [index](README.md)