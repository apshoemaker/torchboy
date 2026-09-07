# 17. can you restart it then?

[← index](README.md)

## The prompt

> can you restart it then?

## What happened

**`Bash`** — Check configured dev port
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
grep -n "port\|server" vite.config.* 2>/dev/null | head -20
echo "--- scripts ---"
python3 -c "import json;print(json.load(open('package.json')).get('scripts'))"
```
<details><summary>result</summary>

```
1:import { defineConfig, loadEnv } from 'vite';
2:import path from 'node:path';
3:import { storyPlugin } from './tools/story-plugin.mjs';
5:export default defineConfig(({ mode }) => {
--- scripts ---
{'dev': 'vite', 'build': 'vite build', 'preview': 'vite preview --port 4173', 'assets': 'bash tools/build_assets.sh', 'levels': 'node tools/gen_levels.mjs && node tools/validate_levels.mjs'}
```
</details>

**`Bash`** — Start dev server
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
pkill -f "vite" 2>/dev/null; sleep 1
(npm run dev > /tmp/vite-dev.log 2>&1 &) ; sleep 6
grep -E "Local|ready|error" /tmp/vite-dev.log | head
```
<details><summary>result</summary>

```
  VITE v7.3.6  ready in 184 ms
  ➜  Local:   http://localhost:5173/
```
</details>

**`Bash`** — Verify page and story endpoint live
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== page ==="
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
echo "=== opening beat through the live server ==="
curl -s -X POST http://localhost:5173/api/story/next -H 'Content-Type: application/json' \
  -d '{"want":"beat","told":[],"events":["he woke on cold stone at the bottom of the dark"],"summary":"the deepest cavern, nothing explored"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('text') or d); print('--- keys:', list(d)); print('--- %.1fs' % (d.get('ms',0)/1000))"
```
<details><summary>result</summary>

```
=== page ===
200
=== opening beat through the live server ===
He gripped the brass compass tight, the one he'd lifted from Aldous Pike's workbench, and told himself Pike wouldn't miss it long.
--- keys: ['text', 'ms', 'usage']
--- 7.7s
```
</details>

Running at **http://localhost:5173/**.

Story endpoint is live through the dev server — opening beat came back in 7.7s, with `premise` gone from the response (`text`, `ms`, `usage` only). This run's opening: a brass compass lifted from Aldous Pike's workbench.


---
[← 16-ok-that-premise-holds-it-the.md](16-ok-that-premise-holds-it-the.md)  ·  [index](README.md)