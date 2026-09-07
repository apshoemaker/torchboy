# 21. too cool - can you please create a hero image that the readme contains and a couple of gif videos showing the 

[← index](README.md)

## The prompt

> too cool - can you please create a hero image that the readme contains and a couple of gif videos showing the functionality.  The plan is to open source this and host it on github.

## What happened

**`Bash`** — Check capture tooling and README
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== tools ==="
which ffmpeg magick convert gifsicle 2>/dev/null || true
ffmpeg -version 2>/dev/null | head -1 || echo "no ffmpeg"
echo "=== README ==="
wc -l README.md && head -60 README.md
echo "=== existing images ==="
ls -la docs/ media/ assets/ 2>/dev/null; find . -name "*.png" -o -name "*.gif" | grep -v node_modules | head
```
<details><summary>result</summary>

```
=== tools ===
/opt/homebrew/bin/ffmpeg
/opt/homebrew/bin/magick
/opt/homebrew/bin/convert
gifsicle not found
ffmpeg version 8.1.2 Copyright (c) 2000-2026 the FFmpeg developers
=== README ===
     472 README.md
# Torchboy — The Deep Hollow

An isometric cavern crawler that runs in the browser. You are a small boy with an
enormous head and a mohawk, carrying a torch through three levels of unlit cave.
Hidden passages are sealed behind rock that looks exactly like every other wall —
your torch is the instrument that finds them.

All art is generated in **Blender** by script and exported to glTF; the game runs
on **three.js**.

``​`bash
npm install
npm run dev        # http://localhost:5173
``​`

Assets are committed, so `npm run dev` works without Blender. To regenerate them:

``​`bash
npm run assets     # headless Blender -> public/models/*.glb
npm run levels     # regenerate + validate the level grids only
``​`

---

## Generated fresh every run

The caves are **generated in the browser at load** (`LevelGen.js` -> `CavernMesh.js`),
not baked at build time. Every session is a different cavern, and the 2.4MB
`cavern.glb` is gone entirely - ~68k triangles cost a few milliseconds to build
and nothing to ship. `public/` is now 500KB, all of it the character and props.

A level that fails its own invariants is **re-rolled rather than shipped**: the
… [truncated]
```
</details>

Good — ffmpeg and ImageMagick are both here. For GIFs I need full-viewport capture including the DOM overlay (minimap, narration), so a canvas-only grab won't do. Let me check what driver I have:

**`Bash`** — Check for a scriptable browser driver
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
ls node_modules | grep -i -E "playwright|puppeteer" || echo "not a local dep"
npx --no-install playwright --version 2>/dev/null || echo "no local playwright cli"
ls ~/Library/Caches/ms-playwright 2>/dev/null | head || echo "no playwright browser cache"
node -e "try{require.resolve('playwright');console.log('resolvable')}catch(e){console.log('not resolvable')}"
```
<details><summary>result</summary>

```
not a local dep
no local playwright cli
b
not resolvable
```
</details>

**`Bash`** — Look for existing playwright install
```bash
ls ~/Library/Caches/ms-playwright/ 2>/dev/null; echo "---"; ls -d /opt/homebrew/lib/node_modules/* 2>/dev/null | head; echo "--- global npm ---"; npm ls -g --depth=0 2>/dev/null | head -20
```
<details><summary>result</summary>

```
b
---
/opt/homebrew/lib/node_modules/npm
--- global npm ---
~/.nvm/versions/node/v23.0.0/lib
├── @angular/cli@19.2.6
├── @google/gemini-cli@0.21.3
├── cline@2.11.0
├── corepack@0.29.4
├── kanban@0.1.47
└── npm@10.9.0
```
</details>

No Playwright locally, and I'd rather not add a 150MB browser dep to a repo you're about to open source. Let me check whether I can script the MCP browser directly:

**`ToolSearch`**
<details><summary>result</summary>

```



```
</details>

I can drive Playwright directly, which means CDP screencast — proper frame capture including the DOM overlay. Let me check the input bindings first so I can drive real movement rather than teleports:

**`Bash`** — Read input bindings
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "Key\|code\|addEventListener" src/game/Input.js | head -30
```
<details><summary>result</summary>

```
1:/** Keyboard + on-screen thumbstick, normalised to a single {x, y} vector. */
10:    addEventListener('keydown', (e) => {
11:      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
12:      this.keys.add(e.code);
13:      if (e.code === 'Space' || e.code === 'KeyE') this.onAction();
15:    addEventListener('keyup', (e) => this.keys.delete(e.code));
16:    addEventListener('blur', () => this.keys.clear());
24:    dom.addEventListener('mousedown', (e) => {
30:    addEventListener('mousemove', (e) => {
40:    addEventListener('mouseup', endDrag);
41:    addEventListener('blur', endDrag);
42:    dom.addEventListener('contextmenu', (e) => e.preventDefault());
61:    dom.addEventListener('touchstart', start, { passive: true });
62:    dom.addEventListener('touchmove', move, { passive: false });
63:    dom.addEventListener('touchend', end);
73:  /** Keyboard pivot, in radians per second (held, so it must be rate-based). */
76:    if (this.keys.has('KeyQ')) r -= 1;
77:    if (this.keys.has('KeyE')) r += 1;
85:    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
86:    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
87:    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
88:    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
```
</details>

Now let me build the capture harness — CDP screencast plus a way to steer the boy toward a target so the clips show real, purposeful movement:

**`Bash`** — Write capture helper library
```bash
mkdir -p <scratch>
cat > <scratch> <<'EOF'
// Shared capture helpers, injected into the page. Kept in one place so every
// clip is driven the same way: real keyboard input through the real input
// layer, never teleports, so the walk cycle and head-turning look like play.
const fs = require('fs');
const path = require('path');

async function startCast(page, dir, opts = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const client = await page.context().newCDPSession(page);
  let n = 0;
  const frames = [];
  client.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    const i = n++;
    frames.push({ i, t: metadata.timestamp });
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    try { await client.send('Page.screencastFrameAck', { sessionId }); } catch {}
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: opts.quality ?? 92, everyNthFrame: 1,
  });
  return { client, frames, stop: async () => {
    try { await client.send('Page.stopScreencast'); } catch {}
    await new Promise((r) => setTimeout(r, 400));
    return frames;
  } };
}

// Wait until the game has booted and the loading card is gone.
async function ready(page) {
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null,
    { timeout: 90000 });
}

// Hold movement keys for a duration, so the character actually accelerates,
// turns and animates rather than snapping between tiles.
async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/**
 * Walk toward a world position using the real input layer: every frame, pick
 * the WASD combination whose resulting movement vector best points at the
 * target under the CURRENT camera basis, and hold it. This is what a player
 * does, so the footwork, the head-turn and the camera all behave normally.
 */
async function walkTo(page, target, opts = {}) {
  const { timeout = 14000, stopAt = 1.6, o
… [truncated]
```
<details><summary>result</summary>

```
written
```
</details>

**`Bash`** — Write pipeline probe
```bash
S=<scratch>
cat > $S/probe.js <<'EOF'
const { ready } = require('<scratch>');
module.exports = async (page) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:5173/');
  await ready(page);
  // one screencast frame, to prove the pipeline before capturing anything long
  const client = await page.context().newCDPSession(page);
  const got = await new Promise(async (res) => {
    client.on('Page.screencastFrame', ({ data, sessionId }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(()=>{});
      res(data.length);
    });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 90 });
    setTimeout(() => res(null), 6000);
  });
  await client.send('Page.stopScreencast').catch(()=>{});
  const info = await page.evaluate(() => {
    const g = window.__game;
    return { level: g.game.level, secrets: g.cavern.countOn(0),
             player: {x:+g.player.pos.x.toFixed(1), z:+g.player.pos.z.toFixed(1)},
             viewport: [innerWidth, innerHeight] };
  });
  return { frameBytes: got, ...info };
};
EOF
echo ok
```
<details><summary>result</summary>

```
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Error
Error: File access denied: <scratch> is outside allowed roots. Allowed roots: ~/proj/me/learn/blender-mcp/.playwright-mcp, ~/proj/me/learn/blender-mcp
```
</details>

Scripts must live under the allowed root — I'll put them beside the repo, not in it, so nothing lands in the open-source tree:

**`Bash`** — Move capture scripts into allowed root
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
mkdir -p $R
S=<scratch>
sed "s|<scratch>" $S/lib.js > $R/lib.js
sed "s|<scratch>" $S/probe.js > $R/probe.js
ls -la $R
echo "--- repo untouched? ---"
git status --short | head
```
<details><summary>result</summary>

```
total 16
drwxr-xr-x@  4 apshoemaker  staff   128 Sep  6 14:00 .
drwxr-xr-x@ 12 apshoemaker  staff   384 Sep  6 14:00 ..
-rw-r--r--@  1 apshoemaker  staff  3525 Sep  6 14:00 lib.js
-rw-r--r--@  1 apshoemaker  staff  1118 Sep  6 14:00 probe.js
--- repo untouched? ---
?? .gitignore
?? README.md
?? blender/
?? index.html
?? package-lock.json
?? package.json
?? public/
?? src/
?? tools/
?? vite.config.mjs
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Error
SyntaxError: Unexpected token 'const'
```
</details>

The file must be a bare function expression, not a module:

**`Bash`** — Rewrite probe as bare function
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cat > $R/probe.js <<'EOF'
async (page) => {
  const out = {};
  try { out.hasRequire = typeof require; out.fs = !!require('fs'); } catch (e) { out.requireErr = e.message; }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  const client = await page.context().newCDPSession(page);
  const bytes = await new Promise(async (res) => {
    client.on('Page.screencastFrame', ({ data, sessionId }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      res(data.length);
    });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 90 });
    setTimeout(() => res(null), 8000);
  });
  await client.send('Page.stopScreencast').catch(() => {});
  const info = await page.evaluate(() => ({
    level: window.__game.game.level,
    secrets: window.__game.cavern.countOn(0),
    viewport: [innerWidth, innerHeight],
  }));
  return { ...out, frameB64Bytes: bytes, ...info };
}
EOF
echo ok
```
<details><summary>result</summary>

```
(eval):2: file exists: ~/proj/me/learn/blender-mcp/.capture-tmp/probe.js
ok
```
</details>

**`Bash`** — Write probe (noclobber-safe)
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/probe.js
cat > $R/probe.js <<'EOF'
async (page) => {
  const out = {};
  try { out.requireType = typeof require; out.fsOk = !!require('fs'); } catch (e) { out.requireErr = e.message; }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  const client = await page.context().newCDPSession(page);
  const bytes = await new Promise(async (res) => {
    client.on('Page.screencastFrame', ({ data, sessionId }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      res(data.length);
    });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 90 });
    setTimeout(() => res(null), 8000);
  });
  await client.send('Page.stopScreencast').catch(() => {});
  const info = await page.evaluate(() => ({
    level: window.__game.game.level,
    secrets: window.__game.cavern.countOn(0),
    viewport: [innerWidth, innerHeight],
  }));
  return { ...out, frameB64Bytes: bytes, ...info };
}
EOF
ls -la $R/probe.js
```
<details><summary>result</summary>

```
-rw-r--r--@ 1 apshoemaker  staff  1122 Sep  6 14:01 ~/proj/me/learn/blender-mcp/.capture-tmp/probe.js
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Error
Error: ReferenceError: setTimeout is not defined

ReferenceError: setTimeout is not defined
```
</details>

**`Bash`** — Probe without setTimeout
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/probe.js
cat > $R/probe.js <<'EOF'
async (page) => {
  const out = {};
  try { out.requireType = typeof require; out.fsOk = !!require('fs'); } catch (e) { out.requireErr = String(e.message); }
  try { out.processCwd = process.cwd(); } catch (e) { out.processErr = String(e.message); }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  const client = await page.context().newCDPSession(page);
  let frames = 0, firstLen = 0;
  client.on('Page.screencastFrame', ({ data, sessionId }) => {
    frames++; if (!firstLen) firstLen = data.length;
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 90 });
  await page.waitForTimeout(2000);
  await client.send('Page.stopScreencast').catch(() => {});
  const info = await page.evaluate(() => ({
    level: window.__game.game.level,
    secrets: window.__game.cavern.countOn(0),
    viewport: [innerWidth, innerHeight],
  }));
  return { ...out, frames, firstLen, ...info };
}
EOF
echo ok
```
<details><summary>result</summary>

```
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"requireType":"undefined","requireErr":"require is not defined","processErr":"process is not defined","frames":201,"firstLen":16716,"level":0,"secrets":{"total":3,"found":0,"complete":false},"viewport":[1280,720]}
### Ran Playwright code
``​`js
await (async (page) => {
  const out = {};
  try { out.requireType = typeof require; out.fsOk = !!require('fs'); } catch (e) { out.requireErr = String(e.message); }
  try { out.processCwd = process.cwd(); } catch (e) { out.processErr = String(e.message); }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  const client = await page.context().newCDPSession(page);
  let frames = 0, firstLen = 0;
  client.on('Page.screencastFrame', ({ data, sessionId }) => {
    frames++; if (!firstLen) firstLen = data.length;
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 90 });
  await page.waitForTimeout(2000);
  await client.send('Page.stopScreencast').catch(() => {});
  const info = await page.evaluate(() => ({
    level: window.__game.game.level,
    secrets: window.__game.cavern.countOn(0),
    viewport: [innerWidth, innerHeight],
  }));
  return { ...out, frames, firstLen, ...info };
}
)(page);
``​`
### Events
- New console entries: .playwright-mcp/console-2026-09-06T19-56-05-110Z.log#L5-L8
```
</details>

Screencast works (201 frames in 2s), but the sandbox has no `require` or `process`, so it can't write files. Let me see what it *does* have:

**`Bash`** — Probe sandbox globals
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/probe2.js
cat > $R/probe2.js <<'EOF'
async (page) => {
  const g = (n) => { try { return typeof eval(n); } catch (e) { return 'err'; } };
  return {
    fetch: g('fetch'), Buffer: g('Buffer'), atob: g('atob'), btoa: g('btoa'),
    URL: g('URL'), TextEncoder: g('TextEncoder'), Blob: g('Blob'),
    globalKeys: Object.getOwnPropertyNames(globalThis).slice(0, 40),
  };
}
EOF
echo ok
```
<details><summary>result</summary>

```
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"fetch":"err","Buffer":"err","atob":"err","btoa":"err","URL":"err","TextEncoder":"err","Blob":"err","globalKeys":["Object","Function","Array","Number","parseFloat","parseInt","Infinity","NaN","undefined","Boolean","String","Symbol","Date","Promise","RegExp","Error","AggregateError","EvalError","RangeError","ReferenceError","SyntaxError","TypeError","URIError","globalThis","JSON","Math","Intl","ArrayBuffer","Atomics","Uint8Array","Int8Array","Uint16Array","Int16Array","Uint32Array","Int32Array","Float32Array","Float64Array","Uint8ClampedArray","BigUint64Array","BigInt64Array"]}
### Ran Playwright code
``​`js
await (async (page) => {
  const g = (n) => { try { return typeof eval(n); } catch (e) { return 'err'; } };
  return {
    fetch: g('fetch'), Buffer: g('Buffer'), atob: g('atob'), btoa: g('btoa'),
    URL: g('URL'), TextEncoder: g('TextEncoder'), Blob: g('Blob'),
    globalKeys: Object.getOwnPropertyNames(globalThis).slice(0, 40),
  };
}
)(page);
``​`
```
</details>

A pure-JS sandbox — only ECMAScript builtins and `page`. But the *page* has `fetch`, so I'll buffer frames in the sandbox and flush them through the page into a small local sink that writes them to disk:

**`Bash`** — Start frame sink server
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/sink.mjs
cat > $R/sink.mjs <<'EOF'
// Frame sink. The Playwright code sandbox has no filesystem, so screencast
// frames are handed to the page and POSTed here to be written to disk.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '~/proj/me/learn/blender-mcp/.capture-tmp/frames';

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { dir, frames } = JSON.parse(body);
      const out = path.join(ROOT, dir.replace(/[^a-z0-9_-]/gi, ''));
      fs.mkdirSync(out, { recursive: true });
      for (const f of frames) {
        fs.writeFileSync(path.join(out, `f${String(f.i).padStart(5, '0')}.jpg`),
                         Buffer.from(f.d, 'base64'));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ wrote: frames.length }));
    } catch (e) {
      res.writeHead(500); res.end(String(e.message));
    }
  });
}).listen(9099, () => console.log('sink on 9099 ->', ROOT));
EOF
mkdir -p $R/frames
pkill -f "capture-tmp/sink.mjs" 2>/dev/null; sleep 0.5
(node $R/sink.mjs >| $R/sink.log 2>&1 &) ; sleep 1.5
cat $R/sink.log
```
<details><summary>result</summary>

```
sink on 9099 -> ~/proj/me/learn/blender-mcp/.capture-tmp/frames
```
</details>

Now the capture driver. First clip: the core loop — walking, the torch sensing hidden rock, the passage opening, the knowledge entering him:

**`Bash`** — Write discovery clip driver
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/discovery.js
cat > $R/discovery.js <<'EOF'
async (page) => {
  // ---------- helpers (inlined: the sandbox has no require) ----------
  const FPS = 20;
  const mkCast = async () => {
    const client = await page.context().newCDPSession(page);
    const buf = [];
    let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;   // subsample to ~20fps
      last = t;
      buf.push({ i: n++, d: data });
    });
    return { client, buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 15) {
      const chunk = buf.slice(i, i + 15);
      wrote += await page.evaluate(async ([dir, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, chunk]);
    }
    return wrote;
  };
  const walkTo = async (target, opts = {}) => {
    const { timeout = 16000, stopAt = 1.7 } = opts;
    const t0 = Date.now();
    let held = [];
    while (Date.now() - t0 < timeout) {
      const s = await page.evaluate(([tx, tz]) => {
        const g = window.__game, p = g.player.pos, b = g.cam.basis();
        const dx = tx - p.x, dz = tz - p.z;
        return { dist: Math.hypot(dx, dz),
                 f: -(dx * b.fwd.x + dz * b.fwd.z),
                 r: dx * b.right.x + dz * b.right.z };
      }, [target.x, target.z]);
      if (s.dist < stopAt) break;
      const m = Math.max(Math.abs(s.f), Math.abs(s.r));
      const want = [];
      if (Math.abs(s.f) > m * 0.42) want.push(s.f > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(s.r) > m * 0.42) want.push(s.r > 0 ? 'KeyD' : 'KeyA');
      const same = want.length
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"plannedDist":12.8,"buffered":496,"wrote":496,"counts":{"total":3,"found":0,"complete":false},"narration":"He woke to stone pressing close on every side, torch guttering, and beneath his "}
### Ran Playwright code
``​`js
await (async (page) => {
  // ---------- helpers (inlined: the sandbox has no require) ----------
  const FPS = 20;
  const mkCast = async () => {
    const client = await page.context().newCDPSession(page);
    const buf = [];
    let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;   // subsample to ~20fps
      last = t;
      buf.push({ i: n++, d: data });
    });
    return { client, buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 15) {
      const chunk = buf.slice(i, i + 15);
      wrote += await page.evaluate(async ([dir, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, chunk]);
    }
    return wrote;
  };
  const walkTo = async (target, opts = {}) => {
    const { timeout = 16000, stopAt = 1.7 } = opts;
    const t0 = Date.now();
… [truncated]
```
</details>

496 frames, but `found: 0` — he never reached the secret, so my movement mapping is wrong. Let me check how the player actually consumes the camera basis:

**`Bash`** — Read camera basis and player movement math
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "basis()" -A 12 src/game/IsoCamera.js | head -20
echo "=== player consumption ==="
grep -n "axis\|basis\|fwd\|right" src/game/Player.js | head -20
```
<details><summary>result</summary>

```
7: * on the keyboard would not be "up" on screen. basis() exposes that rotation.
8- */
9-export class IsoCamera {
10-  constructor(aspect, { viewSize = 20, azimuth = Math.PI / 4, elevation = 0.66 } = {}) {
11-    this.viewSize = viewSize;
12-    this.azimuth = azimuth;
13-    this.targetAzimuth = azimuth;      // orbit target; the camera eases toward it
14-    this.elevation = elevation;
15-    // Ortho scale is set by the frustum, but this distance still decides how
16-    // far every fragment is from the camera - which is what fog reads. Keep it
17-    // modest so linear fog has a usable range across the visible depth.
18-    this.distance = 42;
19-    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 160);
--
36:  /** Pivot the view around the player. `basis()` reads the offset, so the
37-   *  movement controls rotate with the camera and stay screen-relative. */
38-  orbit(radians) { this.targetAzimuth += radians; }
39-
40-  resize(aspect) {
41-    const h = this.viewSize / 2, w = h * aspect;
=== player consumption ===
127:  update(dt, axis, basis, revealed, mood = {}) {
130:      dx = basis.right.x * axis.x + basis.fwd.x * axis.y;
131:      dz = basis.right.z * axis.x + basis.fwd.z * axis.y;
```
</details>

My `f` had a spurious negation — `fwd` is already the movement-forward vector. Let me fix and verify the walk works before capturing again:

**`Bash`** — Fix sign, write walk test
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
sed -i '' 's|f: -(dx \* b.fwd.x + dz \* b.fwd.z),|f: dx * b.fwd.x + dz * b.fwd.z,|' $R/discovery.js
grep -n "f: dx" $R/discovery.js
rm -f $R/walktest.js
cat > $R/walktest.js <<'EOF'
async (page) => {
  const walkTo = async (target, opts = {}) => {
    const { timeout = 20000, stopAt = 1.2 } = opts;
    const t0 = Date.now(); let held = [];
    const trail = [];
    while (Date.now() - t0 < timeout) {
      const s = await page.evaluate(([tx, tz]) => {
        const g = window.__game, p = g.player.pos, b = g.cam.basis();
        const dx = tx - p.x, dz = tz - p.z;
        return { dist: Math.hypot(dx, dz),
                 f: dx * b.fwd.x + dz * b.fwd.z,
                 r: dx * b.right.x + dz * b.right.z };
      }, [target.x, target.z]);
      trail.push(+s.dist.toFixed(1));
      if (s.dist < stopAt) break;
      const m = Math.max(Math.abs(s.f), Math.abs(s.r)); const want = [];
      if (Math.abs(s.f) > m * 0.42) want.push(s.f > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(s.r) > m * 0.42) want.push(s.r > 0 ? 'KeyD' : 'KeyA');
      const same = want.length === held.length && want.every((k) => held.includes(k));
      if (!same) {
        for (const k of held) if (!want.includes(k)) await page.keyboard.up(k);
        for (const k of want) if (!held.includes(k)) await page.keyboard.down(k);
        held = want;
      }
      await page.waitForTimeout(60);
    }
    for (const k of held) await page.keyboard.up(k);
    return trail;
  };
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const plan = await page.evaluate(() => {
    const g = window.__game, p = g.player.pos;
    let best = null, bd = 1e9;
    for (const s of [...g.cavern.secrets.values()].filter((s) => s.level === 0)) {
      const w = g.grid.tileToWorld(0, s.tx, s.ty);
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    const nb = [[1,0],[-1,0],[0,1],[0,-
… [truncated]
```
<details><summary>result</summary>

```
43:                 f: dx * b.fwd.x + dz * b.fwd.z,
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"startDist":14.4,"trail":[12.8,11.9,11.9,11.8,11.8,11.8,11.5,11.1,10.6,10.3,9.9,9.5,9.2,8.8,8.5,8.3,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8],"counts":{"total":3,"found":0,"complete":false}}
### Ran Playwright code
``​`js
await (async (page) => {
  const walkTo = async (target, opts = {}) => {
    const { timeout = 20000, stopAt = 1.2 } = opts;
    const t0 = Date.now(); let held = [];
    const trail = [];
    while (Date.now() - t0 < timeout) {
      const s = await page.evaluate(([tx, tz]) => {
        const g = window.__game, p = g.player.pos, b = g.cam.basis();
        const dx = tx - p.x, dz = tz - p.z;
        return { dist: Math.hypot(dx, dz),
                 f: dx * b.fwd.x + dz * b.fwd.z,
                 r: dx * b.right.x + dz * b.right.z };
      }, [target.x, target.z]);
      trail.push(+s.dist.toFixed(1));
      if (s.dist < stopAt) break;
      const m = Math.max(Math.abs(s.f), Math.abs(s.r)); const want = [];
      if (Math.abs(s.f) > m * 0.42) want.push(s.f > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(s.r) > m * 0.42) want.push(s.r > 0 ? 'KeyD' : 'KeyA');
      const same = want.length === held.length && want.every((k) => held.includes(k));
      if (!same) {
        for (const k of held) if (!want.includes(k)) await page.keyboard.up(k);
        for (const k of want) if (!held.includes(k)) await page.keyboard.down(k);
        held = want;
      }
      await page.waitForTimeout(60);
    }
    for (const k of held) await page.keyboard.up(k);
    return trail;
  };
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const plan = await page.evaluate(() => {
    const g = window.__game, p = g.player.pos;
… [truncated]
```
</details>

He's walking into walls — a straight-line seek won't work in a cave. I need pathfinding on the grid:

**`Bash`** — Write pathfinding navigation snippet
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/nav.txt
cat > $R/nav.txt <<'EOF'
  // ---- navigation: BFS the tile grid, then walk the waypoints with real keys.
  // A straight-line seek walks into walls; the cave is not convex.
  const pathTo = (level, goalTile) => page.evaluate(([lvl, gx, gy]) => {
    const g = window.__game, grid = g.grid;
    const walk = (tx, ty) => {
      const c = grid.char(lvl, tx, ty);
      if ('.FT*P<>X'.includes(c)) return true;
      return c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`);
    };
    const s = grid.worldToTile(g.player.pos.x, g.player.pos.z);
    const key = (x, y) => y * grid.W + x;
    const prev = new Map(); const q = [[s.tx, s.ty]];
    prev.set(key(s.tx, s.ty), null);
    let hit = null;
    for (let i = 0; i < q.length && !hit; i++) {
      const [x, y] = q[i];
      if (x === gx && y === gy) { hit = [x, y]; break; }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.W || ny >= grid.H) continue;
        if (prev.has(key(nx, ny)) || !walk(nx, ny)) continue;
        prev.set(key(nx, ny), [x, y]); q.push([nx, ny]);
      }
    }
    if (!hit) return null;
    const back = []; let cur = hit;
    while (cur) { back.push(cur); cur = prev.get(key(cur[0], cur[1])); }
    back.reverse();
    // thin the path: keep a waypoint only where the direction changes, so he
    // walks long straight lines instead of stuttering tile to tile
    const pts = [];
    for (let i = 1; i < back.length; i++) {
      const a = back[i - 1], b = back[i], c = back[i + 1];
      if (!c || (c[0] - b[0]) !== (b[0] - a[0]) || (c[1] - b[1]) !== (b[1] - a[1])) {
        const w = grid.tileToWorld(lvl, b[0], b[1]);
        pts.push({ x: w.x, z: w.z });
      }
    }
    return pts;
  }, [level, goalTile.tx, goalTile.ty]);

  const seek = async (target, opts = {}) => {
    const { timeout = 9000, stopAt = 0.9 } = opts;
    const t0 = Date.now(); let held = []; let bestD = 1e9, stall = 0;
    while (Date.now() - t0 < timeout) {
      const s = await page.evaluate(([tx, tz]) => {
        const g = window.__game, p = g.player.pos, b = g.cam.basi
… [truncated]
```
<details><summary>result</summary>

```
nav snippet written
```
</details>

**`Bash`** — Assemble navigation test
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/navtest.js
{
cat <<'HEAD'
async (page) => {
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
HEAD
cat $R/nav.txt
cat <<'TAIL'
  const goal = await page.evaluate(() => {
    const g = window.__game, p = g.player.pos;
    let best = null, bd = 1e9;
    for (const s of [...g.cavern.secrets.values()].filter((s) => s.level === 0)) {
      const w = g.grid.tileToWorld(0, s.tx, s.ty);
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({tx:best.tx+dx, ty:best.ty+dy}))
      .find((t) => '.FT*P<>'.includes(g.grid.char(0, t.tx, t.ty)));
    return { tx: nb.tx, ty: nb.ty, startDist: bd };
  });
  const t0 = Date.now();
  const r = await walkPath(0, goal);
  await page.waitForTimeout(2500);
  return { goal, ...r, seconds: +((Date.now()-t0)/1000).toFixed(1),
           counts: await page.evaluate(() => window.__game.cavern.countOn(0)) };
}
TAIL
} > $R/navtest.js
node --check $R/navtest.js 2>/dev/null || echo "(bare fn, check n/a)"
wc -l $R/navtest.js
```
<details><summary>result</summary>

```
     102 ~/proj/me/learn/blender-mcp/.capture-tmp/navtest.js
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"goal":{"tx":10,"ty":18,"startDist":27.202941017470888},"ok":true,"legs":2,"seconds":11.5,"counts":{"total":2,"found":0,"complete":false}}
### Ran Playwright code
``​`js
await (async (page) => {
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  // ---- navigation: BFS the tile grid, then walk the waypoints with real keys.
  // A straight-line seek walks into walls; the cave is not convex.
  const pathTo = (level, goalTile) => page.evaluate(([lvl, gx, gy]) => {
    const g = window.__game, grid = g.grid;
    const walk = (tx, ty) => {
      const c = grid.char(lvl, tx, ty);
      if ('.FT*P<>X'.includes(c)) return true;
      return c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`);
    };
    const s = grid.worldToTile(g.player.pos.x, g.player.pos.z);
    const key = (x, y) => y * grid.W + x;
    const prev = new Map(); const q = [[s.tx, s.ty]];
    prev.set(key(s.tx, s.ty), null);
    let hit = null;
    for (let i = 0; i < q.length && !hit; i++) {
      const [x, y] = q[i];
      if (x === gx && y === gy) { hit = [x, y]; break; }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.W || ny >= grid.H) continue;
        if (prev.has(key(nx, ny)) || !walk(nx, ny)) continue;
        prev.set(key(nx, ny), [x, y]); q.push([nx, ny]);
      }
    }
    if (!hit) return null;
    const back = []; let cur = hit;
    while (cur) { back.push(cur); cur = prev.get(key(cur[0], cur[1])); }
    back.reverse();
    // thin the path: keep a waypoint only where the direction changes, so he
    // walks long straight lines instead of stuttering tile to tile
… [truncated]
```
</details>

`legs: 2` for a 27-unit path — the thinning is collapsing it. Let me instrument rather than guess:

**`Bash`** — Diagnose pathfinding
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/navdiag.js
cat > $R/navdiag.js <<'EOF'
async (page) => {
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  return await page.evaluate(() => {
    const g = window.__game, grid = g.grid;
    const out = {};
    out.hasChar = typeof grid.char;
    out.hasWorldToTile = typeof grid.worldToTile;
    const s = grid.worldToTile(g.player.pos.x, g.player.pos.z);
    out.playerTile = s;
    out.playerTileChar = grid.char(0, s.tx, s.ty);
    out.playerPos = { x: +g.player.pos.x.toFixed(2), z: +g.player.pos.z.toFixed(2) };
    const secrets = [...g.cavern.secrets.values()].filter((x) => x.level === 0);
    out.secretTiles = secrets.map((x) => ({ tx: x.tx, ty: x.ty }));
    // BFS
    const walk = (tx, ty) => '.FT*P<>X'.includes(grid.char(0, tx, ty));
    const key = (x, y) => y * grid.W + x;
    const prev = new Map(); const q = [[s.tx, s.ty]]; prev.set(key(s.tx, s.ty), null);
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx<0||ny<0||nx>=grid.W||ny>=grid.H) continue;
        if (prev.has(key(nx,ny)) || !walk(nx,ny)) continue;
        prev.set(key(nx,ny), [x,y]); q.push([nx,ny]);
      }
    }
    out.reachableTiles = prev.size;
    const nbOf = (sec) => [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy]) => ({tx:sec.tx+dx, ty:sec.ty+dy}))
      .filter((t) => '.FT*P<>X'.includes(grid.char(0, t.tx, t.ty)));
    out.perSecret = secrets.map((sec) => {
      const nbs = nbOf(sec);
      return { secret: {tx:sec.tx,ty:sec.ty},
               neighbours: nbs,
               reachable: nbs.map((n) => prev.has(key(n.tx,n.ty))),
               pathLen: nbs.map((n) => {
                 if (!prev.has(key(n.tx,n.ty))) return null;
                 let c = [n.tx,n.ty], L = 0;
                 while (c) { c = prev.get(key(c[0],c[1])); L++; }
             
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"hasChar":"function","hasWorldToTile":"function","playerTile":{"tx":33,"ty":26},"playerTileChar":"P","playerPos":{"x":27,"z":21},"secretTiles":[{"tx":4,"ty":12},{"tx":18,"ty":21},{"tx":16,"ty":26}],"reachableTiles":397,"perSecret":[{"secret":{"tx":4,"ty":12},"neighbours":[{"tx":4,"ty":13},{"tx":4,"ty":11}],"reachable":[true,false],"pathLen":[57,null]},{"secret":{"tx":18,"ty":21},"neighbours":[{"tx":19,"ty":21},{"tx":17,"ty":21},{"tx":18,"ty":22}],"reachable":[true,false,true],"pathLen":[20,null,20]},{"secret":{"tx":16,"ty":26},"neighbours":[{"tx":17,"ty":26},{"tx":15,"ty":26}],"reachable":[true,false],"pathLen":[19,null]}]}
### Ran Playwright code
``​`js
await (async (page) => {
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  return await page.evaluate(() => {
    const g = window.__game, grid = g.grid;
    const out = {};
    out.hasChar = typeof grid.char;
    out.hasWorldToTile = typeof grid.worldToTile;
    const s = grid.worldToTile(g.player.pos.x, g.player.pos.z);
    out.playerTile = s;
    out.playerTileChar = grid.char(0, s.tx, s.ty);
    out.playerPos = { x: +g.player.pos.x.toFixed(2), z: +g.player.pos.z.toFixed(2) };
    const secrets = [...g.cavern.secrets.values()].filter((x) => x.level === 0);
    out.secretTiles = secrets.map((x) => ({ tx: x.tx, ty: x.ty }));
    // BFS
    const walk = (tx, ty) => '.FT*P<>X'.includes(grid.char(0, tx, ty));
    const key = (x, y) => y * grid.W + x;
    const prev = new Map(); const q = [[s.tx, s.ty]]; prev.set(key(s.tx, s.ty), null);
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx<0||ny<0||nx>=grid.W||ny>=grid.H) continue;
        if (prev.has(key(nx,ny)) || !walk(nx,ny)) continue;
        prev.set(key(nx,ny), [x,y]); q.push([nx,ny]);
      }
    }
    out.reachableTiles = prev.size;
    const nbOf = (sec) => [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy]) => ({tx:sec.tx+dx, ty:sec.ty+dy}))
      .filter((t) => '.FT*P<>X'.includes(grid.char(0, t.tx, t.ty)));
    out.perSecret = secrets.map((sec) => {
      const nbs = nbOf(sec);
… [truncated]
```
</details>

Pathfinding itself is sound (397 tiles reachable, every secret has a reachable neighbour). The fragility is in long autonomous walks. Simpler and more reliable: place him a few tiles back along the real path *before* the camera rolls, then walk the last stretch with genuine key input:

**`Bash`** — Write shared capture/nav helpers
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/common.txt
cat > $R/common.txt <<'EOF'
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    await page.waitForTimeout(1200);
  };
  // BFS the tile grid and return the full tile path (not thinned).
  const tilePath = (lvl, goal) => page.evaluate(([lvl, gx, gy]) => {
    const g = window.__game, grid = g.grid;
    const walk = (tx, ty) => {
      const c = grid.char(lvl, tx, ty);
      return '.FT*P<>X'.includes(c) ||
             (c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));
    };
    const s = grid.worldToTile(g.player.pos.x, g.player.pos.z);
    const key = (x, y) => y * grid.W + x;
    const prev = new Map([[key(s.tx, s.ty), null]]); const q = [[s.tx, s.ty]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q
… [truncated]
```
<details><summary>result</summary>

```
ok
```
</details>

**`Bash`** — Assemble discovery clip script
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/clip_discovery.js
{
echo 'async (page) => {'
cat $R/common.txt
cat <<'TAIL'
  await boot(1000, 620);
  // the secret with the longest approach, so there is a real walk-up to film
  const goal = await page.evaluate(() => {
    const g = window.__game;
    const cands = [];
    for (const s of [...g.cavern.secrets.values()].filter((x) => x.level === 0)) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const t = { tx: s.tx + dx, ty: s.ty + dy };
        if ('.FT*P<>X'.includes(g.grid.char(0, t.tx, t.ty))) cands.push(t);
      }
    }
    return cands[0];
  });
  const path = await tilePath(0, goal);
  if (!path) return { error: 'no path to a secret' };
  const from = await stageAt(0, path, 9);          // ~9 tiles of approach
  const legs = [];
  for (let i = from + 2; i < path.length; i += 2) legs.push(path[i]);
  legs.push(path[path.length - 1]);

  const cast = await mkCast(90);
  await cast.start();
  await page.waitForTimeout(600);
  for (let i = 0; i < legs.length; i++) {
    const w = await toWorld(0, legs[i]);
    await seek(w, { stopAt: i === legs.length - 1 ? 0.7 : 1.0, timeout: 5000 });
  }
  await page.waitForTimeout(4600);      // reveal, bestowal orb, his reaction
  await cast.stop();
  await page.waitForTimeout(250);
  const wrote = await flush('discovery', cast.buf);
  return { pathLen: path.length, stagedFrom: from, legs: legs.length,
           frames: cast.buf.length, wrote,
           counts: await page.evaluate(() => window.__game.cavern.countOn(0)) };
}
TAIL
} > $R/clip_discovery.js
rm -rf $R/frames/discovery
wc -l $R/clip_discovery.js
```
<details><summary>result</summary>

```
     137 ~/proj/me/learn/blender-mcp/.capture-tmp/clip_discovery.js
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"error":"no path to a secret"}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    await page.waitForTimeout(1200);
  };
… [truncated]
```
</details>

`cands[0]` grabbed an unreachable neighbour. Let me pick the goal *by* reachability, choosing the longest approach for a better shot:

**`Bash`** — Rebuild with reachability-driven goal selection
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/plan.txt
cat > $R/plan.txt <<'EOF'
  // Choose which secret to film by REACHABILITY, then by the longest approach
  // (a longer walk-up makes a better shot). Some neighbours of a secret are
  // walled off; picking one blindly is how you end up with no path.
  const planToSecret = (lvl) => page.evaluate((lvl) => {
    const g = window.__game, grid = g.grid;
    const walk = (tx, ty) => {
      const c = grid.char(lvl, tx, ty);
      return '.FT*P<>X'.includes(c) ||
             (c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));
    };
    const s = grid.worldToTile(g.player.pos.x, g.player.pos.z);
    const key = (x, y) => y * grid.W + x;
    const prev = new Map([[key(s.tx, s.ty), null]]); const q = [[s.tx, s.ty]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx<0||ny<0||nx>=grid.W||ny>=grid.H) continue;
        if (prev.has(key(nx,ny)) || !walk(nx,ny)) continue;
        prev.set(key(nx,ny), [x,y]); q.push([nx,ny]);
      }
    }
    const trace = (tx, ty) => {
      if (!prev.has(key(tx, ty))) return null;
      const back = []; let cur = [tx, ty];
      while (cur) { back.push({ tx: cur[0], ty: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
      return back.reverse();
    };
    let best = null;
    for (const sec of [...g.cavern.secrets.values()].filter((x) => x.level === lvl && !x.done)) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const p = trace(sec.tx + dx, sec.ty + dy);
        if (p && (!best || p.length > best.path.length)) {
          best = { path: p, secret: { tx: sec.tx, ty: sec.ty } };
        }
      }
    }
    return best;
  }, lvl);
EOF
# rebuild the discovery clip around it
rm -f $R/clip_discovery.js
{
echo 'async (page) => {'
cat $R/common.txt
cat $R/plan.txt
cat <<'TAIL'
  await boot(1000, 620);
  const plan = await planToSecret(0);
  if (!plan) return { error: 'no reachable secret' };
  const path = plan.path;
  const from = await stageAt(0, path, 10);
  const legs = [];
  for (let i = from + 2; i < path.length; i += 2) 
… [truncated]
```
<details><summary>result</summary>

```
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"pathLen":48,"stagedFrom":37,"legs":6,"frames":254,"wrote":254,"counts":{"total":3,"found":0,"complete":false}}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    await page.waitForTimeout(1200);
  };
… [truncated]
```
</details>

Still `found: 0`. Let me stop guessing and look at what was actually captured:

**`Bash`** — Build contact sheet of captured frames
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
ls $R/frames/discovery | wc -l
cd $R/frames/discovery
# contact sheet: every 25th frame
magick montage $(ls f*.jpg | awk 'NR%25==1') -tile 5x -geometry 300x186+3+3 -background '#222' $R/sheet.png
identify $R/sheet.png
```
<details><summary>result</summary>

```
     254
montage: unable to read font `' @ error/annotate.c/RenderFreetype/1665.
~/proj/me/learn/blender-mcp/.capture-tmp/sheet.png PNG 1530x576 1530x576+0+0 16-bit sRGB 1.1754MiB 0.000u 0:00.000
```
</details>

**`Read`**

Now I can see it. Two things: he stalls against the wall, and — more importantly — my final waypoint was the tile *beside* the secret with `stopAt: 0.7`, which leaves him up to **2.7 units** from the secret centre. The reveal radius is **2.6**. He was stopping a hair too far away every time.

Let me target the secret itself and let collision stop him:

**`Bash`** — Target the secret directly on final approach
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
rm -f $R/clip_discovery.js
{
echo 'async (page) => {'
cat $R/common.txt
cat $R/plan.txt
cat <<'TAIL'
  await boot(1000, 620);
  const plan = await planToSecret(0);
  if (!plan) return { error: 'no reachable secret' };
  const path = plan.path;
  const from = await stageAt(0, path, 10);
  const legs = [];
  for (let i = from + 2; i < path.length; i += 2) legs.push(path[i]);

  const cast = await mkCast(90);
  await cast.start();
  await page.waitForTimeout(600);
  for (const t of legs) await seek(await toWorld(0, t), { stopAt: 1.0, timeout: 5000 });
  // Final approach targets the SECRET ITSELF, not the tile beside it. Stopping
  // 0.7 short of the neighbour leaves him up to 2.7 units from the secret and
  // the torch only opens what it comes within 2.6 of - so he would walk all
  // that way and nothing would happen. Collision stops him at the wall.
  const sw = await toWorld(0, plan.secret);
  await seek(sw, { stopAt: 1.3, timeout: 6000 });
  const opened = await page.evaluate(() => window.__game.cavern.countOn(0).found > 0);
  await page.waitForTimeout(4800);            // reveal, bestowal orb, reaction
  await cast.stop();
  await page.waitForTimeout(250);
  const wrote = await flush('discovery', cast.buf);
  const dist = await page.evaluate(([x, z]) => {
    const p = window.__game.player.pos; return Math.hypot(p.x - x, p.z - z);
  }, [sw.x, sw.z]);
  return { pathLen: path.length, legs: legs.length, frames: cast.buf.length, wrote,
           openedDuringWalk: opened, finalDistToSecret: +dist.toFixed(2),
           counts: await page.evaluate(() => window.__game.cavern.countOn(0)) };
}
TAIL
} > $R/clip_discovery.js
rm -rf $R/frames/discovery
echo assembled
```
<details><summary>result</summary>

```
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"pathLen":31,"legs":5,"frames":229,"wrote":229,"openedDuringWalk":true,"finalDistToSecret":1.23,"counts":{"total":2,"found":1,"complete":false}}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    await page.waitForTimeout(1200);
  };
… [truncated]
```
</details>

`openedDuringWalk: true` — the reveal happened on camera. Let me build the GIF and look at it:

**`Bash`** — Build discovery GIF and inspect the reveal
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
rm -f discovery.gif palette.png
ffmpeg -y -framerate 20 -i frames/discovery/f%05d.jpg -vf "fps=16,scale=720:-1:flags=lanczos,palettegen=max_colors=180:stats_mode=diff" palette.png -loglevel error
ffmpeg -y -framerate 20 -i frames/discovery/f%05d.jpg -i palette.png -lavfi "fps=16,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" discovery.gif -loglevel error
ls -lh discovery.gif
# contact sheet of the final third: the reveal and the bestowal
cd frames/discovery
magick montage $(ls f*.jpg | tail -90 | awk 'NR%9==1') -tile 5x2 -geometry 320x198+3+3 -background '#222' $R/sheet2.png 2>/dev/null
identify $R/sheet2.png
```
<details><summary>result</summary>

```
-rw-r--r--@ 1 apshoemaker  staff   6.7M Sep  6 14:08 discovery.gif
~/proj/me/learn/blender-mcp/.capture-tmp/sheet2.png PNG 1630x408 1630x408+0+0 16-bit sRGB 500455B 0.000u 0:00.000
```
</details>

**`Read`**

The reveal and the knowledge card both landed on camera. Two problems for README use: 6.7MB is too big for a repo, and at the shipped camera distance the boy is only ~7% of frame height, so the mechanics are hard to read. Let me compare framings before committing:

**`Bash`** — Capture framing comparison
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
rm -f $R/framing.js
cat > $R/framing.js <<'EOF'
async (page) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const client = await page.context().newCDPSession(page);
  const shots = {};
  for (const vs of [20, 16, 13, 10]) {
    await page.evaluate((vs) => {
      const c = window.__game.cam;
      c.viewSize = vs;
      c.resize(innerWidth / innerHeight);
    }, vs);
    await page.waitForTimeout(600);
    const frames = [];
    const onF = ({ data, sessionId }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      frames.push(data);
    };
    client.on('Page.screencastFrame', onF);
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 92 });
    await page.waitForTimeout(700);
    await client.send('Page.stopScreencast').catch(() => {});
    client.off('Page.screencastFrame', onF);
    shots[vs] = frames[frames.length - 1];
  }
  const sent = await page.evaluate(async (shots) => {
    const frames = Object.entries(shots).map(([vs, d], i) => ({ i, d }));
    const r = await fetch('http://localhost:9099/', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ dir: 'framing', frames }),
    });
    return (await r.json()).wrote;
  }, shots);
  return { sent, order: [20, 16, 13, 10] };
}
EOF
rm -rf $R/frames/framing
echo ok
```
<details><summary>result</summary>

```
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"sent":4,"order":[20,16,13,10]}
### Ran Playwright code
``​`js
await (async (page) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const client = await page.context().newCDPSession(page);
  const shots = {};
  for (const vs of [20, 16, 13, 10]) {
    await page.evaluate((vs) => {
      const c = window.__game.cam;
      c.viewSize = vs;
      c.resize(innerWidth / innerHeight);
    }, vs);
    await page.waitForTimeout(600);
    const frames = [];
    const onF = ({ data, sessionId }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      frames.push(data);
    };
    client.on('Page.screencastFrame', onF);
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 92 });
    await page.waitForTimeout(700);
    await client.send('Page.stopScreencast').catch(() => {});
    client.off('Page.screencastFrame', onF);
    shots[vs] = frames[frames.length - 1];
  }
  const sent = await page.evaluate(async (shots) => {
    const frames = Object.entries(shots).map(([vs, d], i) => ({ i, d }));
    const r = await fetch('http://localhost:9099/', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ dir: 'framing', frames }),
    });
    return (await r.json()).wrote;
  }, shots);
  return { sent, order: [20, 16, 13, 10] };
… [truncated]
```
</details>

**`Bash`** — Montage framing options
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/framing && ls
magick montage f00000.jpg f00001.jpg f00002.jpg f00003.jpg -tile 2x2 -geometry 600x350+4+4 -background '#111' $R/framing.png
identify $R/framing.png
```
<details><summary>result</summary>

```
f00000.jpg
f00001.jpg
f00002.jpg
f00003.jpg
montage: unable to read font `' @ error/annotate.c/RenderFreetype/1665.
~/proj/me/learn/blender-mcp/.capture-tmp/framing.png PNG 1216x716 1216x716+0+0 16-bit sRGB 1.17373MiB 0.000u 0:00.000
```
</details>

**`Read`**

The four framings look nearly identical, which shouldn't be. Let me verify numerically rather than by eye:

**`Bash`** — Numerically probe zoom effect
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
rm -f $R/zoomprobe.js
cat > $R/zoomprobe.js <<'EOF'
async (page) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  const out = [];
  for (const vs of [20, 13, 8]) {
    out.push(await page.evaluate((vs) => {
      const g = window.__game, c = g.cam;
      c.viewSize = vs;
      c.resize(innerWidth / innerHeight);
      const cam = c.camera;
      // project the player's head and feet to screen space to measure him
      const THREE = g.player.root.position.constructor;
      const p = g.player.pos;
      const feet = new THREE(p.x, p.y, p.z).project(cam);
      const head = new THREE(p.x, p.y + 1.6, p.z).project(cam);
      return { viewSize: vs, top: +cam.top.toFixed(2), right: +cam.right.toFixed(2),
               boyPx: Math.round(Math.abs(head.y - feet.y) / 2 * innerHeight) };
    }, vs));
  }
  return out;
}
EOF
echo ok
```
<details><summary>result</summary>

```
ok
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
[{"viewSize":20,"top":10,"right":17.14,"boyPx":44},{"viewSize":13,"top":6.5,"right":11.14,"boyPx":68},{"viewSize":8,"top":4,"right":6.86,"boyPx":111}]
### Ran Playwright code
``​`js
await (async (page) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.props
    && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  const out = [];
  for (const vs of [20, 13, 8]) {
    out.push(await page.evaluate((vs) => {
      const g = window.__game, c = g.cam;
      c.viewSize = vs;
      c.resize(innerWidth / innerHeight);
      const cam = c.camera;
      // project the player's head and feet to screen space to measure him
      const THREE = g.player.root.position.constructor;
      const p = g.player.pos;
      const feet = new THREE(p.x, p.y, p.z).project(cam);
      const head = new THREE(p.x, p.y + 1.6, p.z).project(cam);
      return { viewSize: vs, top: +cam.top.toFixed(2), right: +cam.right.toFixed(2),
               boyPx: Math.round(Math.abs(head.y - feet.y) / 2 * innerHeight) };
    }, vs));
  }
  return out;
}
)(page);
``​`
### Events
- New console entries: .playwright-mcp/console-2026-09-06T19-56-05-110Z.log#L25-L26
```
</details>

The zoom works — I misread the montage (boy is 44px at viewSize 20, 68px at 13). Let me set up the final capture with a closer framing for legibility, and check how the minimap expands:

**`Bash`** — Find minimap hover markup
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "minimap" index.html | head -20
```
<details><summary>result</summary>

```
78:  /* ---------------------------------------------------------- minimap */
91:  #minimap {
209:    <canvas id="minimap"></canvas>
```
</details>

**`Bash`** — Read minimap styles
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '78,100p' index.html; echo "---"; sed -n '205,212p' index.html
```
<details><summary>result</summary>

```
  /* ---------------------------------------------------------- minimap */
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
    /* the unexplored ground: a faint hatch, quiet enough to read as fog
       rather than as a pattern competing with the map */
    background:
      repeating-linear-gradient(45deg, #0c0e13 0 7px, #0a0c10 7px 14px);
  }
  #map-label {
    position: absolute; left: 10px; bottom: 9px;
---
    <div id="sense"><div id="sense-fill"></div></div>
    <div class="row">passages here <b id="found">0/0</b> · embers <b id="embers">0</b></div>
  </div>
  <div id="map">
    <canvas id="minimap"></canvas>
    <div id="map-label">1/3</div>
  </div>
  <div id="hint"></div>
```
</details>

Now the final capture scripts. Discovery first, with the closer framing:

**`Bash`** — Add framing control, rebuild discovery clip
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
# boot now takes a camera framing: media is shot closer than the shipped
# viewSize so the boy and the mechanics are legible at GIF size.
python3 - <<PY
p="$R/common.txt"; s=open(p).read()
old = """  const boot = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    await page.waitForTimeout(1200);
  };"""
new = """  const boot = async (w, h, viewSize) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    // Media framing. The shipped camera sits at viewSize 20, which puts the boy
    // at ~44px in a 700px viewport - unreadable once it is a 720px-wide GIF.
    // Nothing about the lighting or the mechanics is touched, only how close
    // the camera stands.
    if (viewSize) await page.evaluate((vs) => {
      window.__game.cam.viewSize = vs;
      window.__game.cam.resize(innerWidth / innerHeight);
    }, viewSize);
    await page.waitForTimeout(1200);
  };"""
assert old in s
open(p,'w').write(s.replace(old,new,1)); print('boot updated')
PY
# rebuild discovery with framing + trimmed tail
rm -f $R/clip_discovery.js
{
echo 'async (page) => {'
cat $R/common.txt
cat $R/plan.txt
cat <<'TAIL'
  await boot(1000, 620, 13);
  const plan = await planToSecret(0);
  if (!plan) return { error: 'no reachable secret' };
  const path = plan.path;
  const from = await stageAt(0, path, 8);
  const legs = [];
  for (let i = from + 2; i < path.length; i += 2) legs.push(path[i]);

  const cast = await mkCast(88);
  await cast.start();
  await page.waitForTimeout(500);
  for (const t of legs) await seek(await toWorld(0, t), { stopAt: 1.0, timeout: 4500 });
  const sw = await toWorld(0, plan.secret);
  await seek(sw, { stopAt: 1.3, timeout: 6000 });
  const opened = await
… [truncated]
```
<details><summary>result</summary>

```
boot updated
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"frames":177,"wrote":177,"openedDuringWalk":true,"counts":{"total":3,"found":1,"complete":false}}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h, viewSize) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    // Media framing. The shipped camera sits at viewSize 20, which puts the boy
    // at ~44px in a 700px viewport - unreadable once it is a 720px-wide GIF.
… [truncated]
```
</details>

**`Bash`** — Build discovery GIF at new framing
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
mkgif() {  # dir out width fps
  local d=$1 o=$2 w=$3 f=$4
  ffmpeg -y -framerate 20 -i frames/$d/f%05d.jpg -vf "fps=$f,scale=$w:-1:flags=lanczos,palettegen=max_colors=160:stats_mode=diff" /tmp/pal.png -loglevel error
  ffmpeg -y -framerate 20 -i frames/$d/f%05d.jpg -i /tmp/pal.png -lavfi "fps=$f,scale=$w:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" $o -loglevel error
  ls -lh $o | awk '{print $9, $5}'
}
mkgif discovery discovery.gif 720 14
cd frames/discovery
magick montage $(ls f*.jpg | awk 'NR%14==1') -tile 4x -geometry 330x205+3+3 -background '#181818' $R/sheet_disc.png 2>/dev/null
identify $R/sheet_disc.png
```
<details><summary>result</summary>

```
discovery.gif 5.2M
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_disc.png PNG 1344x844 1344x844+0+0 16-bit sRGB 1.70072MiB 0.000u 0:00.000
```
</details>

**`Read`**

That's the whole core loop in one clip — sense bar filling, the wall dissolving, "something gives here", the passage opening, and the knowledge card. Now it just needs to be repo-sized. Let me tune the encode:

**`Bash`** — Compare GIF encode settings and MP4
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
try() { # width fps colors bayer label
  local w=$1 f=$2 c=$3 b=$4 l=$5
  ffmpeg -y -framerate 20 -i frames/discovery/f%05d.jpg -vf "fps=$f,scale=$w:-1:flags=lanczos,palettegen=max_colors=$c:stats_mode=diff" /tmp/p.png -loglevel error
  ffmpeg -y -framerate 20 -i frames/discovery/f%05d.jpg -i /tmp/p.png -lavfi "fps=$f,scale=$w:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=$b:diff_mode=rectangle" /tmp/t.gif -loglevel error
  printf "%-28s %s\n" "$l" "$(du -h /tmp/t.gif | cut -f1)"
}
try 720 14 160 4 "720w 14fps 160c b4 (current)"
try 640 12 128 5 "640w 12fps 128c b5"
try 600 12 128 5 "600w 12fps 128c b5"
try 640 12 96  5 "640w 12fps  96c b5"
try 560 12 128 5 "560w 12fps 128c b5"
echo "--- also: mp4 for comparison ---"
ffmpeg -y -framerate 20 -i frames/discovery/f%05d.jpg -vf "scale=720:-2" -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart /tmp/t.mp4 -loglevel error
du -h /tmp/t.mp4 | cut -f1
```
<details><summary>result</summary>

```
720w 14fps 160c b4 (current) 5.1M
640w 12fps 128c b5           3.3M
600w 12fps 128c b5           3.3M
640w 12fps  96c b5           3.3M
560w 12fps 128c b5           3.3M
--- also: mp4 for comparison ---
148K
```
</details>

All showing 3.3M is suspicious — let me get exact bytes:

**`Bash`** — Exact GIF sizes per setting
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
try() {
  local w=$1 f=$2 c=$3 b=$4
  ffmpeg -y -framerate 20 -i frames/discovery/f%05d.jpg -vf "fps=$f,scale=$w:-1:flags=lanczos,palettegen=max_colors=$c:stats_mode=diff" /tmp/p.png -loglevel error
  ffmpeg -y -framerate 20 -i frames/discovery/f%05d.jpg -i /tmp/p.png -lavfi "fps=$f,scale=$w:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=$b:diff_mode=rectangle" /tmp/t_$w_$f_$c.gif -loglevel error
  printf "%4sw %2sfps %3sc b%s  %8s bytes  %s\n" "$w" "$f" "$c" "$b" "$(stat -f%z /tmp/t_$w_$f_$c.gif)" "$(identify -format '%wx%h %n frames' /tmp/t_$w_$f_$c.gif 2>/dev/null | head -1)"
}
try 720 14 160 4
try 640 12 128 5
try 560 12 128 5
try 480 12 128 5
try 640 10 96 5
```
<details><summary>result</summary>

```
 720w 14fps 160c b4   5374484 bytes  720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x435 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x444 124 frames720x446 124 frames720x446 124 frames720x443 124 frames720x443 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x437 124 frames720x437 124 frames720x430 124 frames720x431 124 frames720x437 124 frames720x438 124 frames720x438 124 frames720x437 124 frames720x443 124 frames720x443 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x445 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x444 124 frames720x444 124 frames720x446 124 frames720x442 124 frames720x443 124 frames720x445 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x445 124 frames720x446 124 frames720x446 124 frames715x446 124 frames720x444 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x435 124 frames720x446 124 frames720x446 124 frames720x446 124 frames720x444 124 frames720x440 124 frames720x444 124 frames720x444 124 frames720x444 124 frames
 640w 12fps 128c b5   3441901 bytes  640x397 106 frames640x397 106 frames640x397 106 frames640x397 106 frames640x397 106 frames640x397 106 frames640x387 106 frames640x397 106 frames640x397 106 frames640x397 106 frames640x397 106 frames640x397 106 frames640x396 106 frames640x397 106 frames640x397 106 frames640x397 106 frames640x3
… [truncated]
```
</details>

Sizes are workable at 600w/12fps (~2.8MB). Now clip 2 — the gate: the stairs refusing to appear until every passage is found. The tricky part is keeping the stairs on screen when they rise, since the camera follows the boy:

**`Bash`** — Write the gate clip
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
rm -f $R/clip_gate.js
{
echo 'async (page) => {'
cat $R/common.txt
cat <<'TAIL'
  // Everything on this level except ONE passage is opened before the camera
  // rolls, and the one left is the one nearest the stairs - so when it opens
  // and the way up rises out of the floor, the stairs are still on screen.
  // The camera follows the boy; a payoff he is 30 units away from is a payoff
  // nobody sees.
  const prep = async () => {
    const info = await page.evaluate(() => {
      const g = window.__game;
      const st = g.grid.find(0, '>')[0];
      const sw = g.grid.tileToWorld(0, st.tx, st.ty);
      const secrets = [...g.cavern.secrets.values()].filter((s) => s.level === 0);
      const withD = secrets.map((s) => {
        const w = g.grid.tileToWorld(0, s.tx, s.ty);
        return { tx: s.tx, ty: s.ty, d: Math.hypot(w.x - sw.x, w.z - sw.z) };
      }).sort((a, b) => a.d - b.d);
      return { stairs: st, keep: withD[0], others: withD.slice(1) };
    });
    for (const s of info.others) {
      const nb = await page.evaluate(([tx, ty]) => {
        const g = window.__game;
        const n = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({tx:tx+dx, ty:ty+dy}))
          .find((t) => '.FT*P<>X'.includes(g.grid.char(0, t.tx, t.ty)));
        if (n) g.player.placeAt(0, n.tx, n.ty);
        return !!n;
      }, [s.tx, s.ty]);
      await page.waitForTimeout(1400);
    }
    await page.waitForTimeout(3200);        // let the last bestowal and toast clear
    return info;
  };

  await boot(1000, 620, 13);
  const info = await prep();
  const counts = await page.evaluate(() => window.__game.cavern.countOn(0));
  // stand him a couple of tiles off the stairs so he walks onto them on camera
  const stairsW = await toWorld(0, info.stairs);
  await page.evaluate(([tx, ty]) => {
    const g = window.__game;
    const n = [[3,0],[-3,0],[0,3],[0,-3],[2,2],[-2,-2]]
      .map(([dx,dy]) => ({tx:tx+dx, ty:ty+dy}))
      .find((t) => '.FT*'.includes(g.grid.char(0, t.tx, t.ty)));
    if (n) g.player.placeAt(0, n.tx, n.ty);
  }, [info.stairs.tx, info.stairs.ty]);
  await page.waitForTimeout(600);

  const cast = await mkCast(88
… [truncated]
```
<details><summary>result</summary>

```
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"startCounts":{"total":3,"found":2,"complete":false},"hint":"the way is shut — 1 passage still hidden here","afterCounts":{"total":3,"found":2,"complete":false},"stillSealed":true,"frames":321,"wrote":321}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h, viewSize) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    // Media framing. The shipped camera sits at viewSize 20, which puts the boy
    // at ~44px in a 700px viewport - unreadable once it is a 720px-wide GIF.
… [truncated]
```
</details>

The hint captured perfectly, but the walk to the last secret failed again — straight-line `seek` with no pathfinding. Let me add a proper path-following helper and use it everywhere:

**`Bash`** — Add goTo path-follower, rebuild gate clip
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
python3 - <<PY
p="$R/common.txt"; s=open(p).read()
add = """
  // Path-follow to a tile: BFS the grid, walk the corners, then close the last
  // gap directly. Every straight-line walk in this repo's capture scripts that
  // skipped the BFS ended up pressed against a wall - the caves are not convex.
  const goTo = async (lvl, tile, opts = {}) => {
    const path = await page.evaluate(([lvl, gx, gy]) => {
      const g = window.__game, grid = g.grid;
      const walk = (tx, ty) => {
        const c = grid.char(lvl, tx, ty);
        return '.FT*P<>X'.includes(c) ||
               (c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));
      };
      const s = grid.worldToTile(g.player.pos.x, g.player.pos.z);
      const key = (x, y) => y * grid.W + x;
      const prev = new Map([[key(s.tx, s.ty), null]]); const q = [[s.tx, s.ty]];
      for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i];
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x+dx, ny = y+dy;
          if (nx<0||ny<0||nx>=grid.W||ny>=grid.H) continue;
          if (prev.has(key(nx,ny)) || !walk(nx,ny)) continue;
          prev.set(key(nx,ny), [x,y]); q.push([nx,ny]);
        }
      }
      // the goal may itself be solid (a secret); in that case aim at the
      // reachable neighbour closest to it and let the torch do the rest
      let goal = [gx, gy];
      if (!prev.has(key(gx, gy))) {
        const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => [gx+dx, gy+dy])
          .filter(([x,y]) => prev.has(key(x,y)));
        if (!nb.length) return null;
        goal = nb[0];
      }
      const back = []; let cur = goal;
      while (cur) { back.push({ tx: cur[0], ty: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
      back.reverse();
      const pts = [];
      for (let i = 1; i < back.length; i++) {
        const a = back[i-1], b = back[i], c = back[i+1];
        if (!c || (c.tx-b.tx) !== (b.tx-a.tx) || (c.ty-b.ty) !== (b.ty-a.ty)) pts.push(b);
      }
      return pts;
    }, [lvl, tile.tx, tile.ty]);
    if (!path) return { ok: false };
    for (const t of path) await seek(await toWorld(lvl, t), { sto
… [truncated]
```
<details><summary>result</summary>

```
(eval):2: command not found: :,
goTo added
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"before":{"total":2,"found":1,"complete":false},"hint":"","afterOpening":{"total":2,"found":2,"complete":true},"stillSealed":false,"legsToSecret":{"ok":true,"legs":1},"frames":612,"wrote":612}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h, viewSize) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    // Media framing. The shipped camera sits at viewSize 20, which puts the boy
    // at ~44px in a 700px viewport - unreadable once it is a 720px-wide GIF.
… [truncated]
```
</details>

Two problems. First, a real bug I introduced: an unquoted heredoc let the shell eat a template literal, so `goTo` can't path through already-opened secret doorways:

**`Bash`** — Fix shell-mangled template literal
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
grep -n "revealed.has" $R/common.txt
python3 - <<'PY'
p="~/proj/me/learn/blender-mcp/.capture-tmp/common.txt"
s=open(p).read()
bad = "(c === 'S' && g.cavern.revealed.has());"
good = "(c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));"
assert bad in s, "expected the shell-mangled line"
s = s.replace(bad, good)
open(p,'w').write(s)
print("fixed:", good)
PY
grep -n "revealed.has" $R/common.txt
```
<details><summary>result</summary>

```
50:             (c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));
120:               (c === 'S' && g.cavern.revealed.has());
fixed: (c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));
50:             (c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));
120:               (c === 'S' && g.cavern.revealed.has(`${lvl}:${tx},${ty}`));
```
</details>

**`Bash`** — Contact sheet of gate clip
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/gate
ls | wc -l
magick montage $(ls f*.jpg | awk 'NR%38==1') -tile 4x -geometry 300x186+3+3 -background '#181818' $R/sheet_gate.png 2>/dev/null
identify $R/sheet_gate.png | head -1
```
<details><summary>result</summary>

```
     612
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_gate.png PNG 1224x960 1224x960+0+0 16-bit sRGB 1.38362MiB 0.000u 0:00.000
```
</details>

**`Read`**

The payoff reads — "The last passage opens…", the knowledge card, then "Nothing is hidden here now. A way up opens." But 612 frames is 30s, most of it walking. Let me trim to the window that matters:

**`Bash`** — Locate the payoff window by toast brightness
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/gate
# find the frames where the payoff toast is on screen by looking for the bright
# toast pill: cheap proxy = mean brightness of the toast strip region
for i in 150 200 250 300 350 400 450 500; do
  f=$(printf "f%05d.jpg" $i)
  [ -f "$f" ] && echo "$i $(magick $f -crop 100%x8%+0+52% +repage -format '%[fx:mean]' info:)"
done
```
<details><summary>result</summary>

```
150 0.0402185
200 0.05107
250 0.0371867
300 0.037112
350 0.0370727
400 0.0379663
450 0.0369222
500 0.036917
```
</details>

**`Bash`** — Inspect the stairs-rising moment
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/gate
magick montage f00270.jpg f00280.jpg f00290.jpg f00300.jpg f00310.jpg f00320.jpg f00330.jpg f00345.jpg -tile 4x2 -geometry 380x236+3+3 -background '#181818' $R/sheet_rise.png 2>/dev/null
identify $R/sheet_rise.png | head -1
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_rise.png PNG 1544x484 1544x484+0+0 16-bit sRGB 542656B 0.000u 0:00.000
```
</details>

**`Read`**

The counter reads 2/2 and the stairs marker appears on the minimap, but the staircase itself is off-screen — he's still at the passage he just opened. Let me check whether the tail of the capture got him to it:

**`Bash`** — Inspect tail of gate clip
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/gate
magick montage f00420.jpg f00460.jpg f00500.jpg f00540.jpg f00570.jpg f00600.jpg -tile 3x2 -geometry 460x285+3+3 -background '#181818' $R/sheet_tail.png 2>/dev/null
identify $R/sheet_tail.png | head -1
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_tail.png PNG 1398x582 1398x582+0+0 16-bit sRGB 668232B 0.000u 0:00.000
```
</details>

**`Read`**

The gate clip's best window is the passage→knowledge→"a way up opens" beat; the staircase itself never comes into frame. I'll trim to that. Now the ending — let me check its timing so I capture the whole arc:

**`Bash`** — Read ascension timing
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "const [A-Z_]* =\|phase\|finished" src/game/Ascension.js | head -25
```
<details><summary>result</summary>

```
6: * Five phases. Control is taken from the player at the first, because this is
18:const APPROACH = 2.4;
19:const BRIGHTEN = APPROACH + 1.3;
20:const DISSOLVE = BRIGHTEN + 2.8;
21:const WHITE = DISSOLVE + 1.6;
23:const MOTES = 420;
80:  get phase() {
101:  /** @returns {{ whiteout:number, finished:boolean }} */
103:    if (!this.active) return { whiteout: 0, finished: this.done };
163:    return { whiteout, finished: this.done };
```
</details>

**`Bash`** — Write the ending clip capture
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/clip_ending.js
{
echo 'async (page) => {'
cat $R/common.txt
cat <<'TAIL'
  // Clear every level off camera, so the capture opens on the last few steps.
  const clearLevel = async (lvl) => {
    for (;;) {
      const next = await page.evaluate((lvl) => {
        const g = window.__game;
        const s = [...g.cavern.secrets.values()].find((x) => x.level === lvl && !x.done);
        if (!s) return null;
        const n = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({tx:s.tx+dx, ty:s.ty+dy}))
          .find((t) => '.FT*P<>X'.includes(g.grid.char(lvl, t.tx, t.ty)));
        if (n) g.player.placeAt(lvl, n.tx, n.ty);
        return !!n;
      }, lvl);
      if (next === null) break;
      await page.waitForTimeout(1200);
    }
    await page.waitForTimeout(3600);         // the unseal, and the toast clearing
  };

  await boot(1060, 640, 14);
  await clearLevel(0);
  await page.evaluate(() => {
    const g = window.__game, t = g.grid.find(0, '>')[0];
    g.player.placeAt(0, t.tx, t.ty);
  });
  await page.waitForTimeout(2200);
  await clearLevel(1);
  await page.evaluate(() => {
    const g = window.__game, t = g.grid.find(1, '>')[0];
    g.player.placeAt(1, t.tx, t.ty);
  });
  await page.waitForTimeout(2200);
  await clearLevel(2);
  const lvl = await page.evaluate(() => window.__game.game.level);
  if (lvl !== 2) return { error: 'did not reach the last cavern', lvl };

  // stand a few tiles off the daylight so he walks the last steps himself
  const exit = await page.evaluate(() => {
    const g = window.__game, x = g.grid.find(2, 'X')[0];
    const n = [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,-3],[5,0],[0,5]]
      .map(([dx,dy]) => ({tx:x.tx+dx, ty:x.ty+dy}))
      .find((t) => '.FT*'.includes(g.grid.char(2, t.tx, t.ty)));
    if (n) g.player.placeAt(2, n.tx, n.ty);
    return x;
  });
  await page.waitForTimeout(900);

  const cast = await mkCast(88);
  await cast.start();
  await page.waitForTimeout(600);
  const markWalk = cast.buf.length;
  await goTo(2, exit, { stopAt: 1.0 });
  const markTouch = cast.buf.length;
  // ascension runs 8.1s to full white, then the end card, then Claude writes
  // the last pa
… [truncated]
```
<details><summary>result</summary>

```
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"marks":{"markWalk":12,"markTouch":72,"markEnded":207,"markText":278,"markButton":498},"frames":530,"wrote":530,"won":true,"ending":"The last way opened without resistance, as if the rock had been waiting to stop pretending it wasn't a door, and something old and unbothered settled into him like sediment. He climbed toward the light with a darkness that was no longer unexplained, only his — and the light, when it touched him, did not flinch, which frightened him more than if it had."}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h, viewSize) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    // Media framing. The shipped camera sits at viewSize 20, which puts the boy
    // at ~44px in a 700px viewport - unreadable once it is a 720px-wide GIF.
… [truncated]
```
</details>

Full ending captured with timing marks. The 11s of static end-card while waiting for the button is dead air, so I'll cut it out. Let me build all three GIFs:

**`Bash`** — Build all three GIFs
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
rm -f $R/build_gif.sh
cat > $R/build_gif.sh <<'EOF'
#!/bin/bash
# build_gif.sh <srcdir> <out.gif> <width> <fps> <range...>
# Ranges are "start-end" frame indices; several are concatenated, which is how
# dead air (waiting on the network) gets cut without showing a frozen screen.
set -e
src=$1; out=$2; w=$3; fps=$4; shift 4
seq=$(mktemp -d)
n=0
for range in "$@"; do
  a=${range%-*}; b=${range#*-}
  for ((i=a; i<=b; i++)); do
    f=$(printf "%s/f%05d.jpg" "$src" "$i")
    [ -f "$f" ] && cp "$f" "$(printf "%s/s%05d.jpg" "$seq" "$n")" && n=$((n+1))
  done
done
ffmpeg -y -framerate 20 -i "$seq/s%05d.jpg" \
  -vf "fps=$fps,scale=$w:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" \
  "$seq/pal.png" -loglevel error
ffmpeg -y -framerate 20 -i "$seq/s%05d.jpg" -i "$seq/pal.png" \
  -lavfi "fps=$fps,scale=$w:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$out" -loglevel error
echo "$(basename $out): $n src frames -> $(identify -format '%wx%h' "$out" | head -c 12), $(stat -f%z "$out" | awk '{printf "%.1fMB", $1/1048576}')"
rm -rf "$seq"
EOF
chmod +x $R/build_gif.sh
mkdir -p ~/proj/me/learn/blender-mcp/cavern-game/docs/media
M=~/proj/me/learn/blender-mcp/cavern-game/docs/media
$R/build_gif.sh $R/frames/discovery $M/discovery.gif 600 12 0-176
$R/build_gif.sh $R/frames/gate      $M/gate.gif      600 12 195-360
$R/build_gif.sh $R/frames/ending    $M/ending.gif    600 12 45-295 495-528
ls -lh $M
```
<details><summary>result</summary>

```
discovery.gif: 177 src frames -> 600x372600x3, 3.0MB
gate.gif: 166 src frames -> 600x372600x3, 1.6MB
ending.gif: 285 src frames -> 600x362540x3, 2.3MB
total 14152
-rw-r--r--@ 1 apshoemaker  staff   3.0M Sep  6 14:17 discovery.gif
-rw-r--r--@ 1 apshoemaker  staff   2.3M Sep  6 14:17 ending.gif
-rw-r--r--@ 1 apshoemaker  staff   1.6M Sep  6 14:17 gate.gif
```
</details>

6.9MB total — workable. Now the hero image. Let me extend the sink for lossless PNG and grab candidate stills at high resolution:

**`Bash`** — Set up hero still capture
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
python3 - <<'PY'
p="~/proj/me/learn/blender-mcp/.capture-tmp/sink.mjs"
s=open(p).read()
old = """      const { dir, frames } = JSON.parse(body);"""
new = """      const { dir, frames, ext = 'jpg' } = JSON.parse(body);"""
assert old in s; s = s.replace(old, new, 1)
old = """        fs.writeFileSync(path.join(out, `f${String(f.i).padStart(5, '0')}.jpg`),
                         Buffer.from(f.d, 'base64'));"""
new = """        fs.writeFileSync(path.join(out, `f${String(f.i).padStart(5, '0')}.${ext}`),
                         Buffer.from(f.d, 'base64'));"""
assert old in s; s = s.replace(old, new, 1)
open(p,'w').write(s); print('sink accepts ext')
PY
pkill -f "capture-tmp/sink.mjs" 2>/dev/null; sleep 0.5
(node $R/sink.mjs >| $R/sink.log 2>&1 &) ; sleep 1.2; cat $R/sink.log

rm -f $R/hero.js
{
echo 'async (page) => {'
cat $R/common.txt
cat $R/plan.txt
cat <<'TAIL'
  // Hero stills: lossless PNG via page.screenshot (the screencast is JPEG).
  const shot = async (name) => {
    const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
    await page.evaluate(async ([n, d]) => {
      await fetch('http://localhost:9099/', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ dir: 'hero', ext: 'png', frames: [{ i: n, d }] }),
      });
    }, [name, b64]);
    return b64.length;
  };

  await boot(1600, 900, 13);
  const plan = await planToSecret(0);
  if (!plan) return { error: 'no reachable secret' };
  const sizes = {};
  // 0: walking the dark, torch only
  await stageAt(0, plan.path, 12);
  await page.waitForTimeout(900);
  sizes[0] = await shot(0);
  // 1: closer, the flame has started to sense the wall
  await stageAt(0, plan.path, 4);
  await page.waitForTimeout(900);
  sizes[1] = await shot(1);
  // 2 & 3: the passage opening, and the knowledge rising into him
  const sw = await toWorld(0, plan.secret);
  await seek(sw, { stopAt: 1.3, timeout: 8000 });
  await page.waitForTimeout(700);
  sizes[2] = await shot(2);
  await page.waitForTimeout(800);
  sizes[3] = await shot(3);
  await page.waitForTimeout(1100);
  sizes[4] = await shot(4);
  return { sizes, open
… [truncated]
```
<details><summary>result</summary>

```
sink accepts ext
sink on 9099 -> ~/proj/me/learn/blender-mcp/.capture-tmp/frames
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"sizes":{"0":211620,"1":202048,"2":193032,"3":213740,"4":204828},"opened":{"total":2,"found":1,"complete":false}}
### Ran Playwright code
``​`js
await (async (page) => {
  const FPS = 20;
  const mkCast = async (quality) => {
    const client = await page.context().newCDPSession(page);
    const buf = []; let last = 0, n = 0;
    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp;
      if (last && t - last < 1 / FPS - 0.002) return;
      last = t; buf.push({ i: n++, d: data });
    });
    return { buf,
      start: () => client.send('Page.startScreencast',
        { format: 'jpeg', quality: quality ?? 90, everyNthFrame: 1 }),
      stop: () => client.send('Page.stopScreencast').catch(() => {}) };
  };
  const flush = async (dir, buf) => {
    let wrote = 0;
    for (let i = 0; i < buf.length; i += 12) {
      wrote += await page.evaluate(async ([d, frames]) => {
        const r = await fetch('http://localhost:9099/', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ dir: d, frames }),
        });
        return (await r.json()).wrote;
      }, [dir, buf.slice(i, i + 12)]);
    }
    return wrote;
  };
  const boot = async (w, h, viewSize) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(() => window.__game && window.__game.props
      && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
    // Media framing. The shipped camera sits at viewSize 20, which puts the boy
    // at ~44px in a 700px viewport - unreadable once it is a 720px-wide GIF.
… [truncated]
```
</details>

**`Bash`** — Review hero candidates
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/hero && ls -la
magick montage f00000.png f00001.png f00002.png f00003.png f00004.png -tile 2x3 -geometry 560x315+4+4 -background '#111' $R/sheet_hero.png
identify $R/sheet_hero.png | head -1
```
<details><summary>result</summary>

```
total 1520
drwxr-xr-x@ 7 apshoemaker  staff     224 Sep  6 14:18 .
drwxr-xr-x@ 7 apshoemaker  staff     224 Sep  6 14:18 ..
-rw-r--r--@ 1 apshoemaker  staff  158715 Sep  6 14:18 f00000.png
-rw-r--r--@ 1 apshoemaker  staff  151534 Sep  6 14:18 f00001.png
-rw-r--r--@ 1 apshoemaker  staff  144773 Sep  6 14:18 f00002.png
-rw-r--r--@ 1 apshoemaker  staff  160303 Sep  6 14:18 f00003.png
-rw-r--r--@ 1 apshoemaker  staff  153621 Sep  6 14:18 f00004.png
montage: unable to read font `' @ error/annotate.c/RenderFreetype/1665.
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_hero.png PNG 1136x969 1136x969+0+0 16-bit sRGB 1.22886MiB 0.000u 0:00.000
```
</details>

**`Read`**

Candidate 0 is the strongest hero — the boy centred in the torch pool, crystal in the blue-white, cave receding into black. Let me place the assets and sanity-check the GIFs actually play:

**`Bash`** — Place assets, verify GIF integrity
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
M=~/proj/me/learn/blender-mcp/cavern-game/docs/media
cp $R/frames/hero/f00000.png $M/hero.png
# strip metadata / recompress losslessly
magick $M/hero.png -strip -define png:compression-level=9 $M/hero.png
cd $M && ls -lh
echo "=== gif integrity ==="
for g in discovery gate ending; do
  n=$(magick identify $M/$g.gif 2>/dev/null | wc -l | tr -d ' ')
  d=$(magick identify -format "%T " $M/$g.gif 2>/dev/null | awk '{print $1}')
  size=$(magick identify -format "%wx%h" $M/$g.gif | head -c 9)
  printf "%-12s %s frames, %sx10ms/frame, %s\n" "$g" "$n" "$d" "$size"
done
echo "=== total media ==="
du -sh $M
```
<details><summary>result</summary>

```
total 14448
-rw-r--r--@ 1 apshoemaker  staff   3.0M Sep  6 14:17 discovery.gif
-rw-r--r--@ 1 apshoemaker  staff   2.3M Sep  6 14:17 ending.gif
-rw-r--r--@ 1 apshoemaker  staff   1.6M Sep  6 14:17 gate.gif
-rw-r--r--@ 1 apshoemaker  staff   148K Sep  6 14:18 hero.png
=== gif integrity ===
discovery    106 frames, 8x10ms/frame, 600x37260
gate         100 frames, 8x10ms/frame, 600x37260
ending       171 frames, 8x10ms/frame, 600x36254
=== total media ===
7.1M	~/proj/me/learn/blender-mcp/cavern-game/docs/media
```
</details>

**`Bash`** — Verify the ending GIF including the seam
```bash
M=~/proj/me/learn/blender-mcp/cavern-game/docs/media
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
rm -rf egif && mkdir egif
magick $M/ending.gif -coalesce egif/e_%03d.png
magick montage egif/e_005.png egif/e_035.png egif/e_060.png egif/e_075.png egif/e_090.png egif/e_110.png egif/e_140.png egif/e_168.png -tile 4x2 -geometry 380x230+3+3 -background '#181818' $R/sheet_end.png 2>/dev/null
identify $R/sheet_end.png | head -1
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_end.png PNG 1544x472 1544x472+0+0 16-bit sRGB 1021.06KiB 0.000u 0:00.000
```
</details>

**`Read`**

The ending clip reads exactly right — cave, light swelling, whiteout, the title, Claude's closing passage, then "go down again". The seam is invisible. Now the README:

**`Bash`** — Read README middle
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '55,130p' README.md
```
<details><summary>result</summary>

```
The motes rise rather than scatter. Falling would read as destruction; rising
reads as being taken up, which is the note the story ends on.

## The idea

The torch does not burn out. Its job is **discovery**: as an undiscovered passage
comes into range the flame stirs, flares, and cools from amber toward blue-white.
Hunting a secret is a hot-and-cold game you play by watching your own light,
rather than by walking into every wall in the cave.

**Embers** scattered through the cavern permanently widen that sense (on a
`sqrt` curve — a linear bonus would grow the radius past 12 units and pop every
secret on the level without the player ever hunting for one).

---

## The story (live)

Torchboy's story is **written by Claude while you play it** (`claude-sonnet-5`),
from a log of what he has actually done. Never the same twice, and never the
same for two different runs through the same cave.

`Chronicle.js` records what happened in words a model can use - how far he has
walked with nothing to show for it, that his torch went cold at a wall and he
walked away from it anyway, that he has begun retreading his own footprints,
which cavern he has climbed into. Every beat request sends that log plus
everything already told, so the narrative continues rather than restarting, and
responds to the run rather than being written blind.

Beats are **prefetched**: the moment one is shown the next is requested. A beat
takes ~3s to write and surfaces every ~40 paces, so the wait never shows. About
**$0.03-0.05 per playthrough**.

A premise (register, a remembered object, why he went down) is minted on the
first call and echoed back on every one after. That matters: the first beat and
the first revelation were originally fired in parallel before a premise existed,
so the server minted two, and the story and the revelations ended up about
different objects.

``​`bash
… [truncated]
```
</details>

The README has real staleness now — it still documents the premise machinery, `POST /api/story`, and a "whole story fetched at boot" design that no longer exists. Since this is what gets published, let me fix it alongside adding the media. Let me see the rest:

**`Bash`** — Read README 130-220
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '130,220p' README.md
```
<details><summary>result</summary>

```
- **Spawn it on the camera side of him.** Rising from directly beneath put the
  orb behind his own body for most of the climb, so most of the animation was
  invisible. Offset toward the camera, with the lateral drift lagging the climb,
  it arcs in from the front and reads the whole way up.
- **Keep it dimmer than the torch.** At first pass its point light peaked at 34
  against the torch's ~30 and washed the entire cavern white, burying the orb it
  was meant to light.

**A story generated as one block is not the same as a story generated live.**
The up-front version could plan an arc but knew nothing about the run. The live
version knows the run but must be told, every time and in the prompt, that it is
CONTINUING: never restate, never summarise, never start over, and if a person or
an object has been established it stays established. With those rules a session
produces a genuine through-line - a blue string knotted round his wrist in the
first beat becomes, by the fifth, the reason "the climb was never his".

**Write the brief for the shape you want, not the texture.** The first version
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

**Do not give a model information you do not want it to use.** The first version
listed the three cavern names in the system prompt for texture, and told the
model not to name them. It named all three. That is not just disobedience - the
beats surface at unpredictable moments, so "the Weeping Gallery" would appear
while you were still in the first cavern, contradicting the HUD. The fix was to
… [truncated]
```
</details>

Now the media section plus the accuracy fixes:

**`Bash`** — Add hero and media section
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
p='README.md'; s=open(p).read()

# ---- hero + media, right under the intro
old = """All art is generated in **Blender** by script and exported to glTF; the game runs
on **three.js**.

``​`bash
npm install
npm run dev        # http://localhost:5173
``​`
"""
new = """All art is generated in **Blender** by script and exported to glTF; the game runs
on **three.js**. The caves, and the story told over them, are different every run.

![Torchboy in the dark, torch raised, crystal catching the light](docs/media/hero.png)

``​`bash
npm install
npm run dev        # http://localhost:5173
``​`

---

## What it looks like

**The torch is the instrument.** The flame stirs and cools toward blue-white as
a hidden way comes into range; the wall dissolves, the passage opens, and
something ancient comes up out of the floor and into him.

![Walking up to a wall that turns out to be a door](docs/media/discovery.gif)

**The way up has to be earned.** Stand on the stairs with passages still
unfound and nothing is there — not locked, *absent*, and off the map too. Open
the last one and the way up rises out of the floor.

![The way is shut until every passage on the level is found](docs/media/gate.gif)

**The ending takes the controls away.** He walks the last steps into the
daylight and comes apart upward, and then Claude writes the last of his story
knowing everything that happened in the run.

![Walking into the light, and the story's last passage](docs/media/ending.gif)

<sub>Clips are recorded at a slightly closer camera than the game ships with, so
the boy reads at GIF size. Nothing else is altered — same lighting, same rules,
driven through the real keyboard input.</sub>
"""
assert old in s, 'MISS media'
s = s.replace(old, new, 1)
open(p,'w').write(s)
print('media section added')
PY
head -60 README.md
```
<details><summary>result</summary>

```
media section added
# Torchboy — The Deep Hollow

An isometric cavern crawler that runs in the browser. You are a small boy with an
enormous head and a mohawk, carrying a torch through three levels of unlit cave.
Hidden passages are sealed behind rock that looks exactly like every other wall —
your torch is the instrument that finds them.

All art is generated in **Blender** by script and exported to glTF; the game runs
on **three.js**. The caves, and the story told over them, are different every run.

![Torchboy in the dark, torch raised, crystal catching the light](docs/media/hero.png)

``​`bash
npm install
npm run dev        # http://localhost:5173
``​`

---

## What it looks like

**The torch is the instrument.** The flame stirs and cools toward blue-white as
a hidden way comes into range; the wall dissolves, the passage opens, and
something ancient comes up out of the floor and into him.

![Walking up to a wall that turns out to be a door](docs/media/discovery.gif)

**The way up has to be earned.** Stand on the stairs with passages still
unfound and nothing is there — not locked, *absent*, and off the map too. Open
the last one and the way up rises out of the floor.

![The way is shut until every passage on the level is found](docs/media/gate.gif)

**The ending takes the controls away.** He walks the last steps into the
daylight and comes apart upward, and then Claude writes the last of his story
knowing everything that happened in the run.

![Walking into the light, and the story's last passage](docs/media/ending.gif)

… [truncated]
```
</details>

Now the accuracy fixes — the README still documents mechanics that no longer exist:

**`Bash`** — Fix stale README mechanics
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
def sub(old, new, label):
    global s
    if old not in s: sys.exit(f'MISS: {label}')
    s = s.replace(old, new, 1); print('ok:', label)

# 1. the level invariants now include the gate
sub("""A level that fails its own invariants is **re-rolled rather than shipped**: the
way onward must be reachable without finding any secret, at least one reward must
be genuinely gated behind one, and the cave must be within the size band the
hand-tuned ones occupied (a bad cellular-automata roll can leave a 260-tile
pocket that is over in a minute).""",
"""A level that fails its own invariants is **re-rolled rather than shipped**: the
way onward must be reachable without finding any secret, at least one reward must
be genuinely gated behind one, **every secret must actually be findable**, and the
cave must be within the size band the hand-tuned ones occupied (a bad
cellular-automata roll can leave a 260-tile pocket that is over in a minute).

That findability check is not the same as reachability, and it became load-bearing
the moment the way up was locked behind finding everything. A secret is opened by
standing next to it, so what has to be reachable is the *floor beside it* — and
opening one secret can be what puts him beside the next. The validator therefore
walks the same fixpoint the player does: open everything he can currently stand
beside, re-flood, repeat, and reject the level if anything is left over. Before
that rule, an unreachable secret was harmless; after it, it would strand the run
with no way up. Verified across 900 generated levels, 0 uncompletable, at no
measurable cost to generation time (~9ms per run, 0 re-rolls in 200).""",
    'level invariants')

# 2. the gate itself deserves a section
sub("""## He climbs""",
"""## The way up is earned

A cavern does not let him leave until he has opened **every** passage hidden in
it. Until then the staircase is not locked, it is **absent** — not rendered, not
lit, not drawn on the minimap, and not audible to the choir that sings near
things worth finding. You cannot plan a route past the passages you have not
foun
… [truncated]
```
<details><summary>result</summary>

```
ok: level invariants
ok: gate section
ok: premise
ok: endpoint
ok: boot-vs-live
ok: bestowal
```
</details>

**`Bash`** — Fix stale story-prompt documentation
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
def sub(old, new, label):
    global s
    if old not in s: sys.exit(f'MISS: {label}')
    s = s.replace(old, new, 1); print('ok:', label)

# 7. the continuity paragraph documents rules that were removed
sub("""**A story generated as one block is not the same as a story generated live.**
The up-front version could plan an arc but knew nothing about the run. The live
version knows the run but must be told, every time and in the prompt, that it is
CONTINUING: never restate, never summarise, never start over, and if a person or
an object has been established it stays established. With those rules a session
produces a genuine through-line - a blue string knotted round his wrist in the
first beat becomes, by the fifth, the reason "the climb was never his".""",
"""**A story generated as one block is not the same as a story generated live.**
The live version knows the run, but must be told every time and in the prompt
that it is CONTINUING: never restate, never summarise, never start over, and
anything already established stays established and recurs. With those rules a
run produces a real through-line - the dark was *fed*, once; the payment was
always a child sent down with a light; the miners were not digging for ore but
building rooms to keep something sleeping; the light above hungers too.""",
    'continuity')

sub("""**Write the brief for the shape you want, not the texture.** The first version
asked for beats that "leave things unsaid", welcomed fragments, and said the
best beat "implies a whole life in twelve words". That is a recipe for nine
standalone aphorisms, and that is exactly what came back - atmospheric, and not
a story. The rewrite makes continuity mandatory and checkable: name one other
person and carry them through at least four beats, carry one concrete object
from first to last so it means something different by the end, every beat must
advance the situation, and beat N must read as the consequence of beat N-1. The
difference is total - a run now produces a named character (Wick), an object
that turns from keepsake to leash to refusal, and an end
… [truncated]
```
<details><summary>result</summary>

```
ok: continuity
ok: brief
ok: evolves
ok: structured output
```
</details>

**`Bash`** — Fix architecture and tiles sections
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
def sub(old, new, label):
    global s
    if old not in s: sys.exit(f'MISS: {label}')
    s = s.replace(old, new, 1); print('ok:', label)

# levels.json is gone - caves are generated in the browser per run
sub("""### One source of truth for the level

`public/data/levels.json` is generated by `tools/gen_levels.mjs` and consumed by
**both** `blender/build_cavern.py` (geometry) and `src/game/Grid.js` (collision,
secrets, floor height). Nothing about the layout is authored twice, so the mesh
you see and the wall you bump into cannot drift apart.

The floor-height field is a deliberate line-by-line port between Python and JS,
verified to produce bit-identical values — otherwise the player floats above or
sinks into the ground Blender built. `FLOOR_SUB` appears in both files and must
stay in sync.""",
"""### One source of truth for the level

A run generates its grids once (`LevelGen.js`) and both the geometry
(`CavernMesh.js`) and the collision, secrets and floor height (`Grid.js`) are
built from that same document. Nothing about the layout is authored twice, so
the mesh you see and the wall you bump into cannot drift apart.

`CavernMesh.js` is a deliberate line-by-line port of `blender/build_cavern.py`,
and the floor-height field was verified to produce bit-identical values in both —
otherwise the player floats above or sinks into the ground. `FLOOR_SUB` appears
in both files and must stay in sync. The Blender script is still the reference
implementation; `tools/gen_levels.mjs` and `npm run levels` remain useful for
inspecting and validating grids outside the browser.""",
    'source of truth')

sub("""- the level exit is reachable **without** any secret (the game is never blocked)
- at least one reward is genuinely gated behind a secret
- every `S` wall opens something that was not reachable before""",
"""- the level exit is reachable **without** any secret (the geometry never blocks it)
- at least one reward is genuinely gated behind a secret
- every `S` wall opens something that was not reachable before
- every `S` wall is itself findable — see [the way up is 
… [truncated]
```
<details><summary>result</summary>

```
ok: source of truth
ok: invariant list
ok: tiles
=== remaining suspicious strings ===
168:exposing `POST /api/story/next`; anything under `src/` ships to the browser and
```
</details>

**`Bash`** — Map README sections
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "^## \|^### " README.md
echo "=== ending section ==="
sed -n '/^## The ending/,/^## /p' README.md | head -20
```
<details><summary>result</summary>

```
20:## What it looks like
53:## Generated fresh every run
76:## The way up is earned
90:## He climbs
97:## The ending
110:## The idea
123:## The story (live)
240:## Architecture
242:### One source of truth for the level
256:### Generating caves
274:### Tiles
289:## The map
301:## Movement
325:## Animation
348:## Sound
361:### The choir
435:## Notable implementation details
497:## Layout
532:## Credits
=== ending section ===
## The ending

Reaching the daylight takes control away - this is the one moment the game
should be watched rather than played. He walks the last steps himself, the light
in the arch swells until it is the only thing left, and he comes apart upward:
420 motes leaving him while his body thins out, the screen going to daylight
while he is still dissolving so the two read as one event rather than a dissolve
followed by a fade. Then Claude writes the last of his story, knowing everything
that happened in the run.

The motes rise rather than scatter. Falling would read as destruction; rising
reads as being taken up, which is the note the story ends on.

## The idea
```
</details>

**`Bash`** — Document the restart button; scan map/movement
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
old = """The motes rise rather than scatter. Falling would read as destruction; rising
reads as being taken up, which is the note the story ends on."""
new = """The motes rise rather than scatter. Falling would read as destruction; rising
reads as being taken up, which is the note the story ends on.

The way back in is held until the ending has been read. The timer keys off the
*real* text rather than the placeholder — the card is painted with an ellipsis
while the last passage is still being written, so starting the clock there would
fade a button in during the wait — and it scales with how much there is to read
(5s plus 20ms per character, capped at 11s). Restarting is a full reload, which
is not laziness: the caves, the story and the audio graph are all built once at
boot, so a reload is the only thing that cannot leave stale state behind."""
if old not in s: sys.exit('MISS ending')
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
echo "=== check remaining sections for staleness ==="
sed -n '289,330p' README.md
```
<details><summary>result</summary>

```
ok
=== check remaining sections for staleness ===

`>` is **walkable**: since the game was reversed into a climb it is a staircase
he steps onto, not a shaft he steps around. It is also where the way onward
appears once the cavern has nothing left hidden in it — before that, the tile is
there but the staircase is not.

---

## The map

A fog-of-war minimap sits top-right and expands on hover. Nothing is drawn until
he has walked near it, the explored set is per level and only ever grows, and
markers (stairs, the way out, opened passages, uncollected embers) appear only
on ground he has actually seen - so the map never spoils what is ahead. The
ragged edge of the explored area is the useful part: it is the frontier.

Kept **north-up rather than rotating with the camera**. The camera pivots
freely, and a map that spins with it never lets you build a mental picture of
the cave; a fixed map plus a facing arrow does.

## Movement

`WASD` to move, **drag with the mouse to pivot** the camera around him, `Q`/`E`
to turn with the keyboard. Steering is screen-relative and follows the pivot -
`IsoCamera.basis()` derives the movement axes from the camera offset, so
rotating the view rotates the controls with it and "up" is always up-screen.

**The walk cycle is locked to actual ground speed.** Playback rate is
`groundSpeed * clipDuration / STRIDE_PER_CYCLE`, where the stride constant comes
from the rig geometry (`4 * legLength * sin(swing)`). Measured slide ratio: 1.00.
Before this the clip ran at a fixed rate while he moved 5.9x faster than its
stride implied, and he skated everywhere. Using *measured* speed rather than the
input vector also means scraping along a wall slows his legs to match.

There is a real tension in the proportions worth knowing about. His legs are
0.28 units long and he is 1.36 tall, so a fully planted foot at any brisk speed
demands a fast cadence - at the original 4.2 u/s it would have been 8.8
steps/sec, a blur. Two dials in `Player.js`:
… [truncated]
```
</details>

**`Bash`** — Update map section; read Layout
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
old = """markers (stairs, the way out, opened passages, uncollected embers) appear only
on ground he has actually seen - so the map never spoils what is ahead."""
new = """markers (stairs, the way out, opened passages, uncollected embers) appear only
on ground he has actually seen - so the map never spoils what is ahead. A way
onward that is still sealed is not drawn at all, even on ground he has walked:
if the map showed where the stairs were, the lock would be an inconvenience
rather than a reason to go and finish the level."""
if old not in s: sys.exit('MISS map')
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
echo "=== Layout section ==="
sed -n '/^## Layout/,/^## Credits/p' README.md
```
<details><summary>result</summary>

```
ok
=== Layout section ===
## Layout

``​`
blender/            asset generators (also runnable over MCP in a live session)
  lib_build.py        shared bmesh helpers
  build_character.py  the boy: rigged, 3 clips, `flame` bone anchors the light
  build_cavern.py     grid -> meshes, shared corner lattice so walls seam
  build_props.py      embers, treasure, stairs, the exit archway
tools/
  story-plugin.mjs    Vite middleware: generates the backstory with Claude
  gen_levels.mjs      CA cave generation + deliberate secret carving
  validate_levels.mjs design invariants (exit reachable, secrets gate rewards)
  build_assets.sh     headless rebuild of every .glb
src/audio/
  vocal-tract-processor.js  AudioWorklet: Kelly-Lochbaum waveguide + LF glottis
src/game/
  LevelGen.js   cellular-automata caves, generated per session, self-validating
  CavernMesh.js grid -> three.js geometry, in the browser
  Chronicle.js  what he has done, in words the model can use
  Ascension.js  the ending: into the light, and apart
  Ambience.js   generated score: drone, wandering line, reactive choir
  Minimap.js    fog of war, revealed only by walking
  Bestowal.js   the light that rises out of the floor and enters him
  Narrator.js   holds the generated story, decides when each beat surfaces
  Choir.js      wraps the vocal tract + ensemble/reverb chain
  Expression.js procedural layer: head lag, look-at, blinks, brows, reactions
  Grid.js       collision + floor height, ported to match Blender exactly
  Cavern.js     level meshes, secret reveal + crumble
  Cutaway.js    dithered wall dissolve
  Torch.js      the light, and the hot/cold discovery sense
  Player.js     movement, animation state machine, contact shadow
  Props.js      pickups cloned onto grid tiles
  IsoCamera.js  orthographic follow + screen-relative input basis
``​`

## Credits
```
</details>

**`Bash`** — Fix layout listing; verify all local links resolve
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
def sub(a,b,l):
    global s
    if a not in s: sys.exit('MISS '+l)
    s=s.replace(a,b,1); print('ok:',l)
sub("""  story-plugin.mjs    Vite middleware: generates the backstory with Claude""",
    """  story-plugin.mjs    Vite middleware: writes the story with Claude, live""", 'plugin desc')
sub("""  Narrator.js   holds the generated story, decides when each beat surfaces""",
    """  Narrator.js   requests + prefetches beats, decides when each one surfaces""", 'narrator desc')
sub("""  Props.js      pickups cloned onto grid tiles""",
    """  Props.js      pickups cloned onto grid tiles; seals the way onward""", 'props desc')
sub("""  validate_levels.mjs design invariants (exit reachable, secrets gate rewards)""",
    """  validate_levels.mjs design invariants (exit reachable, every secret findable)""", 'validate desc')
sub("""src/audio/""", """docs/media/           hero image + clips used by this README
src/audio/""", 'media dir')
open(p,'w').write(s)
PY
echo "=== broken local links? ==="
grep -oE '\]\((docs/[^)]+|[a-zA-Z0-9_./-]+\.(png|gif|mjs|js|py|json|sh))\)' README.md | sed 's/](//;s/)//' | sort -u | while read f; do
  [ -e "$f" ] && echo "  ok   $f" || echo "  MISS $f"
done
```
<details><summary>result</summary>

```
ok: plugin desc
ok: narrator desc
ok: props desc
ok: validate desc
ok: media dir
=== broken local links? ===
  ok   docs/media/discovery.gif
  ok   docs/media/ending.gif
  ok   docs/media/gate.gif
  ok   docs/media/hero.png
```
</details>

**`Bash`** — Verify gitignore safety before open-sourcing
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== .gitignore ==="; cat .gitignore
echo "=== would docs/media be committed? ==="
git check-ignore -v docs/media/hero.png docs/media/discovery.gif 2>/dev/null && echo "IGNORED (bad)" || echo "not ignored - will be committed"
echo "=== is .env still ignored? ==="
ls -la .env 2>/dev/null | head -1
git check-ignore -v .env && echo "-> .env ignored (good)" || echo "-> WARNING: .env NOT ignored"
echo "=== any key material anywhere that would be committed? ==="
git status --porcelain | awk '{print $2}' | head -20
```
<details><summary>result</summary>

```
=== .gitignore ===
node_modules/
dist/
.playwright-mcp/
*.blend1
__pycache__/

# never commit credentials
.env
.env.*
!.env.example
=== would docs/media be committed? ===
not ignored - will be committed
=== is .env still ignored? ===
-rw-r--r--@ 1 apshoemaker  staff  182 Sep  6 11:08 .env
.gitignore:8:.env	.env
-> .env ignored (good)
=== any key material anywhere that would be committed? ===
.gitignore
README.md
blender/
docs/
index.html
package-lock.json
package.json
public/
src/
tools/
vite.config.mjs
```
</details>

**`Bash`** — Final safety scan and build
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== scan every file that WOULD be committed for key material ==="
git ls-files --others --exclude-standard | while read f; do
  [ -f "$f" ] && grep -lE "sk-ant-|wrkspc_" "$f" 2>/dev/null
done | grep -v "^$" && echo "!!! FOUND !!!" || echo "clean: no key material in any tracked-to-be file"
echo "=== build still good ==="
npx vite build 2>&1 | grep -E "built|error" | tail -2
echo "=== repo size that would be committed ==="
git ls-files --others --exclude-standard -z | xargs -0 du -ch 2>/dev/null | tail -1
```
<details><summary>result</summary>

```
=== scan every file that WOULD be committed for key material ===
README.md
!!! FOUND !!!
=== build still good ===
✓ built in 677ms
=== repo size that would be committed ===
7.9M	total
```
</details>

**`Bash`** — Inspect the key-pattern hit in README
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -nE "sk-ant-|wrkspc_" README.md
```
<details><summary>result</summary>

```
162:ANTHROPIC_API_KEY=sk-ant-...
163:ANTHROPIC_WORKSPACE_ID=wrkspc_...   # only for org-level keys, not workspace-scoped ones
```
</details>

Just documentation placeholders. Let me verify the two remaining GIFs encoded correctly, then clean up:

**`Bash`** — Verify final encoded GIFs
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
M=~/proj/me/learn/blender-mcp/cavern-game/docs/media
cd $R && rm -rf chk && mkdir chk
magick $M/discovery.gif -coalesce chk/d_%03d.png
magick $M/gate.gif -coalesce chk/g_%03d.png
magick montage chk/d_002.png chk/d_050.png chk/d_075.png chk/d_100.png chk/g_005.png chk/g_040.png chk/g_070.png chk/g_095.png -tile 4x2 -geometry 380x236+3+3 -background '#181818' $R/sheet_final.png 2>/dev/null
identify $R/sheet_final.png | head -1
pkill -f "capture-tmp/sink.mjs" 2>/dev/null; echo "sink stopped"
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_final.png PNG 1544x484 1544x484+0+0 16-bit sRGB 1.24893MiB 0.000u 0:00.000
sink stopped
```
</details>

**`Read`**

Both read correctly — but the gate clip starts *after* the "way is shut" moment, which my caption claims it shows. Let me check whether that moment is in the capture at all:

**`Bash`** — Look for the way-is-shut moment
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/gate
magick montage f00030.jpg f00060.jpg f00080.jpg f00100.jpg f00120.jpg f00150.jpg -tile 3x2 -geometry 460x285+3+3 -background '#181818' $R/sheet_shut.png 2>/dev/null
identify $R/sheet_shut.png | head -1
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_shut.png PNG 1398x582 1398x582+0+0 16-bit sRGB 1.17746MiB 0.000u 0:00.000
```
</details>

**`Read`**

The "way is shut" hint isn't in the capture — he stalled before getting close enough to the stairs tile. Rather than claim the clip shows something it doesn't, let me fix the caption to match:

**`Bash`** — Correct the gate caption to match the clip
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
old = """**The way up has to be earned.** Stand on the stairs with passages still
unfound and nothing is there — not locked, *absent*, and off the map too. Open
the last one and the way up rises out of the floor.

![The way is shut until every passage on the level is found](docs/media/gate.gif)"""
new = """**The way up has to be earned.** A cavern keeps its staircase until every
passage hidden in it is open — and not by locking it: until then the way up is
simply *absent*, unlit and off the map. Here the last one gives way, the counter
reaches 2/2, and the way up opens.

![The last passage on the level opens, and the way up appears](docs/media/gate.gif)"""
if old not in s: sys.exit('MISS')
open(p,'w').write(s.replace(old,new,1)); print('caption corrected')
PY
sed -n '20,50p' README.md
```
<details><summary>result</summary>

```
caption corrected
## What it looks like

**The torch is the instrument.** The flame stirs and cools toward blue-white as
a hidden way comes into range; the wall dissolves, the passage opens, and
something ancient comes up out of the floor and into him.

![Walking up to a wall that turns out to be a door](docs/media/discovery.gif)

**The way up has to be earned.** A cavern keeps its staircase until every
passage hidden in it is open — and not by locking it: until then the way up is
simply *absent*, unlit and off the map. Here the last one gives way, the counter
reaches 2/2, and the way up opens.

![The last passage on the level opens, and the way up appears](docs/media/gate.gif)

**The ending takes the controls away.** He walks the last steps into the
daylight and comes apart upward, and then Claude writes the last of his story
knowing everything that happened in the run.

![Walking into the light, and the story's last passage](docs/media/ending.gif)

<sub>Clips are recorded at a slightly closer camera than the game ships with, so
the boy reads at GIF size. Nothing else is altered — same lighting, same rules,
driven through the real keyboard input.</sub>

Assets are committed, so `npm run dev` works without Blender. To regenerate them:

``​`bash
npm run assets     # headless Blender -> public/models/*.glb
npm run levels     # regenerate + validate the level grids only
``​`
```
</details>

**`Bash`** — Final verification
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== final state ==="
ls -lh docs/media/
echo
echo "=== README sections ==="
grep -n "^## " README.md
echo
echo "=== build ==="
npx vite build 2>&1 | grep -E "built|error" | tail -1
grep -rlE "sk-ant-[A-Za-z0-9]|wrkspc_[A-Za-z0-9]" dist/ 2>/dev/null && echo LEAK || echo "dist clean"
echo
echo "=== capture rig (outside the repo, will not be committed) ==="
du -sh ~/proj/me/learn/blender-mcp/.capture-tmp
```
<details><summary>result</summary>

```
=== final state ===
total 14448
-rw-r--r--@ 1 apshoemaker  staff   3.0M Sep  6 14:17 discovery.gif
-rw-r--r--@ 1 apshoemaker  staff   2.3M Sep  6 14:17 ending.gif
-rw-r--r--@ 1 apshoemaker  staff   1.6M Sep  6 14:17 gate.gif
-rw-r--r--@ 1 apshoemaker  staff   148K Sep  6 14:18 hero.png

=== README sections ===
20:## What it looks like
54:## Generated fresh every run
77:## The way up is earned
91:## He climbs
98:## The ending
119:## The idea
132:## The story (live)
249:## Architecture
298:## The map
313:## Movement
337:## Animation
360:## Sound
448:## Notable implementation details
510:## Layout
545:## Credits

=== build ===
✓ built in 671ms
dist clean

=== capture rig (outside the repo, will not be committed) ===
 73M	~/proj/me/learn/blender-mcp/.capture-tmp
```
</details>

Done — hero image and three GIFs, all captured from real play and wired into the README.

**The media** (`docs/media/`, 7.1MB total)

- **`hero.png`** (1600×900, 148KB) — the boy in his torch pool, crystal catching the blue-white, cave falling away into black.
- **`discovery.gif`** — the core loop: walking, the sense bar filling, the wall dithering away, "something gives here", the passage opening, the bestowal orb, and the knowledge card.
- **`gate.gif`** — the last passage on the level giving way, counter hitting 2/2, and *"Nothing is hidden here now. A way up opens."*
- **`ending.gif`** — the ascension, the whiteout, the title, Claude's closing passage, and the "go down again" button.

Everything was driven through the **real input layer** — WASD held against a BFS path through the cave — so the gait, head-turn and camera behave exactly as under a player's hands. No compositing, no touched lighting. The one deliberate change is camera distance: the shipped `viewSize` puts the boy at 44px in a 700px viewport, unreadable at GIF size, so clips were shot closer (68px). That's disclosed in a line under the clips.

Two things I cut to stay honest. The ending clip has 11s of static end-card while waiting on the API — I spliced that out rather than ship a frozen screen. And my first gate caption claimed the clip showed the *refusal* ("stand on the stairs and nothing is there"); it doesn't — he stalled before reaching the stairs tile, so the hint never fired on camera. I rewrote the caption to describe what's actually in the frame.

**README accuracy pass.** Publishing this meant the docs had to stop describing mechanics that no longer exist. I fixed: the premise machinery (now documents your authored premise, plus the mode-collapse finding — twelve tin whistles, then twelve ledgers), `POST /api/story` → `/api/story/next`, a "whole story fetched at boot" section that contradicted the live design, "returns TEN REVELATIONS alongside the nine memory beats", continuity rules I'd removed (the named-character/carried-object examples), `levels.json` as source of truth (caves are generated per run now), and a tiles table still describing `>` as an open shaft you descend. Added sections for the gate and the restart button. All four media links resolve.

**Before you push:** the repo has `git init` but no commits yet. `.env` is correctly ignored, and I scanned every file that would be committed — the only `sk-ant-` hits are the `sk-ant-...` placeholders in the README's env example. ~7.9MB total.

The capture rig lives in `../.capture-tmp/` — outside the repo, so it won't be committed. Say the word if you want it cleaned up, or promoted into `tools/` so the media is reproducible.


---
[← 20-man-this-is-cool-the-only.md](20-man-this-is-cool-the-only.md)  ·  [index](README.md)