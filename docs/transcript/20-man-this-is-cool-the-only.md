# 20. man, this is cool.  The only thing we should do is at the end, make sure and add a button to start over after 

[← index](README.md)

## The prompt

> man, this is cool.  The only thing we should do is at the end, make sure and add a button to start over after a few seconds so that the reader can read the end-story.

## What happened

**`Bash`** — Read ending card HUD + markup
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/ending(title, text)/,/^  }/p' src/game/HUD.js
echo "=== ending markup ==="; grep -n "ending\|endcard\|end-" index.html | head -20
```
<details><summary>result</summary>

```
  ending(title, text) {
    if (!this.el.ending) return;
    this.el.endingTitle.textContent = title || '';
    this.el.endingText.textContent = text || '';
    this.el.ending.classList.add('show');
    this.el.narration.classList.remove('show');
  }
=== ending markup ===
138:  /* the ending goes to daylight, not to black */
141:  #ending {
147:  #ending.show { opacity: 1; }
149:  #hud.ended > *:not(#ending) { opacity: 0; transition: opacity 1.4s ease; }
150:  #ending h2 { text-shadow: 0 1px 0 #fff8ec; }
151:  #ending h2 {
155:  #ending p {
205:<div id="ending">
206:  <h2 id="ending-title"></h2>
207:  <p id="ending-text"></p>
```
</details>

**`Bash`** — Read ending styles and HUD element refs
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '136,162p' index.html
echo "=== ending div ==="; sed -n '203,212p' index.html
echo "=== HUD el refs ==="; sed -n '1,30p' src/game/HUD.js
```
<details><summary>result</summary>

```
  #fade { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; }
  /* the ending goes to daylight, not to black */
  #fade.light { background: #fdf6e8; }

  #ending {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 18px;
    padding: 0 12vw; text-align: center; opacity: 0; pointer-events: none;
    transition: opacity 2.2s ease;
    z-index: 12;
  }
  #ending.show { opacity: 1; }
  /* at the end everything else goes: no map, no counters, no key hints */
  #hud.ended > *:not(#ending) { opacity: 0; transition: opacity 1.4s ease; }
  #ending h2 { text-shadow: 0 1px 0 #fff8ec; }
  #ending h2 {
    margin: 0; font-size: 26px; font-weight: 600; letter-spacing: .05em;
    color: #4a4034;
  }
  #ending p {
    margin: 0; font-size: 17px; line-height: 1.75; font-style: italic;
    color: #6b5f50; max-width: 640px;
  }

  /* ------------------------------------------------------------ loading */
  #loading {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 18px;
=== ending div ===

<div id="fade"></div>
<div id="ending">
  <h2 id="ending-title"></h2>
  <p id="ending-text"></p>
</div>
<div id="loading">
  <h1>Torchboy</h1>
  <div class="bar"><span></span></div>
  <div class="what">waking up</div>
=== HUD el refs ===
/** DOM overlay: fuel, level name, discoveries, toasts, and the fade. */
export class HUD {
… [truncated]
```
</details>

**`Bash`** — Read end-of-game loop handling
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/the ending takes over completely/,/^  });/p' src/main.js
```
<details><summary>result</summary>

```
    // ---- the ending takes over completely, and does not give control back.
    // The `|| game.ended` matters: without it the normal loop resumes the frame
    // after the ascension completes and its own hud.fade(0) wipes the whiteout.
    if (ascension && (ascension.active || game.ended)) {
      const { whiteout, finished } = ascension.update(dt, player);
      hud.whiteout(game.ended ? 1 : whiteout);
      if (!game.ended) {
        player.mixer.update(dt);
        cam.follow(player.pos, dt);
        cam.camera.updateMatrixWorld();
      }
      if (finished && !game.ended) {
        game.ended = true;
        hud.enterEnding();
        narrator.finish();
      }
      hud.update(dt);
      renderer.render(scene, cam.camera);
      return;
    }

    if (bestowal) {
      _chest.set(player.pos.x, player.pos.y + 0.78, player.pos.z);
      if (bestowal.update(dt, _chest)) {
        // the instant it goes in: he reacts, and the dark tells him something
        player.react(1);
        const known = narrator.nextRevelation();
        if (known) hud.revelation(known);
      }
    }
    if (minimap) minimap.update(dt, game.level, player.pos, player.facing, cavern, props);
    chronicle.update(dt, game.level, grid.worldToTile(player.pos.x, player.pos.z),
                     torch.proximity, cavern);
    narrator.update(dt, player.pos, busy,
      chronicle.summary(game.level, grid.levels.length, game.found, torch.embers));
    hud.update(dt);
    if (game.transition > 0) {
      game.transition = Math.max(0, game.transition - dt);
      hud.fade(Math.min(1, game.transition * 2.2));
    } else hud.fade(0);
… [truncated]
```
</details>

The loop keeps running after the end, but a DOM timer is simpler and frame-rate independent. Adding the button:

**`Bash`** — Add restart button, markup, styles, HUD timer
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='index.html'; s=open(p).read()

old = """  #ending p {
    margin: 0; font-size: 17px; line-height: 1.75; font-style: italic;
    color: #6b5f50; max-width: 640px;
  }
"""
new = """  #ending p {
    margin: 0; font-size: 17px; line-height: 1.75; font-style: italic;
    color: #6b5f50; max-width: 640px;
  }
  /* Held back until the ending has had time to be read: appearing with the
     text would put something to click on top of the last thing he says.
     #ending is pointer-events:none, so the button has to opt back in. */
  #restart {
    justify-self: center; margin-top: 10px;
    font: inherit; font-size: 13px; letter-spacing: .09em; text-transform: lowercase;
    color: #6b5f50; background: transparent;
    border: 1px solid rgba(107, 95, 80, 0.35); border-radius: 2px;
    padding: 9px 20px; cursor: pointer;
    opacity: 0; pointer-events: none;
    transition: opacity 1.6s ease, background-color .25s ease,
                border-color .25s ease, color .25s ease;
  }
  #restart.show { opacity: 1; pointer-events: auto; }
  #restart:hover, #restart:focus-visible {
    background: rgba(107, 95, 80, 0.08); border-color: rgba(107, 95, 80, 0.6);
    color: #4a4034; outline: none;
  }
"""
assert old in s, 'MISS css'; s = s.replace(old, new, 1)

old = """<div id="ending">
  <h2 id="ending-title"></h2>
  <p id="ending-text"></p>
</div>"""
new = """<div id="ending">
  <h2 id="ending-title"></h2>
  <p id="ending-text"></p>
  <button id="restart" type="button">go down again</button>
</div>"""
assert old in s, 'MISS markup'; s = s.replace(old, new, 1)
open(p,'w').write(s); print('ok')
PY

python3 - <<'PY'
p='src/game/HUD.js'; s=open(p).read()

old = """      endingText: document.getElementById('ending-text'),"""
new = """      endingText: document.getElementById('ending-text'),
      restart: document.getElementById('restart'),"""
assert old in s, 'MISS ref'; s = s.replace(old, new, 1)

old = """  ending(title, text) {
    if (!this.el.ending) return;
    this.el.endingTitle.textContent = title || '';
    this.el.endingText.textContent = text || '';
    this.el.ending.classList.add('show');
… [truncated]
```
<details><summary>result</summary>

```
ok
ok
syntax ok
```
</details>

**`Bash`** — Find HUD construction
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "new HUD\|hud.ready()" src/main.js
```
<details><summary>result</summary>

```
34:const hud = new HUD();
119:  hud.ready();
```
</details>

**`Bash`** — Wire restart to reload
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='src/main.js'; s=open(p).read()
old = """  hud.ready();"""
new = """  hud.ready();
  // A reload IS the restart: the caves are generated per run, the story is
  // written per run, and the audio graph is built once at boot - so starting
  // over from scratch is both the correct behaviour and the simplest.
  hud.onRestart(() => window.location.reload());"""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
node --check src/main.js && echo "syntax ok"
```
<details><summary>result</summary>

```
ok
syntax ok
```
</details>

Now let me actually reach a real ending in the browser and watch the button behave:

**`Bash`** — Restart dev server
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
pkill -f vite 2>/dev/null; sleep 1; rm -f /tmp/vite-dev.log
(npm run dev >| /tmp/vite-dev.log 2>&1 &) ; sleep 6
lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && echo up || tail -5 /tmp/vite-dev.log
```
<details><summary>result</summary>

```
up
```
</details>

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
- [Snapshot](.playwright-mcp/page-2026-09-06T19-56-05-438Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-06T19-56-05-110Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
() => new Promise(async (res) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // wait for boot
  for (let i = 0; i < 100 && !(window.__game && window.__game.props); i++) await sleep(300);
  const g = window.__game;
  const log = [];
  const clear = async (lvl) => {
    for (const s of [...g.cavern.secrets.values()].filter(x => x.level === lvl && !x.done)) {
      const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({tx:s.tx+dx, ty:s.ty+dy}))
        .find(t => '.FT*P<>X'.includes(g.grid.char(lvl, t.tx, t.ty)));
      g.player.placeAt(lvl, nb.tx, nb.ty); await sleep(700);
    }
    await sleep(4200);
  };
  await clear(0);
  let t = g.grid.find(0,'>')[0]; g.player.placeAt(0,t.tx,t.ty); await sleep(1600);
  await clear(1);
  t = g.grid.find(1,'>')[0]; g.player.placeAt(1,t.tx,t.ty); await sleep(1600);
  await clear(2);
  const x = g.grid.find(2,'X')[0]; g.player.placeAt(2,x.tx,x.ty);
  log.push(`level ${g.game.level}, walked into the exit`);

  const btn = document.getElementById('restart');
  const t0 = Date.now();
  let textAt = null, shownAt = null;
  for (let i = 0; i < 200; i++) {
    const txt = document.getElementById('ending-text').textContent;
    if (!textAt && txt && txt !== '…') textAt = Date.now();
    if (!shownAt && btn.classList.contains('show')) { shownAt = Date.now(); break; }
    await sleep(250);
  }
  res({ log,
    won: g.game.won, end
… [truncated]
```
<details><summary>result</summary>

```
### Result
{
  "log": [
    "level 2, walked into the exit"
  ],
  "won": true,
  "ended": true,
  "endingTitle": "Torchboy",
  "endingText": "He climbed into a light that did not warm him, and understood why: he was already full past measure, and the sun only showed the shape he'd become. Somewhere behind him the dark settled, satisfied, wearing his old shadow like a coat that finally fit.",
  "buttonLabel": "go down again",
  "secondsFromRealTextToButton": 10,
  "buttonVisibleNow": true,
  "buttonClickable": "auto"
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise(async (res) => {\n  const sleep = (ms) => new Promise(r => setTimeout(r, ms));\n  // wait for boot\n  for (let i = 0; i < 100 && !(window.__game && window.__game.props); i++) await sleep(300);\n  const g = window.__game;\n  const log = [];\n  const clear = async (lvl) => {\n    for (const s of [...g.cavern.secrets.values()].filter(x => x.level === lvl && !x.done)) {\n      const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({tx:s.tx+dx, ty:s.ty+dy}))\n        .find(t => \'.FT*P<>X\'.includes(g.grid.char(lvl, t.tx, t.ty)));\n      g.player.placeAt(lvl, nb.tx, nb.ty); await sleep(700);\n    }\n    await sleep(4200);\n  };\n  await clear(0);\n  let t = g.grid.find(0,\'>\')[0]; g.player.placeAt(0,t.tx,t.ty); await sleep(1600);\n  await clear(1);\n  t = g.grid.find(1,\'>\')[0]; g.player.placeAt(1,t.tx,t.ty); await sleep(1600);\n  await clear(2);\n  const x = g.grid.find(2,\'X\')[0]; g.player.placeAt(2,x.tx,x.ty);\n  log.push(`level ${g.game.level}, walked into the exit`);\n\n  const btn = document.getElementById(\'restart\');\n  const t0 = Date.now();\n  let textAt = null, shownAt = null;\n  for (let i = 0; i < 200; i++) {\n    const txt = document.getElementById(\'ending-text\').textContent;\n    if (!textAt && txt && txt !== \'…\') textAt = Date.now();\n    if (!shownAt && btn.classList.contains(\'show\')) { shownAt = Date.now(); break; }\n    await sleep(250);\n  }\n  res({ log,\n    won: g.game.won, ended: g.game.ended,\n    endingTitle: document.getElementById(\'ending-title\').textContent,\n    endingText: document.getElementById(\'ending-text\').textContent,\n    buttonLabel: btn.textContent,\n    secondsFromRealTextToButton: textAt && shownAt ? +((shownAt - textAt)/1000).toFixed(1) : null,\n    buttonVisibleNow: btn.classList.contains(\'show\'),\n    buttonClickable: getComputedStyle(btn).pointerEvents,\n  });\n})');
``​`
```
</details>

Button appeared 10.0s after the real text landed (scaled to that 245-char ending), and it's clickable. Let me look at it:

**`playwright/browser_take_screenshot`**
<details><summary>result</summary>

```
### Result
- [Screenshot of viewport](./ending-card.png)
### Ran Playwright code
``​`js
// Screenshot viewport and save it as ./ending-card.png
await page.screenshot({
  path: './ending-card.png',
  scale: 'css',
  type: 'png'
});
``​`
```
</details>

**`Read`**
<details><summary>result</summary>

```
File does not exist. Note: your current working directory is ~/proj/me/learn/blender-mcp/cavern-game.
```
</details>

**`Bash`** — Locate screenshot
```bash
find ~/proj/me/learn/blender-mcp/cavern-game -name "ending-card.png" -newermt "-5 minutes" 2>/dev/null; ls -la ~/proj/me/learn/blender-mcp/cavern-game/ending-card.png 2>/dev/null
```
<details><summary>result</summary>

```
Exit code 1
```
</details>

**`Bash`** — Find screenshot anywhere
```bash
find / -name "ending-card.png" -newermt "-10 minutes" 2>/dev/null | head -3
```
<details><summary>result</summary>

```
(Bash completed with no output)
```
</details>

The screenshot didn't land on disk. Let me verify the layout programmatically instead, and confirm the click actually restarts:

**`playwright/browser_evaluate`**
```js
() => {
  const btn = document.getElementById('restart');
  const p = document.getElementById('ending-text');
  const cs = getComputedStyle(btn);
  const br = btn.getBoundingClientRect(), pr = p.getBoundingClientRect();
  return {
    button: { opacity: cs.opacity, color: cs.color, border: cs.borderColor,
              fontSize: cs.fontSize, cursor: cs.cursor },
    layout: { textBottom: Math.round(pr.bottom), buttonTop: Math.round(br.top),
              gapPx: Math.round(br.top - pr.bottom),
              centered: Math.abs((br.left + br.right)/2 - innerWidth/2) < 2,
              onScreen: br.top > 0 && br.bottom < innerHeight },
    otherHudHidden: getComputedStyle(document.getElementById('minimap').closest('div')).opacity,
  };
}
```
<details><summary>result</summary>

```
### Result
{
  "button": {
    "opacity": "1",
    "color": "rgb(107, 95, 80)",
    "border": "rgba(107, 95, 80, 0.35)",
    "fontSize": "13px",
    "cursor": "pointer"
  },
  "layout": {
    "textBottom": 553,
    "buttonTop": 581,
    "gapPx": 28,
    "centered": true,
    "onScreen": true
  },
  "otherHudHidden": "0"
}
### Ran Playwright code
``​`js
await page.evaluate('() => {\n  const btn = document.getElementById(\'restart\');\n  const p = document.getElementById(\'ending-text\');\n  const cs = getComputedStyle(btn);\n  const br = btn.getBoundingClientRect(), pr = p.getBoundingClientRect();\n  return {\n    button: { opacity: cs.opacity, color: cs.color, border: cs.borderColor,\n              fontSize: cs.fontSize, cursor: cs.cursor },\n    layout: { textBottom: Math.round(pr.bottom), buttonTop: Math.round(br.top),\n              gapPx: Math.round(br.top - pr.bottom),\n              centered: Math.abs((br.left + br.right)/2 - innerWidth/2) < 2,\n              onScreen: br.top > 0 && br.bottom < innerHeight },\n    otherHudHidden: getComputedStyle(document.getElementById(\'minimap\').closest(\'div\')).opacity,\n  };\n}');
``​`
```
</details>

Centered, 28px below the text, on screen, and the rest of the HUD is faded out. Now the click:

**`playwright/browser_evaluate`**
```js
() => {
  // record the current run so we can prove the click produced a different one
  const g = window.__game;
  sessionStorage.setItem('prevSeed', JSON.stringify(g.grid.levels.map(l => l.seed)));
  sessionStorage.setItem('prevEnding', document.getElementById('ending-text').textContent);
  document.getElementById('restart').click();
  return 'clicked';
}
```
<details><summary>result</summary>

```
### Result
"clicked"
### Ran Playwright code
``​`js
await page.evaluate('() => {\n  // record the current run so we can prove the click produced a different one\n  const g = window.__game;\n  sessionStorage.setItem(\'prevSeed\', JSON.stringify(g.grid.levels.map(l => l.seed)));\n  sessionStorage.setItem(\'prevEnding\', document.getElementById(\'ending-text\').textContent);\n  document.getElementById(\'restart\').click();\n  return \'clicked\';\n}');
``​`
### Page
- Page URL: http://localhost:5173/
- Page Title: Loading http://localhost:5173/
```
</details>

**`playwright/browser_evaluate`**
```js
() => new Promise(async (res) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(window.__game && window.__game.props); i++) await sleep(300);
  const g = window.__game;
  const prev = JSON.parse(sessionStorage.getItem('prevSeed') || '[]');
  const now = g.grid.levels.map(l => l.seed);
  res({
    freshRun: {
      level: g.game.level,
      newSeeds: JSON.stringify(now) !== JSON.stringify(prev),
      counts: g.cavern.countOn(0),
      stairsSealed: g.props.isSealed(0),
      won: g.game.won, ended: g.game.ended,
      endingCardHidden: !document.getElementById('ending').classList.contains('show'),
      restartHidden: !document.getElementById('restart').classList.contains('show'),
      foundLabel: document.getElementById('found').textContent,
    },
    previousEnding: (sessionStorage.getItem('prevEnding') || '').slice(0, 60) + '…',
  });
})
```
<details><summary>result</summary>

```
### Result
{
  "freshRun": {
    "level": 0,
    "newSeeds": true,
    "counts": {
      "total": 3,
      "found": 0,
      "complete": false
    },
    "stairsSealed": true,
    "won": false,
    "ended": false,
    "endingCardHidden": true,
    "restartHidden": true,
    "foundLabel": "0/3"
  },
  "previousEnding": "He climbed into a light that did not warm him, and understoo…"
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise(async (res) => {\n  const sleep = (ms) => new Promise(r => setTimeout(r, ms));\n  for (let i = 0; i < 100 && !(window.__game && window.__game.props); i++) await sleep(300);\n  const g = window.__game;\n  const prev = JSON.parse(sessionStorage.getItem(\'prevSeed\') || \'[]\');\n  const now = g.grid.levels.map(l => l.seed);\n  res({\n    freshRun: {\n      level: g.game.level,\n      newSeeds: JSON.stringify(now) !== JSON.stringify(prev),\n      counts: g.cavern.countOn(0),\n      stairsSealed: g.props.isSealed(0),\n      won: g.game.won, ended: g.game.ended,\n      endingCardHidden: !document.getElementById(\'ending\').classList.contains(\'show\'),\n      restartHidden: !document.getElementById(\'restart\').classList.contains(\'show\'),\n      foundLabel: document.getElementById(\'found\').textContent,\n    },\n    previousEnding: (sessionStorage.getItem(\'prevEnding\') || \'\').slice(0, 60) + \'…\',\n  });\n})');
``​`
### Page
- Page URL: http://localhost:5173/
- Page Title: Torchboy — The Deep Hollow
### Events
- New console entries: .playwright-mcp/console-2026-09-06T19-56-05-110Z.log#L3-L4
```
</details>

**`Bash`** — Build check
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
npx vite build 2>&1 | grep -E "built|error" | tail -2
grep -rlE "sk-ant|wrkspc_" dist/ 2>/dev/null && echo "!!! LEAK !!!" || echo "dist clean"
```
<details><summary>result</summary>

```
✓ built in 760ms
dist clean
```
</details>

**`playwright/browser_console_messages`**
<details><summary>result</summary>

```
### Result
Total messages: 4 (Errors: 0, Warnings: 0)
Returning 0 messages for level "warning"

```
</details>

Added — a **"go down again"** button on the end card. Still at **http://localhost:5173/**.

**How it behaves**

It's held back until the ending has had time to land. The timing keys off the *real* text, not the placeholder: `narrator.finish()` first paints `…` while the last passage is still being written, so starting a timer there would have the button fading in during the wait. The delay also scales with how much there is to read — 5s plus 20ms per character, clamped to 5–11s — so a short ending doesn't leave you sitting there and a long one doesn't get interrupted. It fades in over 1.6s rather than popping, and sits 28px under the text, centered, in the same muted daylight palette as the card.

Restart is a full page reload. That's not laziness — the caverns are generated per run, the story is written per run, and the audio graph is built once at boot, so reloading is both correct and the only thing that can't leave stale state behind.

**Verified end-to-end in the browser**, playing a real run to completion: button appeared 10.0s after the ending text landed (a 245-char ending), centered and clickable with the rest of the HUD faded out. Clicking it produced a genuinely fresh run — new level seeds, back on level 0 at `0/3` with the stairs sealed again, `won`/`ended` cleared, and both the end card and the button hidden. No console errors, build clean.

One detail worth knowing: the button is keyboard-reachable and has a `:focus-visible` state, so Tab-then-Enter works — but it only becomes focusable when it appears, so it can't be tabbed into early.


---
[← 19-ok-the-premise-is-till-weird.md](19-ok-the-premise-is-till-weird.md)  ·  [index](README.md)