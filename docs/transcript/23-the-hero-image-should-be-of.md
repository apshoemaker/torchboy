# 23. the hero image should be of TorchBoy with this torch and the words TorchBoy above in a stylized way

[← index](README.md)

## The prompt

> the hero image should be of TorchBoy with this torch and the words TorchBoy above in a stylized way

## What happened

**`Bash`** — Read the game's type styling
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "font-family\|@font-face\|letter-spacing" index.html | head -20
echo "=== hud root + toggles ==="
grep -n 'id="hud"\|id="loading"\|id="map"\|class="row"\|id="keys"\|id="hint"' index.html | head
```
<details><summary>result</summary>

```
31:    font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
53:  .lbl { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #5f5b52; }
64:    font-size: 16px; line-height: 1.65; letter-spacing: .012em;
73:    font-style: normal; letter-spacing: .10em; font-size: 15px;
101:    font-size: 9px; letter-spacing: .16em; color: #6f6a60;
114:    font-size: 13px; letter-spacing: .01em; white-space: nowrap;
119:    color: #9fe4ff; font-size: 14px; letter-spacing: .18em; text-transform: uppercase;
152:    margin: 0; font-size: 26px; font-weight: 600; letter-spacing: .05em;
164:    font: inherit; font-size: 13px; letter-spacing: .09em; text-transform: lowercase;
186:    margin: 0; font-size: 30px; font-weight: 600; letter-spacing: .04em;
191:  .what { text-align: center; color: var(--dim); font-size: 12px; letter-spacing: .1em; }
=== hud root + toggles ===
201:<div id="hud">
206:    <div class="row">passages here <b id="found">0/0</b> · embers <b id="embers">0</b></div>
208:  <div id="map">
212:  <div id="hint"></div>
215:  <div id="keys">
228:<div id="loading">
```
</details>

**`Bash`** — Read base font and title styles
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '20,35p' index.html
echo "--- loading title (h1) style ---"
sed -n '183,195p' index.html
```
<details><summary>result</summary>

```
    user-select: none; -webkit-user-select: none; touch-action: none;
  }
  #view { display: block; width: 100%; height: 100%; }

  /* ---------------------------------------------------------------- HUD */
  #hud { position: fixed; inset: 0; pointer-events: none; }
  .panel {
    position: absolute; top: max(14px, env(safe-area-inset-top));
    left: 14px; display: flex; flex-direction: column; gap: 8px;
  }
  #level-name {
    font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
    color: var(--dim); text-shadow: 0 1px 3px #000;
  }
  /* the sense meter mirrors the flame: amber when calm, cold when a passage
     is close, so the HUD and the light tell the same story */
--- loading title (h1) style ---
  }
  #loading.gone { opacity: 0; pointer-events: none; }
  #loading h1 {
    margin: 0; font-size: 30px; font-weight: 600; letter-spacing: .04em;
    text-align: center;
    background: linear-gradient(180deg, #ffd9a1, #ff8a3c);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .what { text-align: center; color: var(--dim); font-size: 12px; letter-spacing: .1em; }
  .bar { width: 260px; height: 3px; background: #1b1d24; border-radius: 99px; overflow: hidden; }
  .bar span { display: block; height: 100%; width: 0; background: var(--flame); transition: width .3s; }
  .err { color: #ff8a7a; text-align: center; max-width: 460px; }
  .err code { display: block; margin-top: 8px; color: #a89e94; font-size: 12px; }
```
</details>

The loading screen already has a title treatment — an ember gradient clipped to text. I'll build the hero on that rather than invent a new identity. Let me shoot candidates with the HUD hidden and the title overlaid:

**`Bash`** — Build hero candidate capture with title overlay
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && echo "dev up" || {
  pkill -f vite 2>/dev/null; sleep 1; rm -f /tmp/vite-dev.log
  (npm run dev >| /tmp/vite-dev.log 2>&1 &); sleep 6; echo restarted; }
R=~/proj/me/learn/blender-mcp/.capture-tmp
pkill -f "capture-tmp/sink.mjs" 2>/dev/null; sleep 0.5
mkdir -p $R/frames
(node $R/sink.mjs >| $R/sink.log 2>&1 &); sleep 1.2; cat $R/sink.log

rm -f $R/hero.js
{
echo 'async (page) => {'
cat $R/common.txt
cat <<'TAIL'
  // The hero is the game's own art with its own title treatment on top: the
  // ember gradient from the loading screen, scaled up. The HUD comes off -
  // a title card should be the world and the name, not the instrumentation.
  const dressUp = () => page.evaluate(() => {
    document.getElementById('hud').style.display = 'none';
    const el = document.createElement('div');
    el.id = 'heroTitle';
    el.innerHTML = '<h1>TORCHBOY</h1>';
    document.body.appendChild(el);
    const css = document.createElement('style');
    css.textContent = `
      #heroTitle {
        position: fixed; left: 0; right: 0; top: 13%;
        display: grid; justify-items: center; gap: 14px;
        pointer-events: none; z-index: 30;
      }
      #heroTitle h1 {
        margin: 0;
        font-size: clamp(54px, 8.2vw, 132px);
        font-weight: 600;
        letter-spacing: .22em;
        text-indent: .22em;          /* letter-spacing pads the right; recentre */
        line-height: 1;
        background: linear-gradient(180deg, #fff1d6 0%, #ffd9a1 38%, #ff8a3c 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        filter: drop-shadow(0 0 42px rgba(255,138,60,.40))
                drop-shadow(0 2px 3px rgba(0,0,0,.75));
      }`;
    document.head.appendChild(css);
  });

  const shot = async (name) => {
    const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
    await page.evaluate(async ([n, d]) => {
      await fetch('http://localhost:9099/', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ dir: 'hero2', ext: 'png', frames: [{ i: n, d }] }),
      });
    }, [name, 
… [truncated]
```
<details><summary>result</summary>

```
dev up
sink on 9099 -> ~/proj/me/learn/blender-mcp/.capture-tmp/frames
assembled
```
</details>

**`playwright/browser_run_code_unsafe`**
<details><summary>result</summary>

```
### Result
{"shots":6,"tiles":476}
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
cd $R/frames/hero2 && ls
magick montage f0000?.png -tile 2x3 -geometry 640x360+5+5 -background '#111' $R/sheet_h2.png
identify $R/sheet_h2.png | head -1
```
<details><summary>result</summary>

```
f00000.png
f00001.png
f00002.png
f00003.png
f00004.png
f00005.png
montage: unable to read font `' @ error/annotate.c/RenderFreetype/1665.
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_h2.png PNG 1300x1110 1300x1110+0+0 16-bit sRGB 1.69239MiB 0.000u 0:00.000
```
</details>

**`Read`**

The title treatment works, but he's lost in too much black. Let me tighten the framing and turn him toward camera:

**`Bash`** — Check how facing is stored
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "facing" src/game/Player.js | head -12
echo "--- placeAt ---"
sed -n '/placeAt(/,/^  }/p' src/game/Player.js
```
<details><summary>result</summary>

```
66:    this.facing = 0;
148:      let d = want - this.facing;
151:      this.facing += d * Math.min(1, dt * 14);
156:    this.root.rotation.y = this.facing;
175:      facing: this.facing,
--- placeAt ---
  placeAt(level, tx, ty) {
    this.level = level;
    const w = this.grid.tileToWorld(level, tx, ty);
    this.pos.set(w.x, this.grid.floorHeight(level, w.x, w.z), w.z);
    this.root.position.copy(this.pos);
  }
```
</details>

**`Bash`** — Refined hero: tighter framing, facing camera, top vignette
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/hero2.js
{
echo 'async (page) => {'
cat $R/common.txt
cat <<'TAIL'
  const dressUp = () => page.evaluate(() => {
    document.getElementById('hud').style.display = 'none';
    const el = document.createElement('div');
    el.id = 'heroTitle';
    el.innerHTML = '<h1>TORCHBOY</h1>';
    document.body.appendChild(el);
    const css = document.createElement('style');
    css.textContent = `
      /* a soft darkening at the very top seats the title on the cave without
         painting a band across it */
      #heroVig {
        position: fixed; left: 0; right: 0; top: 0; height: 46%;
        background: linear-gradient(180deg, rgba(0,0,0,.62), rgba(0,0,0,0));
        pointer-events: none; z-index: 29;
      }
      #heroTitle {
        position: fixed; left: 0; right: 0; top: 8.5%;
        display: grid; justify-items: center;
        pointer-events: none; z-index: 30;
      }
      #heroTitle h1 {
        margin: 0;
        font-size: clamp(54px, 8.6vw, 142px);
        font-weight: 600; line-height: 1;
        letter-spacing: .24em; text-indent: .24em;
        background: linear-gradient(180deg, #fff3dc 0%, #ffd9a1 40%, #ff8a3c 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        filter: drop-shadow(0 0 48px rgba(255,138,60,.45))
                drop-shadow(0 2px 4px rgba(0,0,0,.8));
      }`;
    document.head.appendChild(css);
    const v = document.createElement('div'); v.id = 'heroVig';
    document.body.appendChild(v);
  });

  const shot = async (name) => {
    const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
    await page.evaluate(async ([n, d]) => {
      await fetch('http://localhost:9099/', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ dir: 'hero3', ext: 'png', frames: [{ i: n, d }] }),
      });
    }, [name, b64]);
  };

  // Turn him three-quarters toward the camera. `facing` is a plain yaw the
  // update loop only touches while there is movement input, so setting it on a
  // standing character sticks.
  const faceCamera = () => page.evaluate(() => {
    const g = window.__gam
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
{"shots":6,"candidateSpots":40}
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

**`Bash`** — Review refined hero candidates
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/hero3
magick montage f0000?.png -tile 2x3 -geometry 640x360+5+5 -background '#111' $R/sheet_h3.png 2>/dev/null
identify $R/sheet_h3.png | head -1
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_h3.png PNG 1300x1110 1300x1110+0+0 16-bit sRGB 2.17494MiB 0.000u 0:00.000
```
</details>

**`Read`**

Candidate 4 is the strongest — rock forms framing him, warm pool, crystal for cool contrast. Let me look at it full size:

**`Read`**

Close, but the torch barely reads — it's a small blob in his hand, and the user asked specifically for him *with his torch*. Let me get closer and rotate the camera to put the torch arm toward the lens:

**`Bash`** — Sweep camera azimuth to find the torch-forward angle
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
rm -f $R/hero3.js
{
echo 'async (page) => {'
cat $R/common.txt
cat <<'TAIL'
  const dressUp = () => page.evaluate(() => {
    document.getElementById('hud').style.display = 'none';
    const css = document.createElement('style');
    css.textContent = `
      #heroVig { position: fixed; left:0; right:0; top:0; height:44%;
        background: linear-gradient(180deg, rgba(0,0,0,.60), rgba(0,0,0,0));
        pointer-events:none; z-index:29; }
      #heroTitle { position: fixed; left:0; right:0; top:7%;
        display:grid; justify-items:center; pointer-events:none; z-index:30; }
      #heroTitle h1 { margin:0; font-size: clamp(54px, 8.6vw, 142px);
        font-weight:600; line-height:1; letter-spacing:.24em; text-indent:.24em;
        background: linear-gradient(180deg,#fff3dc 0%,#ffd9a1 40%,#ff8a3c 100%);
        -webkit-background-clip:text; background-clip:text; color:transparent;
        filter: drop-shadow(0 0 48px rgba(255,138,60,.45))
                drop-shadow(0 2px 4px rgba(0,0,0,.8)); }`;
    document.head.appendChild(css);
    const t = document.createElement('div');
    t.id = 'heroTitle'; t.innerHTML = '<h1>TORCHBOY</h1>';
    const v = document.createElement('div'); v.id = 'heroVig';
    document.body.appendChild(v); document.body.appendChild(t);
  });
  const shot = async (n) => {
    const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
    await page.evaluate(async ([i, d]) => {
      await fetch('http://localhost:9099/', { method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ dir: 'hero4', ext: 'png', frames: [{ i, d }] }) });
    }, [n, b64]);
  };

  await boot(1600, 900, 6);
  await dressUp();
  const spot = await page.evaluate(() => {
    const g = window.__game, grid = g.grid;
    const open = (tx,ty) => '.FT*P<>'.includes(grid.char(0,tx,ty));
    const solid = (tx,ty) => '# S'.includes(grid.char(0,tx,ty));
    const out = [];
    for (let ty=2; ty<grid.H-2; ty++) for (let tx=2; tx<grid.W-2; tx++) {
      if (!open(tx,ty)) continue;
      let w=0; for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) if (solid(tx+dx,ty+dy)) w++;
      i
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
{"spot":{"tx":12,"ty":5,"w":12},"info":[{"az":0.25,"flameScreen":{"x":45.9,"y":45.1}},{"az":0.75,"flameScreen":{"x":46.9,"y":46}},{"az":1.25,"flameScreen":{"x":46.3,"y":45.9}},{"az":1.75,"flameScreen":{"x":46.7,"y":45.5}}]}
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

**`Bash`** — Review azimuth sweep
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R/frames/hero4
magick montage f00000.png f00001.png f00002.png f00003.png -tile 2x2 -geometry 700x394+5+5 -background '#111' $R/sheet_h4.png 2>/dev/null
identify $R/sheet_h4.png | head -1
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/sheet_h4.png PNG 1420x808 1420x808+0+0 16-bit sRGB 1.54745MiB 0.000u 0:00.000
```
</details>

**`Read`**

**`Read`**

He reads well now — giant head, mohawk, face, torch in hand, ember flask below. Just needs the dead bottom third cropped:

**`Bash`** — Crop hero to tighten composition
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
M=~/proj/me/learn/blender-mcp/cavern-game/docs/media
cd $R
magick frames/hero4/f00000.png -crop 1600x740+0+20 +repage -strip -define png:compression-level=9 $R/hero_crop.png
identify $R/hero_crop.png
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/hero_crop.png PNG 1600x740 1600x740+0+0 8-bit sRGB 199746B 0.000u 0:00.000
```
</details>

**`Read`**

**`Bash`** — Try a tighter banner crop
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
cd $R
magick frames/hero4/f00000.png -crop 1600x648+0+18 +repage -strip -define png:compression-level=9 $R/hero_tight.png
identify $R/hero_tight.png
```
<details><summary>result</summary>

```
~/proj/me/learn/blender-mcp/.capture-tmp/hero_tight.png PNG 1600x648 1600x648+0+0 8-bit sRGB 196695B 0.000u 0:00.000
```
</details>

**`Read`**

That's the one. Installing it:

**`Bash`** — Install hero and update alt text
```bash
R=~/proj/me/learn/blender-mcp/.capture-tmp
M=~/proj/me/learn/blender-mcp/cavern-game/docs/media
cp $R/hero_tight.png $M/hero.png
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
old = "![Torchboy in the dark, torch raised, crystal catching the light](docs/media/hero.png)"
new = "![TORCHBOY — the boy and his torch alone in the dark](docs/media/hero.png)"
if old not in s: sys.exit('MISS alt')
open(p,'w').write(s.replace(old,new,1)); print('alt text updated')
PY
identify $M/hero.png
ls -lh $M
du -sh $M
```
<details><summary>result</summary>

```
alt text updated
~/proj/me/learn/blender-mcp/cavern-game/docs/media/hero.png PNG 1600x648 1600x648+0+0 8-bit sRGB 196695B 0.000u 0:00.000
total 16488
-rw-r--r--@ 1 apshoemaker  staff   3.0M Sep  6 14:17 discovery.gif
-rw-r--r--@ 1 apshoemaker  staff   2.5M Sep  6 14:52 ending.gif
-rw-r--r--@ 1 apshoemaker  staff   1.6M Sep  6 14:17 gate.gif
-rw-r--r--@ 1 apshoemaker  staff   192K Sep  6 19:55 hero.png
8.1M	~/proj/me/learn/blender-mcp/cavern-game/docs/media
```
</details>

**`Bash`** — Verify README and clean up
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '1,20p' README.md
echo "=== links resolve ==="
grep -oE '\(docs/media/[^)]+\)' README.md | tr -d '()' | while read f; do [ -e "$f" ] && echo "  ok $f" || echo "  MISS $f"; done
echo "=== cleanup ==="
R=~/proj/me/learn/blender-mcp/.capture-tmp
pkill -f "capture-tmp/sink.mjs" 2>/dev/null
rm -rf $R/frames $R/sheet*.png $R/hero_crop.png $R/hero_tight.png
du -sh $R; echo "sink stopped"
```
<details><summary>result</summary>

```
# Torchboy — The Deep Hollow

An isometric cavern crawler that runs in the browser. You are a small boy with an
enormous head and a mohawk, carrying a torch through three levels of unlit cave.
Hidden passages are sealed behind rock that looks exactly like every other wall —
your torch is the instrument that finds them.

All art is generated in **Blender** by script and exported to glTF; the game runs
on **three.js**. The caves, and the story told over them, are different every run.

![TORCHBOY — the boy and his torch alone in the dark](docs/media/hero.png)

``​`bash
npm install
npm run dev        # http://localhost:5173
``​`

---

## What it looks like
=== links resolve ===
  ok docs/media/hero.png
  ok docs/media/discovery.gif
  ok docs/media/gate.gif
  ok docs/media/ending.gif
=== cleanup ===
144K	~/proj/me/learn/blender-mcp/.capture-tmp
sink stopped
```
</details>

New hero is in — **TORCHBOY** set above him in the game's own ember gradient, with the boy and his lit torch below.

**What it took to get there.** The first pass had him tiny and lost in black, so I made three changes: pulled the camera in hard (viewSize 6 — he's now ~240px rather than ~44px), turned him three-quarters toward the lens so his face, mohawk and the torch in his hand all read, and swept the camera azimuth to find the angle where the torch arm is on the near side instead of hidden behind his body. Then cropped to a 1600×648 banner to cut the dead lower third.

**The title** isn't invented styling — it's the loading screen's own treatment scaled up: the same `#ffd9a1 → #ff8a3c` ember gradient clipped to the text, letterspaced wide, with a warm bloom and a hard drop shadow so it holds against the rock. A soft top vignette seats it without painting a visible band. HUD is hidden — a title card should be the world and the name, not the instrumentation.

Everything in the frame is the real game: real cave geometry, real torch light, the ember flask sitting in the pool below him. Only the title and the vignette are overlaid.

192KB, and all four media links resolve. Capture rig cleaned back down to 144K of scripts, outside the repo.


---
[← 22-lol-maybe-not-go-down-again.md](22-lol-maybe-not-go-down-again.md)  ·  [index](README.md)