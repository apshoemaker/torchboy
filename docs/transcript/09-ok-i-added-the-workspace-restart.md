# 9. ok - I added the workspace.  Restart it, please.

[← index](README.md)

## The prompt

> ok - I added the workspace.  Restart it, please.

## What happened

**`Bash`** — Restart dev server with workspace id
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== .env keys present (values not printed) ==="
grep -oE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*' .env | sed 's/export//;s/ //g'
echo
pkill -f "vite" 2>/dev/null; sleep 1; rm -f /tmp/vite.log
(npx vite --port 5180 --strictPort >| /tmp/vite.log 2>&1 &) ; sleep 6
curl -s -o /dev/null -w "server: %{http_code}\n" http://localhost:5180/
```
<details><summary>result</summary>

```
=== .env keys present (values not printed) ===
ANTHROPIC_API_KEY
ANTHROPIC_WORKSPACE_ID

server: 200
```
</details>

**`Bash`** — Live story generation with workspace
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
curl -s -X POST http://localhost:5180/api/story -o /tmp/story1.json -w "HTTP %{http_code}\n"
node -e "
const d=JSON.parse(require('fs').readFileSync('/tmp/story1.json','utf8'));
if (d.error) { console.log('ERROR:', d.error); console.log('detail:', (d.detail||'').slice(0,240)); process.exit(0); }
console.log('model :', d.model, '| ms:', d.ms);
console.log('spark :', JSON.stringify(d.spark));
console.log('usage :', JSON.stringify(d.usage));
console.log();
console.log('  \"'+d.title+'\"');
console.log();
d.beats.forEach((b,i)=>console.log('  '+(i+1)+'. '+b));
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
HTTP 200
model : claude-sonnet-5 | ms: 7111
spark : {"register":"wistful","relic":"a length of blue string","reason":"a promise he made too young"}
usage : {"input_tokens":801,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0},"output_tokens":324,"output_tokens_details":{"thinking_tokens":35},"service_tier":"standard","inference_geo":"global"}

  "Torchboy's Descent"

  1. He went down because he had promised, and promises made at seven do not expire.
  2. The Threshold smelled of rain that never reached it. He held the torch like a small warm animal.
  3. Somewhere above, a length of blue string still hung tied to a fence post, waiting.
  4. The torch shivered blue-white near a wall that was not a wall. He learned to trust the shiver.
  5. Embers lay like fallen stars in the Weeping Gallery. He gathered what he could carry.
  6. He remembered tying the string to her wrist. Stay found, he had said, too young to mean it right.
  7. The Deep Hollow did not echo. It only listened, the way she once had.
  8. He found a sealed room, miners' tools rusted mid-task, and did not know why he wept.
  9. He walked on, torch dimming to gold, the string long gone, the promise somehow kept.
```
</details>

Working — and the blue-string motif from the spark threads through beats 3, 6 and 9. But let me check it against the constraints I set:

**`Bash`** — Check beats against prompt constraints
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
node -e "
const d=JSON.parse(require('fs').readFileSync('/tmp/story1.json','utf8'));
const LEVELS=['Threshold','Weeping Gallery','Deep Hollow'];
let over=0, named=[];
d.beats.forEach((b,i)=>{
  const n=b.length;
  if(n>140) over++;
  const hit=LEVELS.filter(L=>b.includes(L));
  if(hit.length) named.push((i+1)+': '+hit.join(','));
  console.log(String(i+1).padStart(2)+'  '+String(n).padStart(3)+' chars'+(n>140?'  <-- OVER 140':''));
});
console.log();
console.log('over 140 chars :', over+'/'+d.beats.length);
console.log('names a level  :', named.length ? named.join(' | ') : 'none');
console.log('cost this run  : \$'+((801*2 + 324*10)/1e6).toFixed(5));
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
 1   79 chars
 2   96 chars
 3   82 chars
 4   94 chars
 5   85 chars
 6   97 chars
 7   69 chars
 8   84 chars
 9   84 chars

over 140 chars : 0/9
names a level  : 2: Threshold | 5: Weeping Gallery | 7: Deep Hollow
cost this run  : $0.00484
```
</details>

All beats are comfortably under 140 chars, and it cost **$0.0048** — about 200 stories per dollar. But it named all three levels, which I'd explicitly forbidden, and that's a real bug rather than mere disobedience: beats surface at arbitrary moments, so "the Weeping Gallery" can appear while you're still on level 1, contradicting the HUD.

The robust fix isn't a firmer instruction — it's not giving it the names at all:

**`Bash`** — Remove level names and verify across runs
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='tools/story-plugin.mjs'; s=open(p).read()
s = s.replace("""- He is deep underground, descending through three caverns: The Threshold, then
  The Weeping Gallery, then The Deep Hollow.""",
"""- He is deep underground, descending through three caverns, each older and
  stranger than the one above it.""",1)
s = s.replace("""- Do not name the levels or use the words "player", "level", "game".""",
"""- Never use the words "player", "level", or "game".""",1)
s = s.replace("""- Never explain the game's mechanics or address the player. This is his memory,
  surfacing while he walks, not a tutorial.""",
"""- Never explain the game's mechanics or address the player. This is his memory,
  surfacing while he walks, not a tutorial.
- Do not invent proper names for the caverns, and do not say which one he is in.
  The beats surface at unpredictable moments, so any beat that pins him to a
  specific place will sooner or later contradict where he actually is.""",1)
open(p,'w').write(s); print('level names removed from the prompt entirely')
PYEOF
pkill -f "vite" 2>/dev/null; sleep 1; rm -f /tmp/vite.log
(npx vite --port 5180 --strictPort >| /tmp/vite.log 2>&1 &) ; sleep 6
echo "=== three fresh runs: variety + constraint compliance ==="
for i in 1 2 3; do curl -s -X POST http://localhost:5180/api/story -o /tmp/s$i.json; done
node -e "
const fs=require('fs');
const LEVELS=['Threshold','Weeping Gallery','Deep Hollow','Gallery','Hollow'];
const firsts=[], titles=[];
let cost=0;
for (const i of [1,2,3]) {
  const d=JSON.parse(fs.readFileSync('/tmp/s'+i+'.json','utf8'));
  if(d.error){console.log('run '+i+' ERROR:',d.error);continue;}
  const over=d.beats.filter(b=>b.length>140).length;
  const named=d.beats.filter(b=>LEVELS.some(L=>b.includes(L)));
  cost += (d.usage.input_tokens*2 + d.usage.output_tokens*10)/1e6;
  titles.push(d.title); firsts.push(d.beats[0]);
  console.log('--- run '+i+'  \"'+d.title+'\"  ['+d.spark.register+' / '+d.spark.reason+']');
  console.log('    beats '+d.beats.length+' | over140 '+over+' | names a cavern '+named.length+' | '+d.ms+'ms');
  console.log('    1. '+d.beats[0]);
  console.log('  
… [truncated]
```
<details><summary>result</summary>

```
level names removed from the prompt entirely
=== three fresh runs: variety + constraint compliance ===
--- run 1  "The Deep Door"  [bitter / a door he should not have opened]
    beats 9 | over140 0 | names a cavern 0 | 5124ms
    1. He remembered opening the door he was told never to open.
    9. He kept walking, not toward anything anymore, just away from the door he had opened.
--- run 2  "The Long Dark Down"  [gentle / someone is not waiting any more]
    beats 9 | over140 0 | names a cavern 0 | 5500ms
    1. He didn't remember deciding to go under. Only that the door had gone quiet behind him.
    9. He kept walking. Not toward anyone now. Just away from the waiting that had stopped.
--- run 3  "What the Slate Kept"  [gentle / a story he was told and believed]
    beats 9 | over140 0 | names a cavern 0 | 5305ms
    1. He remembered being told the light below never lied, and he had believed it.
    9. He went through anyway, carrying the small warm weight of believing it still.

distinct titles : 3/3
distinct openers: 3/3
cost, 3 runs    : $0.0123
```
</details>

Fixed across three runs: zero cavern names, zero overlong beats, three distinct titles and openers. **$0.004 per story** (~240 per dollar), ~5s to generate. Now confirming it lands in the actual game:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T17-10-37-818Z.yml)
```
</details>

**`playwright/browser_evaluate`**
```js
async () => {
  const g = window.__game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errs=[]; const oe=console.error;
  console.error=(...a)=>{errs.push(a.map(String).join(' ').slice(0,160));oe(...a);};

  // wait for the live generation to land
  const t0 = performance.now();
  while (!g.narrator.ready && performance.now() - t0 < 25000) await wait(200);
  const n = g.narrator;
  const out = {
    source: n.source, title: n.title, beats: n.beats.length,
    waitedMs: Math.round(performance.now() - t0),
    reason: n.reason || null,
  };

  // play: walk him around and collect what actually appears on screen
  const el = document.getElementById('narration');
  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}));
  const seen = []; let last = '';
  const dirs=['KeyW','KeyD','KeyS','KeyA'];
  for (let i=0;i<44;i++){
    const k=dirs[i%4];
    key(k,true); await wait(450); key(k,false);
    if (el.classList.contains('show') && el.textContent !== last) {
      last = el.textContent; seen.push(last);
    }
  }
  out.appearedOnScreen = seen;
  out.beatsShown = n.index;
  out.errors = errs;
  return out;
}
```
<details><summary>result</summary>

```
### Result
{
  "source": "claude",
  "title": "The Weight of Descent",
  "beats": 9,
  "waitedMs": 0,
  "reason": null,
  "appearedOnScreen": [
    "He had promised her, small and certain, the way children promise the impossible.",
    "The key hung against his chest. He no longer remembered the lock."
  ],
  "beatsShown": 2,
  "errors": []
}
### Ran Playwright code
``​`js
await page.evaluate('async () => {\n  const g = window.__game;\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const errs=[]; const oe=console.error;\n  console.error=(...a)=>{errs.push(a.map(String).join(\' \').slice(0,160));oe(...a);};\n\n  // wait for the live generation to land\n  const t0 = performance.now();\n  while (!g.narrator.ready && performance.now() - t0 < 25000) await wait(200);\n  const n = g.narrator;\n  const out = {\n    source: n.source, title: n.title, beats: n.beats.length,\n    waitedMs: Math.round(performance.now() - t0),\n    reason: n.reason || null,\n  };\n\n  // play: walk him around and collect what actually appears on screen\n  const el = document.getElementById(\'narration\');\n  const key=(c,d)=>window.dispatchEvent(new KeyboardEvent(d?\'keydown\':\'keyup\',{code:c,bubbles:true}));\n  const seen = []; let last = \'\';\n  const dirs=[\'KeyW\',\'KeyD\',\'KeyS\',\'KeyA\'];\n  for (let i=0;i<44;i++){\n    const k=dirs[i%4];\n    key(k,true); await wait(450); key(k,false);\n    if (el.classList.contains(\'show\') && el.textContent !== last) {\n      last = el.textContent; seen.push(last);\n    }\n  }\n  out.appearedOnScreen = seen;\n  out.beatsShown = n.index;\n  out.errors = errs;\n  return out;\n}');
``​`
### Page
- Page URL: http://localhost:5180/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T17-10-37-631Z.log#L1
```
</details>

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](.playwright-mcp/page-2026-09-06T17-11-15-216Z.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as .playwright-mcp/page-2026-09-06T17-11-15-216Z.png
await page.screenshot({
  path: '.playwright-mcp/page-2026-09-06T17-11-15-216Z.png',
  scale: 'css',
  type: 'png'
});
``​`

```
</details>

Live in the game. Let me update the docs and finish:

**`Bash`** — Document final story config
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
s = s.replace('''Torchboy's backstory is **generated fresh every session** by Claude
(`claude-opus-5`), and revealed in fragments as you explore. It is never the
same twice.

``​`bash
export ANTHROPIC_API_KEY=sk-ant-...   # or: ant auth login
npm run dev
``​`''',
'''Torchboy's backstory is **generated fresh every session** by Claude
(`claude-sonnet-5`), and revealed in fragments as you explore. It is never the
same twice. About **$0.004 per story** - roughly 240 runs per dollar - and ~5s
to generate, in the background, while you are already playing.

``​`bash
# .env in this directory (gitignored), or one level up
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_WORKSPACE_ID=wrkspc_...   # only for org-level keys, not workspace-scoped ones
STORY_MODEL=claude-opus-5           # optional; default is claude-sonnet-5
STORY_EFFORT=low                    # optional; default medium
``​`

Vite does not put `.env` into `process.env` for plugins - it only exposes
`VITE_`-prefixed vars, and only to client code - so `vite.config.mjs` loads it
explicitly for the server side, checking this directory and its parent.''',1)
s = s.replace('''**Structured output** (`output_config.format` with a Zod schema) is what makes''',
'''**Do not give a model information you do not want it to use.** The first version
listed the three cavern names in the system prompt for texture, and told the
model not to name them. It named all three. That is not just disobedience - the
beats surface at unpredictable moments, so "the Weeping Gallery" would appear
while you were still in the first cavern, contradicting the HUD. The fix was to
remove the names from the prompt entirely and describe the caverns generically;
a firmer prohibition would have been the fragile version of the same idea.

**Structured output** (`output_config.format` with a Zod schema) is what makes''',1)
open(p,'w').write(s); print('README updated')
PYEOF
npx vite build --logLevel error 2>&1 | grep -viE "warning|trace" | head -3; echo BUILD_OK
echo "=== final safety ==="
git check-ignore -q .env && echo "  .env gitignored" || echo "  WARNING"
echo "  secr
… [truncated]
```
<details><summary>result</summary>

```
README updated
BUILD_OK
=== final safety ===
  .env gitignored
  secrets in dist: 0
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

Restarted, and it's live. **http://localhost:5180** — a fresh story every run.

Here's one it produced:

> **"Torchboy's Descent"**
> 1. He went down because he had promised, and promises made at seven do not expire.
> 3. Somewhere above, a length of blue string still hung tied to a fence post, waiting.
> 6. He remembered tying the string to her wrist. Stay found, he had said, too young to mean it right.
> 9. He walked on, torch dimming to gold, the string long gone, the promise somehow kept.

The blue string came from the randomised spark and the model threaded it through three beats on its own.

**Cost: $0.004 per story** on Sonnet 5 — ~240 runs per dollar, ~5s to generate in the background while you're already playing. Cheaper than I estimated, because thinking only used 35 tokens on a task this simple. `STORY_MODEL` / `STORY_EFFORT` in `.env` if you want to compare against Opus.

## One bug the first live run exposed

It named all three caverns — "The Threshold", "the Weeping Gallery", "the Deep Hollow" — despite my prompt explicitly forbidding it. That mattered more than disobedience: beats surface at unpredictable moments, so "the Weeping Gallery" would appear while you were still in the first cavern, contradicting the HUD.

The fix wasn't a firmer instruction. I'd listed the names in the system prompt for texture and then asked it not to use them — so I removed them entirely and described the caverns generically. Don't give a model information you don't want it to use; a stronger prohibition is just the fragile version of the same idea.

Verified across three fresh runs after the change: **zero cavern names, zero beats over 140 chars, three distinct titles and three distinct openers.**

## Housekeeping

Your `.env` moved into `cavern-game/` and is gitignored — I added that *before* moving it, since this directory is a git repo and the parent isn't. Confirmed: ignored, untracked, and no key or workspace ID anywhere in the built bundle.

Also worth noting for the future: Vite doesn't put `.env` into `process.env` for plugins at all — it only exposes `VITE_`-prefixed vars, and only to client code. `vite.config.mjs` now loads it explicitly server-side, checking both this directory and its parent, so either placement works.


---
[← 08-ok-there-i-stuck-it-in.md](08-ok-there-i-stuck-it-in.md)  ·  [index](README.md)