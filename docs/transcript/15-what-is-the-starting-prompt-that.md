# 15. what is the starting prompt that we are using?

[← index](README.md)

## The prompt

> what is the starting prompt that we are using?

## What happened

Let me pull the actual text rather than paraphrase it:

**`Bash`** — Print the live system prompt
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/^const CONTINUE_SYSTEM/,/^`;$/p' tools/story-plugin.mjs
```
<details><summary>result</summary>

```
const CONTINUE_SYSTEM = `You are writing TORCHBOY's story one beat at a time, while it is being played.

The world:
- A small boy with an enormous head and a stubborn little mohawk, carrying a torch.
- He is deep underground and CLIMBING toward the surface through three caverns.
- His torch stirs and cools toward blue-white when a hidden way in the rock is
  near; it is how he finds passages that look like solid stone.
- Embers lie in the dark. Gathering them widens what the torch can feel.
- When he opens a sealed way, something ancient rises out of the floor and enters
  him, and he knows a thing he has no business knowing.
- Something is wrong down here, and was wrong before he came.

You will be given THE STORY SO FAR and WHAT JUST HAPPENED. Write what comes next.

Absolute rules:
- CONTINUE. Never restate, never summarise, never start over. If a person, an
  object or a fact has been established, it stays established and it recurs.
- What just happened in the cave must be visible in what you write, but obliquely
  - never narrate the mechanics. "He opened a sealed way" becomes something he
  thinks or remembers or dreads, not a report of opening a door.
- One or two sentences. Under 170 characters. Close third person, past tense.
- No dialogue, no quotation marks. Never address the player. Never use the words
  "player", "level", or "game". Do not name the caverns.
- DARK: dread and wanting, not gore. The reader should arrive at the worst of it
  themselves.
- If the story so far has no named person in it yet, name one now and keep them.
- If the story so far has no carried object yet, give him one now and keep it.
- By the end this must have been ONE story with a cause and a consequence, not a
  string of moods. Every beat should make the next one more inevitable.`;

async function continueStory(client, body, res) {
  const { told = [], events = [], want = 'beat', summary = '' } = body;
  // the premise is fixed for a run: minted on the first call, then echoed back
  // by the client on every subsequent one
  const premise = body.premise && body.premise.register ? body.premise
    : { register: pick(REGISTERS), relic: pick(RELICS), reason: pick(REASONS) };
  const story = told.length
    ? told.map((t, i) => `${i + 1}. [${t.kind}] ${t.text}`).join('\n')
    : '(nothing yet - this is the opening beat)';
  const happened = events.length ? events.map((e) => `- ${e}`).join('\n')
… [truncated]
```
</details>

**`Bash`** — Show premise pools and a rendered request
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== the three premise pools ==="
sed -n "/^const REGISTERS/,/^const pick/p" tools/story-plugin.mjs | head -14
echo
echo "=== what an actual opening request looks like on the wire ==="
node -e "
const premise = { register:'grim', relic:'a tin whistle', reason:'a promise he made too young' };
console.log('PREMISE (fixed for this run):');
console.log('- register: ' + premise.register);
console.log('- an object he remembers: ' + premise.relic);
console.log('- why he is down here: ' + premise.reason);
console.log('');
console.log('THE STORY SO FAR:');
console.log('(nothing yet - this is the opening beat)');
console.log('');
console.log('WHERE HE IS: He is in cavern 1 of 3, has opened 0 sealed ways, carries 0 embers, and has walked roughly 0 paces.');
console.log('');
console.log('WHAT JUST HAPPENED:');
console.log('- he wakes on the deepest of 3 levels down, in The Deep Hollow');
console.log('');
console.log('Write the next beat.');
" 2>&1 | grep -v Warning
```
<details><summary>result</summary>

```
=== the three premise pools ===
const REGISTERS = ['haunted', 'grim', 'numb', 'dread-struck', 'resigned', 'cold', 'hollow', 'unquiet'];
const RELICS = ['a brass button', 'a name scratched into slate', 'his father\'s glove',
  'a folded paper bird', 'a key to no door', 'a dried flower', 'a length of blue string',
  'a tin whistle', 'half a photograph', 'a child\'s tooth'];
const REASONS = ['someone is not waiting any more', 'a promise he made too young',
  'a debt that is not his', 'a door he should not have opened',
  'a story he was told and believed', 'he was sent, and told it was an honour',
  'the others who went down did not come back', 'he is the last one who remembers'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

=== what an actual opening request looks like on the wire ===
PREMISE (fixed for this run):
- register: grim
- an object he remembers: a tin whistle
- why he is down here: a promise he made too young

THE STORY SO FAR:
(nothing yet - this is the opening beat)

WHERE HE IS: He is in cavern 1 of 3, has opened 0 sealed ways, carries 0 embers, and has walked roughly 0 paces.

WHAT JUST HAPPENED:
- he wakes on the deepest of 3 levels down, in The Deep Hollow

Write the next beat.
```
</details>

It's in `tools/story-plugin.mjs`, and it comes in two halves.

## The system prompt (fixed, every call)

```
You are writing TORCHBOY's story one beat at a time, while it is being played.

The world:
- A small boy with an enormous head and a stubborn little mohawk, carrying a torch.
- He is deep underground and CLIMBING toward the surface through three caverns.
- His torch stirs and cools toward blue-white when a hidden way in the rock is
  near; it is how he finds passages that look like solid stone.
- Embers lie in the dark. Gathering them widens what the torch can feel.
- When he opens a sealed way, something ancient rises out of the floor and enters
  him, and he knows a thing he has no business knowing.
- Something is wrong down here, and was wrong before he came.

You will be given THE STORY SO FAR and WHAT JUST HAPPENED. Write what comes next.

Absolute rules:
- CONTINUE. Never restate, never summarise, never start over. If a person, an
  object or a fact has been established, it stays established and it recurs.
- What just happened in the cave must be visible in what you write, but obliquely
  — never narrate the mechanics. "He opened a sealed way" becomes something he
  thinks or remembers or dreads, not a report of opening a door.
- One or two sentences. Under 170 characters. Close third person, past tense.
- No dialogue, no quotation marks. Never address the player. Never use the words
  "player", "level", or "game". Do not name the caverns.
- DARK: dread and wanting, not gore. The reader should arrive at the worst of it
  themselves.
- If the story so far has no named person in it yet, name one now and keep them.
- If the story so far has no carried object yet, give him one now and keep it.
- By the end this must have been ONE story with a cause and a consequence, not a
  string of moods. Every beat should make the next one more inevitable.
```

## The user message (rebuilt every call)

```
PREMISE (fixed for this run):
- register: grim
- an object he remembers: a tin whistle
- why he is down here: a promise he made too young

THE STORY SO FAR:
(nothing yet - this is the opening beat)

WHERE HE IS: He is in cavern 1 of 3, has opened 0 sealed ways, carries 0 embers…

WHAT JUST HAPPENED:
- he wakes on the deepest of 3 levels down, in The Deep Hollow

Write the next beat.
```

`THE STORY SO FAR` accumulates every line already shown, tagged `[beat]`, `[revelation]`, `[response]` — that's the memory. `WHAT JUST HAPPENED` is drained from `Chronicle.js`.

The final line swaps by request type: `Write the next beat.` / a knowledge-and-response pair on a discovery / *"This is the END… Do not be consoling if the story has not earned it."*

## The premise

Minted server-side on the first call, then echoed back on every one after so it stays fixed for the run. One draw from each pool:

- **register** — haunted, grim, numb, dread-struck, resigned, cold, hollow, unquiet
- **relic** — a brass button, a name scratched into slate, his father's glove, a folded paper bird, a key to no door, a dried flower, a length of blue string, a tin whistle, half a photograph, a child's tooth
- **reason** — someone is not waiting any more; a promise he made too young; a debt that is not his; a door he should not have opened; a story he was told and believed; he was sent, and told it was an honour; the others who went down did not come back; he is the last one who remembers

Two notes. The three "if the story has no named person / no carried object yet" rules are what fixed the "random sentences" problem — they force continuity to exist by the second beat rather than hoping for it.

And one bit of housekeeping I should flag: the same file still contains a **dead** `SYSTEM` prompt and `/api/story` handler from the old generate-it-all-upfront design. Nothing calls it — the game only uses `/api/story/next`. I left it when a cleanup edit failed its own safety check, and I'd rather delete it deliberately than half-remove it. Say the word and I'll strip it.


---
[← 14-you-have-a-bug-in-the.md](14-you-have-a-bug-in-the.md)  ·  [index](README.md)