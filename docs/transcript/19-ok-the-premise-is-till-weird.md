# 19. ok the premise is till weird ... let's do this.  Start with the premise "TorchBoy finds himself in a deep dark

[← index](README.md)

## The prompt

> ok the premise is till weird ... let's do this.  Start with the premise "TorchBoy finds himself in a deep dark cave, he knows that his torch can help find secret passages and that there must be some way to make his torch work better.  He has a darkness in his heart that he doesn't understand but knows that he has to get out of this cave and go into the light." - no dogs, no whistles, nada lol.  The story should evolve from there based on where he has been, what he has seen, what ancient knowledge is bestowed on him, etc.

## What happened

**`Bash`** — Read current plugin
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '1,120p' tools/story-plugin.mjs
```
<details><summary>result</summary>

```
/**
 * Vite middleware that writes Torchboy's story WHILE it is being played.
 *
 * One endpoint: POST /api/story/next. The client sends everything told so far
 * plus a log of what has just happened in the cave, and gets back the next
 * beat, or a knowledge/response pair for a discovery, or the ending.
 *
 * This lives server-side for one reason: an Anthropic API key must never reach
 * the browser. Anything in `src/` is shipped to the client and readable in
 * devtools, so the key stays here and the game only ever sees finished prose.
 *
 * There is no premise. The model is given the world, the rules, and what has
 * actually happened, and invents everything else - who he lost, what he
 * carries, what was done down here. Nothing is seeded.
 *
 * Mounted on both the dev server and `vite preview`. Without credentials it
 * returns 503 and the game falls back to written beats - the story is a
 * flourish and must never be why the game fails to start.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

// Sonnet 5 by default: short creative prose, not hard reasoning, and about a
// third of Opus per run. Override with STORY_MODEL / STORY_EFFORT in .env.
const MODEL = process.env.STORY_MODEL || 'claude-sonnet-5';
const EFFORT = process.env.STORY_EFFORT || 'low';

const BEAT_SCHEMA = z.object({ text: z.string() });

// The opening beat gets its own schema. Asking for candidates first is the
// whole point: a single sample from a fixed prompt collapses onto one answer
// (every run got a tin whistle, then every run got a ledger), but a model
// listing six answers in ONE completion spreads them out, because it can see
// what it has already said. We then name which one it must use. The candidates
// are entirely the model's - we only supply the index, so nothing about the
// story is decided in advance.
const OPENING_SCHEMA = z.object({
  options: z.array(z.string()).min(6).max(6),
  text: z.string(),
… [truncated]
```
</details>

That's a cleaner design — an authored premise, and the story grows from the cave rather than from invented backstory. The rules that forced "name a person, give him an object" are exactly what kept minting whistles and dead uncles, so those go too:

**`Bash`** — Fixed authored premise, drop invention machinery
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='tools/story-plugin.mjs'; s=open(p).read()

# --- header comment
old = """ * There is no premise. The model is given the world, the rules, and what has
 * actually happened, and invents everything else - who he lost, what he
 * carries, what was done down here. Nothing is seeded.
"""
new = """ * The premise is FIXED and authored (see PREMISE below) - the boy, the cave,
 * the torch, the darkness in his heart, the light he is climbing toward. What
 * the model does NOT do is invent a backstory: no lost relatives, no keepsakes,
 * no companions. Everything past the premise has to grow out of what actually
 * happened in the cave - where he went, what he saw, what the dark told him.
"""
assert old in s, 'MISS header'; s = s.replace(old, new, 1)

# --- drop the candidate-enumeration schema; the premise does that job now
old = """
// The opening beat gets its own schema. Asking for candidates first is the
// whole point: a single sample from a fixed prompt collapses onto one answer
// (every run got a tin whistle, then every run got a ledger), but a model
// listing six answers in ONE completion spreads them out, because it can see
// what it has already said. We then name which one it must use. The candidates
// are entirely the model's - we only supply the index, so nothing about the
// story is decided in advance.
const OPENING_SCHEMA = z.object({
  options: z.array(z.string()).min(6).max(6),
  text: z.string(),
});
"""
assert old in s, 'MISS schema'; s = s.replace(old, "", 1)

# --- the prompt itself
start = s.index("const SYSTEM = `You are writing")
end = s.index("async function continueStory")
new_sys = '''const PREMISE =
  `Torchboy finds himself in a deep dark cave. He knows that his torch can ` +
  `help find secret passages, and that there must be some way to make his ` +
  `torch work better. He has a darkness in his heart that he does not ` +
  `understand, but he knows that he has to get out of this cave and go into ` +
  `the light.`;

const SYSTEM = `You are writing TORCHBOY's story one beat at a time, while it is being played.

THE PREMISE - this is fixed, it is where every telli
… [truncated]
```
<details><summary>result</summary>

```
ok
syntax ok
candidate machinery gone
```
</details>

The written fallback beats need to match the new premise too — let me check what they say:

**`Bash`** — Read fallback beats
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '1,40p' src/game/Narrator.js
```
<details><summary>result</summary>

```
/**
 * Torchboy's story, written while it is being played.
 *
 * Nothing is written up front. Each beat is generated from the chronicle of
 * what he has actually done - how far he has walked with nothing to show for
 * it, that he stood at a cold wall and moved on, which cavern he has climbed
 * into - and from everything already told, so the narrative continues rather
 * than restarts. The model establishes a person and an object early and the
 * continuation rules keep them.
 *
 * Beats are PREFETCHED: the moment one is shown, the next is requested. A beat
 * takes ~3s to write and surfaces every ~40 paces, so the wait never shows.
 */

const MIN_WALK = 34;
const WALK_SPREAD = 26;

// Used when there is no API key, or the network fails. Static, so the story
// stops responding to play - but the game still narrates.
const FALLBACK = [
  'He went down on a Tuesday. Nobody watched him go.',
  'The torch was his mother\'s. She had used it for the same thing, once.',
  'There were doors down here that were not doors until you stood close enough.',
  'He was not lost. Being lost requires somewhere you meant to be.',
  'He thought about the light on the kitchen floor. He kept walking.',
  'Somewhere above, the dark thinned. He climbed toward it because it was the only direction left.',
];
const FALLBACK_REV = [
  { knowledge: 'The stone remembers weight better than it remembers the ones who carried it.',
    response: 'He thinks of how little he weighs, and is not comforted.' },
  { knowledge: 'They were counted going down. There was no arrangement for counting them back.',
    response: 'He remembers whose name was not in the ledger.' },
  { knowledge: 'To seal a door you must first convince yourself there was never a door.',
    response: 'He has been telling himself something for a year. He stops.' },
  { knowledge: 'The names on the lower wall are in one hand. All of them.',
    response: 'He knows that handwriting. He has known it since he was small.' },
];

export class Narrator {
  constructor(hud, chronicle) {
```
</details>

**`Bash`** — Align fallback beats to the premise
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/game/Narrator.js'; s=open(p).read()

old = """ * into - and from everything already told, so the narrative continues rather
 * than restarts. The model establishes a person and an object early and the
 * continuation rules keep them.
"""
new = """ * into - and from everything already told, so the narrative continues rather
 * than restarts. The premise is fixed and authored server-side: the cave, the
 * torch, the darkness in his heart, the light he is climbing toward. No
 * backstory is invented on top of it.
"""
assert old in s, 'MISS 1'; s = s.replace(old, new, 1)

old = """const FALLBACK = [
  'He went down on a Tuesday. Nobody watched him go.',
  'The torch was his mother\\'s. She had used it for the same thing, once.',
  'There were doors down here that were not doors until you stood close enough.',
  'He was not lost. Being lost requires somewhere you meant to be.',
  'He thought about the light on the kitchen floor. He kept walking.',
  'Somewhere above, the dark thinned. He climbed toward it because it was the only direction left.',
];
const FALLBACK_REV = [
  { knowledge: 'The stone remembers weight better than it remembers the ones who carried it.',
    response: 'He thinks of how little he weighs, and is not comforted.' },
  { knowledge: 'They were counted going down. There was no arrangement for counting them back.',
    response: 'He remembers whose name was not in the ledger.' },
  { knowledge: 'To seal a door you must first convince yourself there was never a door.',
    response: 'He has been telling himself something for a year. He stops.' },
  { knowledge: 'The names on the lower wall are in one hand. All of them.',
    response: 'He knows that handwriting. He has known it since he was small.' },
];"""
new = """// These must hold to the same premise the model is given: no relatives, no
// keepsakes, no life above the ground. Only the cave, the torch, the light he
// is climbing toward, and the thing in him he cannot account for.
const FALLBACK = [
  'He did not remember coming down here, and had stopped expecting to.',
  'There were doors in the dark that were not doors until y
… [truncated]
```
<details><summary>result</summary>

```
ok
syntax ok
```
</details>

**`Bash`** — Restart and sample 12 openings
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
pkill -f vite 2>/dev/null; sleep 1; rm -f /tmp/vite-dev.log
(npm run dev >| /tmp/vite-dev.log 2>&1 &) ; sleep 6
lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && echo "up" || tail -5 /tmp/vite-dev.log
sed -i '' 's|localhost:5199|localhost:5173|' /tmp/openings.mjs /tmp/run-story.mjs
node /tmp/openings.mjs
```
<details><summary>result</summary>

```
up
 1. He woke on stone colder than any bed, torch guttering low, and understood only that up meant light and light meant safe—except something in his chest already doubted that.
 2. He woke on stone that ate the warmth from his skin, torch guttering low, and somewhere above him the light he wanted did not yet exist.
 3. Cold stone under him, and the torch already trembling in his fist like it knew something he didn't. Somewhere above, he was sure, there was light—and something in his chest didn't want him to find it.
 4. The cold woke him before the dark did, and the torch in his hand shivered faint gold against stone that swallowed it whole. Somewhere above, he was sure, there was light waiting on him — and something in his chest already dreaded that it might not be.
 5. Cold stone against his back, and the torch already guttering low, as if it had been waiting only for him to open his eyes.
 6. Stone bit through his knees before he even opened his eyes, and the torch in his hand guttered like it was afraid of something he wasn't yet.
 7. Cold stone under him, colder air above, and the torch guttering low as if it too had just woken. Somewhere far up, he was sure, there was light — and something in his chest already dreaded reaching it.
 8. Cold stone under him, and colder still the small ache behind his ribs that had no name; above, somewhere, there had to be light, and his torch trembled toward it.
 9. Cold stone under his hands, and the torch flickering low, as if it too were waiting to remember what it was for.
10. The stone was cold beneath him, and the flame he raised against it burned small, uncertain, like it too was afraid of what waited above him in the dark.
11. He woke to stone and black, torch guttering weak in his hand, and something colder still curled beneath his ribs, waiting.
12. He woke to cold stone and a small flame, and beneath his ribs something older than fear that had no name he knew. Somewhere above, he was sure, there was light.
```
</details>

Premise holds — no relatives, keepsakes, or animals in any of the 12. Openings are necessarily similar now (they all dramatize the same fixed situation), so the variation has to come from the journey. That's the real test:

**`Bash`** — Full playthroughs under the new premise
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='/tmp/run-story.mjs'; s=open(p).read()
old = s[s.index('const SCRIPT = ['):s.index('];', s.index('const SCRIPT = ['))+2]
new = """const SCRIPT = [
  { want: 'beat',       ev: ['he woke on cold stone at the bottom of the dark'], sum: 'the deepest cavern, nothing explored' },
  { want: 'beat',       ev: ['he has walked a long way in the dark and found nothing'], sum: 'the deepest cavern, a third explored' },
  { want: 'revelation', ev: ['he opened a sealed way in the rock'], sum: 'the deepest cavern, half explored' },
  { want: 'beat',       ev: ['he gathered an ember; his torch feels further now', 'he passed a seam of crystal'], sum: 'the deepest cavern, mostly explored' },
  { want: 'revelation', ev: ['he opened the last sealed way in this cavern'], sum: 'the deepest cavern, fully opened' },
  { want: 'beat',       ev: ['he has left nothing in this cavern unopened, and a way further up has opened for him', 'he climbed to the cavern above'], sum: 'the middle cavern, freshly arrived' },
  { want: 'revelation', ev: ['he opened a sealed way', 'he found a cache the old miners left'], sum: 'the middle cavern, half explored' },
  { want: 'beat',       ev: ['he has begun walking over his own footprints'], sum: 'the middle cavern, mostly explored' },
  { want: 'revelation', ev: ['he opened the last sealed way in this cavern'], sum: 'the middle cavern, fully opened' },
  { want: 'beat',       ev: ['he climbed to the highest cavern', 'the air moves here'], sum: 'the highest cavern, near the way out' },
  { want: 'ending',     ev: ['he has left nothing unopened, and the way out of the ground has shown itself'], sum: 'the highest cavern, at the exit' },
];"""
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
node /tmp/run-story.mjs 2>&1 | head -60
```
<details><summary>result</summary>

```
ok

===== RUN 1 =====
         He woke on cold stone with the torch already lit, and something colder already awake inside him, waiting to be named.
         The torch stayed orange and dumb no matter how far he walked, and the cold thing inside him leaned forward, hungrier for the dark than he was for the way out.
  [dark] The cave does not hold miners' bones. It holds what the miners became after the light forgot them.
  [him]  He touches his own chest, suddenly unsure whether he is climbing out of the cave or becoming what it kept.
         The torch reached further now, and what it found further off, he wished it hadn't; the crystal seam pulsed once, like something recognizing him back.
  [dark] The light above does not rescue the kept; it only counts what the dark has finished.
  [him]  He climbs faster now, less toward hope than to outrun what he fears he already is.
         The last sealed way sighed open like a held breath finally let go, and something ancient poured into him already knowing his own name.
  [dark] The cache was never left behind. It was left waiting, the way seed corn waits, for a mouth.
  [him]  He opens the cache and understands the miners weren't buried — they were planted, and he is next.
         His prints in the dust already looked older than his boots, as if something walked here first and only lent him the steps.
  [dark] The surface light is a harvest fire; it burns brightest for what it has already claimed.
  [him]  He keeps climbing, but now each step up feels less like escape and more like arriving on time.
         The moving air smelled of nothing he could name, and the cold in his chest rose to meet it like it already knew the way home.
  [END]  The last way opened onto raw daylight, and he walked toward it because it was the only shape left to want. The torch guttered out in his hand, its work finally done, and the cold in his chest rose up warm to greet the sun as its own. He stepped into the light already harvested.
  -- 30.6s total, 18897 in / 667 out tokens

===== RUN 2 =====
         He woke on stone colder than sleep, torch guttering low, and knew only that up meant light and light meant somewhere the dark in him could not follow.
         His torch stayed dull and orange, dumb as candlelight, and the silence pressed close enough to feel like something waiting to be asked.
  [dark] The dark does not fill empty places. It is what remains when a light is unmade.
  [him]  He flinches, feeling his own shadow lean toward the torch like it remembers being flame.
         The torch drank the ember and reached fur
… [truncated]
```
</details>

Strong result — the darkness in his heart is now the actual spine: each revelation explains a bit more of it (the dark was *fed*; payment was a child with a light; the miners dug rooms to keep it sleeping; the light above hungers too), and the endings pay it off. No relatives, keepsakes, or animals anywhere. Let me check beat lengths against the HUD, since several looked long:

**`Bash`** — Measure output length compliance
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > /tmp/lens.mjs <<'EOF'
const URL='http://localhost:5173/api/story/next';
const mk=(want,told,ev)=>fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({want,told,events:ev,summary:'the deepest cavern, half explored'})}).then(r=>r.json());
const told=[{kind:'beat',text:'He woke on cold stone with the torch already lit, and something colder already awake inside him.'}];
const beats=await Promise.all(Array.from({length:10},()=>mk('beat',told,['he has walked a long way in the dark and found nothing'])));
const revs =await Promise.all(Array.from({length:6},()=>mk('revelation',told,['he opened a sealed way in the rock'])));
const L=s=>s.length;
const bl=beats.map(b=>L(b.text)).sort((a,b)=>a-b);
console.log('beats  n=10  min',bl[0],'median',bl[5],'max',bl[9],' over 170:',bl.filter(x=>x>170).length);
const kl=revs.map(r=>L(r.knowledge)).sort((a,b)=>a-b), rl=revs.map(r=>L(r.response)).sort((a,b)=>a-b);
console.log('knowledge max',kl[kl.length-1],' over 120:',kl.filter(x=>x>120).length);
console.log('response  max',rl[rl.length-1],' over 120:',rl.filter(x=>x>120).length);
EOF
node /tmp/lens.mjs
```
<details><summary>result</summary>

```
beats  n=10  min 90 median 131 max 152  over 170: 0
knowledge max 114  over 120: 0
response  max 100  over 120: 0
```
</details>

**`Bash`** — Measure opening beat lengths
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > /tmp/openlen.mjs <<'EOF'
const URL='http://localhost:5173/api/story/next';
const one=()=>fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({want:'beat',told:[],events:['he woke on cold stone at the bottom of the dark'],summary:'the deepest cavern, nothing explored'})}).then(r=>r.json()).then(d=>d.text.length);
const l=(await Promise.all(Array.from({length:10},one))).sort((a,b)=>a-b);
console.log('opening beats:',l.join(', '));
console.log('over 170:',l.filter(x=>x>170).length,'of 10');
EOF
node /tmp/openlen.mjs
```
<details><summary>result</summary>

```
opening beats: 106, 124, 132, 135, 136, 137, 139, 143, 144, 150
over 170: 0 of 10
```
</details>

All within limits. Quick check that it's live in the game itself, then build:

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
- [Snapshot](.playwright-mcp/page-2026-09-06T19-13-41-184Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-06T19-13-40-887Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
() => new Promise((res) => {
  const t0 = Date.now();
  const tick = () => {
    const g = window.__game;
    if (g && g.narrator && (g.narrator.pending.beat || g.narrator.told.length)) {
      return res({ live: g.narrator.live, ready: g.narrator.ready,
                   firstBeat: g.narrator.pending.beat || g.narrator.told[0]?.text,
                   waitedMs: Date.now() - t0 });
    }
    if (Date.now() - t0 > 60000) return res({ error: 'timeout', live: g?.narrator?.live });
    setTimeout(tick, 400);
  };
  tick();
})
```
<details><summary>result</summary>

```
### Result
{
  "live": true,
  "ready": true,
  "firstBeat": "He woke to black stone and colder black inside him, the torch guttering weak in his fist, and somewhere above, he knew, there was light waiting.",
  "waitedMs": 0
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise((res) => {\n  const t0 = Date.now();\n  const tick = () => {\n    const g = window.__game;\n    if (g && g.narrator && (g.narrator.pending.beat || g.narrator.told.length)) {\n      return res({ live: g.narrator.live, ready: g.narrator.ready,\n                   firstBeat: g.narrator.pending.beat || g.narrator.told[0]?.text,\n                   waitedMs: Date.now() - t0 });\n    }\n    if (Date.now() - t0 > 60000) return res({ error: \'timeout\', live: g?.narrator?.live });\n    setTimeout(tick, 400);\n  };\n  tick();\n})');
``​`
```
</details>

**`Bash`** — Build and scan for stale backstory nouns
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
npx vite build 2>&1 | grep -E "built|error" | tail -2
grep -rlE "sk-ant|wrkspc_" dist/ 2>/dev/null && echo "!!! LEAK !!!" || echo "dist clean"
echo "=== forbidden nouns anywhere in shipped story code ==="
grep -rniE "whistle|ledger|uncle|mother's|kitchen" src/ tools/ | grep -v "^Binary" || echo "none"
```
<details><summary>result</summary>

```
✓ built in 747ms
dist clean
=== forbidden nouns anywhere in shipped story code ===
none
```
</details>

Your premise is now the fixed starting point, and the invention machinery is gone. Running at **http://localhost:5173/**.

**What changed**

Your text is the authored `PREMISE` in the system prompt — the cave, the torch, the sense that it can be made to work better, the unexplained darkness in his heart, the light he has to reach. The model treats it as the only thing already true.

Then an explicit prohibition, because the backstory-invention was structural, not accidental: **no family, no person he lost, no companion, no animal, no keepsake or trinket, no job he was sent to do, no life above ground.** He doesn't remember getting there and nobody is with him. I also deleted the two rules that were causing it — "name a person and keep them" and "give him a carried object and keep it" — which is what kept manufacturing tin whistles and dead uncles. The six-candidate enumeration and the random index are gone; the premise does that job now.

In their place, the story is built from three things and nothing else: the darkness in his heart (unexplained at the start, and what the whole story is slowly uncovering), what he actually does and sees in the cave, and the ancient knowledge that enters him. I also told it the embers *are* the way of making the torch work better that he suspects exists — that's his hunch from your premise paying off in mechanics.

The written fallback beats (used when the API is unreachable) contradicted all of this — "the torch was his mother's", "the light on the kitchen floor", "he knows that handwriting" — so those were rewritten to the same premise.

**How it reads now.** Three full playthroughs, and the darkness in his chest is the actual spine. The revelations compound instead of free-associating: the dark was *fed*, once → payment was always a child sent down with a light → the miners weren't digging for ore, they dug rooms to keep it sleeping → the light above hungers too, and calls the fed ones home. Endings pay it off — *"he was not escaping the dark at all — he was its way of finally reaching the surface."* The chronicle shows through: gathering an ember becomes the torch reaching further than a boy should see, his own footprints become the hunger steering his feet.

Verified: 0 of 10 openings and 0 of 10 beats exceed the length limits, no forbidden nouns in any sample, first beat arrives live in-game, build clean, no key material in `dist/`.

**One honest note.** With a fixed premise the openings are now necessarily similar to each other — they all dramatize the same moment — and the three runs converged on a related shape (he's implicated in what the cave did; the light may not be a rescue). That's the trade you get for a premise that holds: variation moved from *setup* to *what the cave turns out to mean*. If you'd rather the endings diverge more, the lever is the revelation prompt rather than the premise.


---
[← 18-ok-let-s-work-on-the.md](18-ok-let-s-work-on-the.md)  ·  [index](README.md)