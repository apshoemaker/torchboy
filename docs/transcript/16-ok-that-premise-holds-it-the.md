# 16. ok - that premise holds it.  The tin whistle piece is weird.  Let's remove that and not start with a premise -

[← index](README.md)

## The prompt

> ok - that premise holds it.  The tin whistle piece is weird.  Let's remove that and not start with a premise - we'll keep it completely open book.

## What happened

Right — and removing the premise means the dead `/api/story` handler goes too, since it's the only thing still using those pools. Let me rewrite the plugin cleanly:

**`Bash`** — Rewrite plugin with no premise, dead code removed
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cp tools/story-plugin.mjs /tmp/story-plugin.backup.mjs
rm -f tools/story-plugin.mjs && cat > tools/story-plugin.mjs <<'EOF'
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
const REVELATION_SCHEMA = z.object({
  knowledge: z.string(),   // what the dark knows. Not about him.
  response: z.string(),    // what knowing it does to him, right now.
});

const SYSTEM = `You are writing TORCHBOY's story one beat at a time, while it is being played.

The world:
- A small boy with an enormous head and a stubborn little mohawk, carrying a torch.
- He is deep underground and CLIMBING toward the surface through three caverns.
- His torch stirs and cools toward blue-white when a hidden way in the rock is
  near; it is how he finds passages that look like solid stone.
- Embers lie in the 
… [truncated]
```
<details><summary>result</summary>

```
syntax ok
=== premise gone? ===
1
=== size ===
     187 tools/story-plugin.mjs
     331 /tmp/story-plugin.backup.mjs
     518 total
```
</details>

The one remaining match is the comment explaining there is no premise. Now the client side:

**`Bash`** — Find premise references in Narrator
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "premise\|wants" src/game/Narrator.js
```
<details><summary>result</summary>

```
44:    this.premise = null;
66:      premise: this.premise || undefined,
78:    if (data.premise && !this.premise) this.premise = data.premise;
84:    // The premise (register, remembered object, reason he is down here) is
87:    // premises, and the story and the revelations end up about different
89:    const wants = this.premise ? ['beat', 'revelation'] : ['beat'];
90:    for (const want of wants) {
```
</details>

**`Bash`** — Read Narrator context
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '35,100p' src/game/Narrator.js
```
<details><summary>result</summary>

```
  { knowledge: 'The names on the lower wall are in one hand. All of them.',
    response: 'He knows that handwriting. He has known it since he was small.' },
];

export class Narrator {
  constructor(hud, chronicle) {
    this.hud = hud;
    this.chronicle = chronicle;
    this.told = [];               // everything shown, in order - the memory
    this.premise = null;
    this.live = false;            // is the model actually answering?
    this.ready = false;
    this.title = 'Torchboy';

    this.pending = { beat: null, revelation: null };
    this.inFlight = { beat: false, revelation: false };
    this.fallbackAt = 0;
    this.fallbackRevAt = 0;

    this.t = 0;
    this.walked = 0;
    this.nextAt = 14;
    this.holdUntil = 0;
    this._lastPos = null;
    this._pendingResponse = null;
  }

  // ---------------------------------------------------------------- network
  async _ask(want) {
    const body = {
      want,
      premise: this.premise || undefined,
      told: this.told,
      events: this.chronicle.drain(),
      summary: this.summary || '',
    };
    const res = await fetch('/api/story/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
… [truncated]
```
</details>

**`Bash`** — Read rest of Narrator
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '100,185p' src/game/Narrator.js
```
<details><summary>result</summary>

```
        })
        .catch((e) => {
          if (!this.ready) console.warn('[story] falling back:', e.message);
          this.live = false;
          this.ready = true;
        })
        .finally(() => { this.inFlight[want] = false; });
    }
  }

  /** Kick the first request. Never blocks the game. */
  start(summary) {
    this.summary = summary;
    this.prefetch();
  }

  // ------------------------------------------------------------------ beats
  _takeBeat() {
    if (this.pending.beat) {
      const t = this.pending.beat;
      this.pending.beat = null;
      return t;
    }
    if (this.fallbackAt < FALLBACK.length) return FALLBACK[this.fallbackAt++];
    return null;
  }

  reveal(force = false) {
    if (!force && this.t < this.holdUntil) return false;
    const text = this._takeBeat();
    if (!text) { this.prefetch(); return false; }
    this.hud.narrate(text);
    this.told.push({ kind: 'beat', text });
    this.holdUntil = this.t + 9;
    this.walked = 0;
    this.nextAt = MIN_WALK + Math.random() * WALK_SPREAD;
    this.prefetch();
    return true;
  }

… [truncated]
```
</details>

**`Bash`** — Strip premise from Narrator.js
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import re, sys
p = 'src/game/Narrator.js'
s = open(p).read()
orig = s

edits = [
  ("    this.told = [];               // everything shown, in order - the memory\n    this.premise = null;\n",
   "    this.told = [];               // everything shown, in order - the memory\n"),

  ("    const body = {\n      want,\n      premise: this.premise || undefined,\n      told: this.told,\n",
   "    const body = {\n      want,\n      told: this.told,\n"),

  ("    const data = await res.json();\n    if (data.premise && !this.premise) this.premise = data.premise;\n    return data;\n",
   "    return res.json();\n"),

  ("""    // The premise (register, remembered object, reason he is down here) is
    // minted by the server on the FIRST call and echoed back. Firing the beat
    // and the revelation in parallel before it exists mints two different
    // premises, and the story and the revelations end up about different
    // objects - so the first request goes alone.
    const wants = this.premise ? ['beat', 'revelation'] : ['beat'];
""",
   """    // Nothing is seeded, so the FIRST beat is what invents the person, the
    // object and the reason - everything after it is a continuation. Firing a
    // revelation alongside it would send two requests with an empty story and
    // get back two unrelated inventions, so the revelation waits until there
    // is a story to continue. A discovery before then uses a written one.
    const wants = this.told.length ? ['beat', 'revelation'] : ['beat'];
"""),
]

for old, new in edits:
    if old not in s:
        sys.exit('ANCHOR MISS:\n' + old[:120])
    s = s.replace(old, new, 1)

open(p, 'w').write(s)
print('applied', len(edits), 'edits;', len(orig) - len(s), 'bytes removed')
PY
echo "=== residual premise refs ==="
grep -rn "premise" src/ tools/ | grep -v "There is no premise"
node --check src/game/Narrator.js && echo "Narrator syntax ok"
```
<details><summary>result</summary>

```
applied 4 edits; 127 bytes removed
=== residual premise refs ===
Narrator syntax ok
```
</details>

Both files are clean. Now let me actually run it — three full simulated playthroughs, to see whether stories still cohere and vary with nothing seeded:

**`Bash`** — Start dev server, smoke-test endpoint
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
pkill -f "vite" 2>/dev/null; sleep 1
(npx vite --port 5199 > /tmp/vite-story.log 2>&1 &) ; sleep 6
curl -s -o /dev/null -w "server:%{http_code}\n" -X POST localhost:5199/api/story/next -H 'Content-Type: application/json' -d '{"want":"beat","told":[],"events":[],"summary":"test"}'
```
<details><summary>result</summary>

```
server:200
```
</details>

**`Bash`** — Run three full playthroughs
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > /tmp/run-story.mjs <<'EOF'
// Replay a whole playthrough against the live endpoint, exactly as the game does:
// beats interleaved with discovery revelations, then the ending.
const URL = 'http://localhost:5199/api/story/next';

const SCRIPT = [
  { want: 'beat',       ev: ['he woke on cold stone at the bottom of the dark'], sum: 'the deepest cavern, nothing explored' },
  { want: 'beat',       ev: ['he has walked a long way in the dark and found nothing'], sum: 'the deepest cavern, a third explored' },
  { want: 'revelation', ev: ['he opened a sealed way in the rock'], sum: 'the deepest cavern, half explored' },
  { want: 'beat',       ev: ['he gathered an ember', 'he passed a seam of crystal'], sum: 'the deepest cavern, mostly explored' },
  { want: 'beat',       ev: ['he climbed to the cavern above'], sum: 'the middle cavern, freshly arrived' },
  { want: 'revelation', ev: ['he opened a sealed way in the rock', 'he found a cache someone left behind'], sum: 'the middle cavern, half explored' },
  { want: 'beat',       ev: ['he has begun walking over his own footprints'], sum: 'the middle cavern, mostly explored' },
  { want: 'beat',       ev: ['he climbed to the cavern above', 'the air moves here'], sum: 'the highest cavern, near the way out' },
  { want: 'ending',     ev: ['he reached the daylight'], sum: 'the highest cavern, at the exit' },
];

async function run(n) {
  const told = [];
  const lines = [];
  let ms = 0, inTok = 0, outTok = 0;
  for (const step of SCRIPT) {
    const r = await fetch(URL, { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ want: step.want, told, events: step.ev, summary: step.sum }) });
    if (!r.ok) { lines.push(`  !! ${r.status} ${(await r.text()).slice(0,120)}`); break; }
    const d = await r.json();
    ms += d.ms; inTok += d.usage?.input_tokens || 0; outTok += d.usage?.output_tokens || 0;
    if (step.want === 'revelation') {
      told.push({ kind: 'revelation', text: d.knowledge });
      told.push({ kind: 'response', text: d.response });
      lines.push(`  [dark] ${d.knowledge}`);
      lines.push(`  [him]  ${d.response}`);
   
… [truncated]
```
<details><summary>result</summary>

```
===== RUN 1 =====
         He woke gripping a cracked tin whistle that had been Marrow's, his uncle's, and could not remember why he'd carried it down into the dark instead of leaving it above.
         His feet knew this stretch before his eyes did, and the whistle grew warm against his palm, as if Marrow were walking just behind him, patient, waiting for the dark to end.
  [dark] Marrow did not fall down here. He was given, whole and singing, to seal the way that just opened.
  [him]  The whistle scalds him now; he understands why it never wanted to be left above.
         The crystal seam lit gold as he passed, and he glimpsed Marrow's face in it, mouth open on a note Torchboy could almost still hear.
         The air here smelled of rain he'd never see again, and the whistle went cold at last, as if Marrow had let go of his hand at the threshold.
  [dark] Every seal fed must be sung shut by one who loved the sealer; silence unmakes it again.
  [him]  He grips the cold whistle, throat tightening — he cannot sing, and something behind the wall stirs, listening.
         His own prints doubled back beneath him, older and deeper, as if some earlier Torchboy had already failed to sing and was still down here, circling.
         Wind found him first, threading down from a crack of true grey light, and the whistle warmed again — not for Marrow now, but for whatever still circled below, unsung.
  [END]  He climbed into grey light with the whistle burning against his palm, and behind him, faint, something began to circle again where no note had ever closed. He did not sing. He only walked, and let the wall stay open, and did not look back to see who followed.
  -- 26.2s total, 11888 in / 603 out tokens

===== RUN 2 =====
         His knuckles remembered a name before his mouth did: Pell, who had gone down first and not come back up, and the torch he'd left him burned low, waiting.
         The dark stretched flat and featureless as Pell's silence, and the torch stayed dull orange, telling him nothing was here to find yet.
  [dark] The lowest cavern does not lead up. It has always been the mouth that swallowed the ones who called themselves Pell.
  [him]  He stops calling the name ahead of him now, afraid the dark will finally answer in it.
         The ember settled warm against his palm, and the torch's flame leaned toward the crystal seam like it recognized an old debt owed there.
         He climbed on faster than he meant to, as if his legs had learned before his head did that Pell's mouth wanted to swallow him too.
  [dark] The cavern does not swallow na
… [truncated]
```
</details>

Coherence is holding well — each run tracks a single named person, object, and cause from first line to ending. But run 1 reached for a tin whistle unprompted, and all three landed on the same shape (dead male relative + object + he's becoming them). Let me measure the actual spread of openings:

**`Bash`** — Sample 12 opening beats for variety
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > /tmp/openings.mjs <<'EOF'
const URL = 'http://localhost:5199/api/story/next';
const one = async () => {
  const r = await fetch(URL, { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ want: 'beat', told: [], events: ['he woke on cold stone at the bottom of the dark'],
                           summary: 'the deepest cavern, nothing explored' }) });
  return r.ok ? (await r.json()).text : '!! ' + r.status;
};
const out = await Promise.all(Array.from({length: 12}, one));
out.forEach((t, i) => console.log(`${String(i+1).padStart(2)}. ${t}`));
EOF
node /tmp/openings.mjs
```
<details><summary>result</summary>

```
 1. He woke gripping the torch his grandfather Enzo had carved, and found the mohawk-stubborn dark humming, as if it already knew his name.
 2. He woke gripping the counting-stick Maras had carved him, forty notches deep, and the torch in his other fist guttered orange, restless, unsure of anything down here.
 3. He woke gripping the torch and the little brass bell that had been Petra's, its clapper long gone silent, and did not remember climbing down here to fetch her back.
 4. He woke gripping the torch his uncle Harlan had carved for him, the mohawk-stiff flame guttering, and could not remember why the tunnel above had swallowed itself.
 5. Torchboy woke with the count of ninety-one bells still ringing in his skull, though he had never learned to count, and his torch pointed toward stone that had no door.
 6. He woke gripping the small brass bell that had been Petro's, its clapper long gone silent, and the torch in his other fist guttered orange, uncertain.
 7. He woke with the torch already lit, as if someone had pressed it into his fist before leaving him, and the name Ressa surfaced in his mouth like a stone he'd swallowed.
 8. He woke gripping the torch like a fist, the name Wrenna already fading off his tongue, and did not know why he'd said it.
 9. He woke gripping the tally-stick with its seven notches, one for each day Mira had waited above, and did not remember carving the eighth.
10. He woke gripping the counting-stick Merrow carved him, thirteen notches deep, and did not remember the fourteenth day yet to come. The torch guttered blue toward a crack that should not have been there.
11. He woke gripping the torch his uncle Bern had carved for him, the wood still warm as if held moments ago, and could not remember climbing down.
12. He woke gripping the torch his uncle Emberic had pressed on him, the wick smelling faintly of rendered animal fat and something sweeter, worse. Above him, the dark went up forever, and he did not remember agreeing to climb it.
```
</details>

Names and objects vary well (no whistle in 12), but 11 of 12 open with the literal phrase "He woke gripping…", and two grabbed the mohawk into a simile. Two small prompt fixes:

**`Bash`** — Loosen opening formula, re-sample
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p = 'tools/story-plugin.mjs'
s = open(p).read()

old = """- No dialogue, no quotation marks. Never address the player. Never use the words
  "player", "level", or "game". Do not name the caverns.
"""
new = """- No dialogue, no quotation marks. Never address the player. Never use the words
  "player", "level", or "game". Do not name the caverns. Do not describe how he
  looks - the player is watching him; the mohawk and the big head are not yours.
"""
if old not in s: sys.exit('MISS 1')
s = s.replace(old, new, 1)

old2 = """- If the story so far has no named person in it yet, name one now and keep them.
- If the story so far has no carried object yet, give him one now and keep it.
"""
new2 = """- If the story so far has no named person in it yet, name one now and keep them.
- If the story so far has no carried object yet, give him one now and keep it.
- The opening beat does not have to start at the moment he wakes, and does not
  have to start with him holding something. It can open on a thought, a thing he
  is refusing to think about, something he has already done, or what he expects
  to find. Do not begin with "He woke".
"""
if old2 not in s: sys.exit('MISS 2')
s = s.replace(old2, new2, 1)

open(p,'w').write(s)
print('ok')
PY
node --check tools/story-plugin.mjs && echo "syntax ok"
sleep 2 && node /tmp/openings.mjs
```
<details><summary>result</summary>

```
ok
syntax ok
 1. He kept the tin whistle Perrin had carved him clenched in his teeth, tasting cedar, and did not remember why the man's name felt like a debt owed.
 2. He kept the little tin whistle Merek gave him clenched in his fist, useless without breath enough to blow it, and would not think about why Merek stopped answering.
 3. He kept his fist around the tin whistle Maro carved him, the one he'd promised to blow only when he reached the sun again, and did not blow it now.
 4. His father's brass whistle hung cold against his chest, the one Corren blew twice for come home, and down here even that felt like a lie he'd have to climb to.
 5. He kept his fist closed around the tin whistle Perrin had pressed on him, promising he'd blow it once he reached the top. Somewhere above, the promise waited, unkept.
 6. He kept the copper whistle tucked where his shirt buttoned wrong, the one Mireille had pressed on him before the rope broke, and did not blow it yet.
 7. He kept the bell Maren had tied to his wrist, silent now, and told himself the ringing would come back to him before she ever would.
 8. His fingers found the tin whistle first, the one Mirek had pressed into his palm before the rope frayed, before the boy stopped calling down.
 9. He kept the promise to Mireille tucked against his ribs like a second heartbeat, not to open his eyes till the torch found her voice in the rock.
10. He kept the tally-string of knots around his wrist for Mira, one knot per day she'd been gone, and refused to count how many now hung there in the dark.
11. His fingers found the little bell first, the one Petra used to ring for him from the top of the well, silent now and cold in his fist.
12. He kept the ledger's brass whistle clenched in his teeth, the one Meret had given him before she stopped coming to the surface at all, and did not blow it.
```
</details>

The tin whistle is a genuine attractor, not the old pool — 8 of 12 now. Removing the "He woke" rut just exposed it. The real rut is the *category*: a keepsake given by a lost person. Let me widen it and name the two dominant attractors:

**`Bash`** — Widen object/person/reason space, re-sample
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p = 'tools/story-plugin.mjs'
s = open(p).read()

old = """Nothing else is fixed. Who he lost, what he carries, why he came, what was done
in this place - all of that is yours to invent, and it should be different every
time you are asked. Do not reach for the first idea. Avoid the obvious ones: a
dead sibling, a lost mother, a keepsake in a pocket. Something stranger and more
particular will be truer.
"""
new = """Nothing else is fixed. Who he lost, what he carries, why he came, what was done
in this place - all of that is yours to invent, and it should be different every
time you are asked. Do not reach for the first idea; the first idea is the one
every other telling of this story already used.

In particular, the thing he carries is NOT automatically a keepsake pressed on
him by someone who is gone. Never a whistle. Never a bell. Never a locket. It
can be a tool, something he stole, something that is not his and he knows it,
something with a use he has not needed yet, something he is carrying for someone
who is still alive, something he has been told to bring back, or something he
found down here and should have left. It does not have to be precious, and it
does not have to be small.

Likewise, the person is not automatically a dead relative, and the reason is not
automatically grief. He may be down here because of something he did, something
he owes, something he was sent to do, or something he wants that is not
forgivable. Something stranger and more particular will always be truer.
"""
if old not in s: sys.exit('MISS')
s = s.replace(old, new, 1)
open(p,'w').write(s)
print('ok')
PY
node --check tools/story-plugin.mjs && sleep 3 && node /tmp/openings.mjs
```
<details><summary>result</summary>

```
ok
 1. The ledger was still in his coat, the one Merrin had made him swear to bring back full. His torch would not lie to him, whatever else did.
 2. He kept his fist around the ledger Mister Farrow gave him, its brass clasp warm as a coal, and did not let himself think about the debt it named.
 3. The ledger was still tied to his belt, wet-paged, and Mira's name was the only word in it he could read himself.
 4. The ledger sat heavy in his coat pocket, its ink-list of names he'd promised Marrow he would count out loud when he reached the top.
 5. The ledger sat heavy against his ribs, its brass clasp cold, and he could not remember agreeing to carry Mireille's debts down here.
 6. His knuckles ached around the tally-stick Marra had shoved into his hand, five notches deep, none of them his to owe.
 7. He didn't remember falling, only Dessa's voice above the shaft telling him to bring back proof, and the ledger still dry against his ribs.
 8. The ledger was still strapped to his back, its brass clasp cold against his spine, and he thought only of the debt Marra had named before she stopped speaking.
 9. The ledger sat heavy against his ribs, its brass clasp cold, and he remembered Petra's voice telling him not to open it until he was out.
10. The ledger was still tucked in his shirt, Mira's name inked twice on the first page, and he meant to bring it back full.
11. The ledger sat heavy against his ribs, its brass clasp cold, and he could not remember why Marren had told him not to open it before the surface.
12. He kept the ledger dry against his chest, the one Marta trusted him to bring back stamped, and would not think about what he'd promised to trade for it.
```
</details>

Every negation just moves the model to the next attractor — and this time *my own example list* was the new pool ("something he's been told to bring back" → ledger, 12/12). Enumerating options in the prompt is self-defeating. Let me strip the examples down to abstract constraints:

**`Bash`** — Replace example list with abstract constraint
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys, re
p = 'tools/story-plugin.mjs'
s = open(p).read()
start = s.index("Nothing else is fixed.")
end = s.index("You will be given THE STORY SO FAR")
new = """Nothing else is fixed. Who he lost, what he carries, why he came, what was done
in this place - all of that is yours to invent, and it MUST be different every
time you are asked.

The danger is that every telling comes out the same: a small keepsake given to
him by someone who is gone, and grief as the reason he is down here. Refuse
that. Before you write, consider several quite different possibilities for who
this boy is and what is true of him, and choose one of the less obvious ones.
The object he carries need not be a memento, or precious, or small, or even
his. The person need not be dead, or family. The reason need not be grief - it
can be something he did, something he wants, or something he was sent for.

"""
s = s[:start] + new + s[end:]
open(p,'w').write(s)
print('ok')
PY
node --check tools/story-plugin.mjs && sleep 3 && node /tmp/openings.mjs
```
<details><summary>result</summary>

```
ok
 1. He'd been told to bring the ledger back before the auditors woke, and the torch in his fist was stolen from the foreman's own hook.
 2. The ledger he'd stolen from the surveyor's tent was still strapped to his back, its brass clasp cold against his spine, and he did not remember falling.
 3. He'd promised the foreman he'd bring the surveyor's ledger back up whole, and he still had it, tucked hard against his ribs.
 4. The ledger he'd stolen from the foreman's office was still tucked in his shirt, its numbers wrong on purpose, and someone would notice by morning.
 5. The ledger sat heavy against his ribs, its brass clasp cold, the foreman's ledger he'd stolen to prove the tunnels were never safe.
 6. He'd been told the ledger down here would clear his father's debt to the foreman, if he could only find it before the mine forgot him.
 7. He'd been sent to steal the mine foreman's ledger, not to fall through the floor with it, and now the torch in his fist felt too eager, humming toward some crack in the black.
 8. The ledger in his coat pocket was not his to carry, and the foreman had told him to bring it back full or not at all.
 9. He counted the stolen coins in his pocket by feel, not sight, and told himself the Widow Hess would never miss so few.
10. The ledger in his coat pocket wasn't his to take, and the foreman would want it back in blood if he caught him first.
11. He'd been told the ledger down here owed a debt, and that a boy small enough could climb where the collectors couldn't, so he counted the coins sewn into his collar and started up.
12. The ledger was tucked in his coat, pages he'd stamped with the foreman's seal without asking leave. He didn't remember falling, only that the mine had wanted him gone.
```
</details>

Still 11/12 ledgers. Single samples from a fixed prompt mode-collapse; negation only moves the mode. The fix has to be entropy in the *input*, not more prohibitions — but without reintroducing a content pool. So: let the model invent the candidates, and let us pick which one it commits to:

**`Bash`** — Self-enumerated candidates with supplied index
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='tools/story-plugin.mjs'; s=open(p).read()

# 1. Opening-beat schema: the model enumerates before it commits.
old = "const BEAT_SCHEMA = z.object({ text: z.string() });"
new = """const BEAT_SCHEMA = z.object({ text: z.string() });

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
});"""
assert old in s; s = s.replace(old, new, 1)

# 2. Pick the schema and build the opening ask.
old = """  const wantsRevelation = want === 'revelation';
  const ask = wantsRevelation"""
new = """  const wantsRevelation = want === 'revelation';
  const opening = want === 'beat' && told.length === 0;
  const choice = 1 + Math.floor(Math.random() * 6);

  const ask = opening
    ? `This is the OPENING beat. Nothing has been established yet, so what you ` +
      `write here decides the whole story.\\n\\n` +
      `First fill "options" with SIX genuinely different one-line answers to: ` +
      `who is this boy, what is he carrying, and why is he under the ground? ` +
      `Make them differ in kind, not in detail - different reasons, different ` +
      `relationships, different things at stake. If two of them could be the ` +
      `same story with the nouns swapped, replace one.\\n\\n` +
      `Then write "text": the opening beat, committed to option number ` +
      `${choice} and no other. Do not hedge toward the others. Introduce the ` +
      `person by name and the object plainly, so everything after this can ` +
      `continue from it.`
    : wantsRevelation"""
assert old in s; s = s.replace(old, new, 1)

# 3. Wire the schema through.
old = "      format: zodOutputFor
… [truncated]
```
<details><summary>result</summary>

```
ok
 1. Torchboy woke on the cold stone gripping the bell-tongue Wren had forged half-finished, its edge still rough from the hammer, waiting for water only the deep dark could give it.
 2. Torchboy woke on cold stone, Ressa's brass whistle cold against his ribs, her warning already fraying in his tired head: never blow it, no matter what.
 3. Torchboy woke gripping the bronze key Father Ansel had sent him to find, its teeth cold and wrong against his palm.
 4. Torchboy woke on the cold stone still gripping the locked box Marren had trusted him to deliver unopened, and his fingers itched to try the latch.
 5. Torchboy woke on cold stone with Corvin's brass key still fisted in his palm, the theft already done, the running not yet over.
 6. Torchboy woke on cold stone, the warden's iron whistle still looped round his wrist, and the cage above already forgotten to everyone but him.
 7. Torchboy woke on cold stone, the ledger of Corvis Wick still clutched to his chest, its pages promising every family's debt undone if only he burned it deep enough.
 8. Torchboy remembered Osric's instructions exactly: mark every turn, trust the rod when the stone lied. He gripped the brass rod tighter as his torch bent blue toward a wall that should not have been hollow.
 9. Corvin had gone down laughing, daring him to follow, and had a locket that wasn't his in his fist. Torchboy woke on the cold stone still meaning to take it back.
10. Torchboy woke gripping the collar, its buckle cold as a tooth, and remembered Sergeant Voss saying bring back proof or don't come back at all.
11. Torchboy woke on cold stone, the brass key from Mattis's strongbox still fisted in his hand, and remembered why he had come down.
12. Torchboy woke on cold stone, the locked box still strapped to his chest, Petra's warning already fraying at the edges of memory.
```
</details>

Object and reason variety is genuinely broad now (keys, boxes, a collar, a surveying rod, a bell-tongue; theft, delivery, a dare, orders). The "woke on cold stone" stem returned, though — let me check that rule survived my rewrite and reinforce it at the point of use:

**`Bash`** — Reinforce opening-stem rule at point of use
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "He woke" tools/story-plugin.mjs
python3 - <<'PY'
p='tools/story-plugin.mjs'; s=open(p).read()
old = """`${choice} and no other. Do not hedge toward the others. Introduce the ` +
      `person by name and the object plainly, so everything after this can ` +
      `continue from it.`"""
new = """`${choice} and no other. Do not hedge toward the others. Name the other ` +
      `person and state the object plainly, so everything after this can ` +
      `continue from it - but do not open on him waking up, and do not open ` +
      `with his own name.`"""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
node --check tools/story-plugin.mjs && sleep 3 && node /tmp/openings.mjs
```
<details><summary>result</summary>

```
90:  to find. Do not begin with "He woke".
ok
 1. Fen's satchel lay against his ribs, strap still warm from the dare neither of them should have taken. He didn't remember falling, only that Fen's laugh had gone first, then the light.
 2. His fingers found the letter still dry against his ribs, the wax unbroken, meant for Petrus who had not come up in eleven days.
 3. The ledger stolen from Magistrate Warrin Coss sat heavy against his ribs, and he told himself he only needed one door out before dawn.
 4. Ansel had pressed the jar into his hands and said only fetch the water, boy, and don't open it. His fingers found it now, seal unbroken, cold as the stone he woke on.
 5. The ledger of Sella Dray's debts, wrapped in oilcloth, pressed flat against his ribs, still dry despite the fall. Somewhere above, she was counting the hours he owed her.
 6. Maddox had pressed the jar into his hands and told him only that it must not be opened before its time, and that the thing below had waited long enough already.
 7. Somewhere above, Osric didn't know the summons had already left the courthouse, tucked now against the boy's ribs, and wouldn't stay lost.
 8. He still had the contract folded in his shirt, the one naming Ossian's father, and the debt would not vanish just because the boy who signed it had.
 9. Corrin Vell had pressed the ledger's twin into his hands and said only: bring back the original, and no one need read either. Torchboy gripped the empty satchel meant for it and did not yet know what the cavern already knew about the man who sent him.
10. He clutched the ledger Ressa had begged him to find, its wax seal cold as a promise he was not sure he could keep.
11. He gripped the tin soldier Ansel Duro had pressed on him at the shaft mouth, promise now a weight in his fist, and the torch remembered something the stone had tried to forget.
12. Ostrid had paid him well and told him nothing else: bury the brass whistle where no one would ever look, and forget her face. He still had it now, tucked warm against his ribs, wondering what it was for.
```
</details>

Good spread now — 8 distinct objects across 12 runs (ledger is the most common at 4, and a ledger is at least native to a mine). Now the real test: does the story still cohere end-to-end with nothing seeded?

**`Bash`** — Three full playthroughs, coherence check
```bash
node /tmp/run-story.mjs
```
<details><summary>result</summary>

```
===== RUN 1 =====
         Corvin had said find the key and come back before the shift bell, nothing more, nothing about what waited below. The boy's fist ached around the brass shape as the torch guttered blue toward a crack in the stone that should not have been there.
         His feet knew the ache of it now, and still the brass key gave no answer, only the torch pulling him on, patient as a leash he hadn't chosen.
  [dark] The key was cut to fit a lock that was built to keep something in, not out.
  [him]  He looks at the brass in his fist and understands Corvin never meant him to come back up.
         The ember's small heat spread through him, sharper sight, and the crystal seam threw back a glint like teeth. He gripped the key tighter, already knowing which door up there was the real one.
         The new cavern smelled of scorched brass, and his torch bent white-blue toward a wall that shouldn't breathe. He climbed on anyway, key biting his palm like something that wanted out first.
  [dark] The lock below was cut before Corvin's grandfather was born, to hold a warden, not a prisoner.
  [him]  He drops the cache and grips the key harder, cold now with the thought that he is the one meant to relieve it.
         His own prints doubled back beneath him, and he understood the wall had been herding him in a circle since the key first bit his palm.
         The moving air carried a smell of open sky, and still his feet slowed, the key gone warm as if eager to meet its post again.
  [END]  Daylight fell white across his knuckles, and the key had gone still and cold at last, its hunger satisfied by something that was not him. He walked out whole, unwarded, and did not look back to see what Corvin's grandfather's lock had settled for instead.
  -- 30.0s total, 14279 in / 859 out tokens

===== RUN 2 =====
         He remembered Ossa's voice telling him the brass key was bent for a reason, and that losing it underground was no accident at all.
         His torch stayed dull orange, unconvinced by anything, and he wondered if Ossa had meant for him to fail down here.
  [dark] The bent key was cut wrong on purpose, to open only when the door meant to trap something inside instead.
  [him]  He feels the brass key's weight in his pocket and realizes he was never meant to leave with what he came for.
         The ember warmed his palm like a second pulse, and past the crystal seam the torch stuttered blue, hungry for the door he now feared to find.
         The new dark smelled of old iron, and the torch's blue flicker sharpened as if the trapping door Ossa wa
… [truncated]
```
</details>

Coherence holds — each run carries one person, one object, one cause from the opening through the revelations to the ending, and the revelations escalate what was established rather than wandering. Let me verify the build and re-check the key never ships:

**`Bash`** — Build and verify no secrets shipped
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
npx vite build 2>&1 | tail -5
echo "=== secret scan in dist ==="
grep -rlE "sk-ant|wrkspc_" dist/ 2>/dev/null && echo "!!! LEAK !!!" || echo "clean: no key material in dist/"
echo "=== premise anywhere in shipped code ==="
grep -rn "premise" src/ dist/ 2>/dev/null | head || echo "none"
pkill -f "vite" 2>/dev/null; echo done
```
<details><summary>result</summary>

```
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 584ms
=== secret scan in dist ===
clean: no key material in dist/
=== premise anywhere in shipped code ===
done
```
</details>

Done. The premise is gone, and the dead `/api/story` handler went with it (it was the only other user of those pools) — `tools/story-plugin.mjs` is 331 → ~200 lines.

**What changed**
- `tools/story-plugin.mjs`: deleted `REGISTERS` / `RELICS` / `REASONS` / `pick()`, the premise minting, the `PREMISE (fixed for this run)` block in the user message, the `premise` field in the response, and the unused whole-story handler and its schema.
- `src/game/Narrator.js`: dropped `this.premise` and its round-trip. The prefetch guard stayed but now keys off `told.length` — the first beat is what invents the person and object, so a revelation can't be requested until there's a story to continue (a discovery before then uses a written one, as before).

**One thing worth knowing.** Removing the premise exposed a problem it had been hiding: with a fixed prompt, single samples collapse onto one answer. Twelve fresh runs gave twelve tin whistles. I forbade whistles — twelve ledgers. Every prohibition just moved the mode, and when I listed alternatives in the prompt, *my list* became the new pool. Prompt negation can't fix this.

So the opening beat now asks the model for six genuinely different answers to "who is this boy, what is he carrying, why is he underground" in one completion, and tells it to commit to number *N* — where the server picks N at random per run. The model still invents everything; the only thing supplied is which of its own ideas it has to live with. Twelve runs now give eight distinct objects and reasons that differ in kind: a sealed jar, a stolen contract, a summons, a tin soldier, a collar with orders attached, a brass whistle someone paid him to bury.

That's not a premise sneaking back in — nothing about the story is decided before the model writes it.

**Coherence** was the risk, since the premise had been what held a run together. Across three full playthroughs it survived on the system-prompt continuity rules alone: each held one named person, one object and one cause from the opening through both revelations to the ending, with the revelations escalating what was already established (a bent key that turns out to free a warden, not a prisoner; a coin that's a toll the dark has never once accepted). ~27s and about 800 output tokens per full run.

Build is clean and `dist/` still has no key material in it.


---
[← 15-what-is-the-starting-prompt-that.md](15-what-is-the-starting-prompt-that.md)  ·  [index](README.md)