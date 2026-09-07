# 26. cool let's add a .env.example, so the user knows what to set

[← index](README.md)

## The prompt

> cool let's add a .env.example, so the user knows what to set

## What happened

**`Bash`** — Find every env var actually read
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== every env var the code actually reads ==="
grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*|process\.env\[['\"][A-Z_][A-Z0-9_]*" \
  server.mjs tools/*.mjs vite.config.mjs src 2>/dev/null \
  | sed "s/.*process\.env[.[]//; s/['\"]//" | sort -u | sed 's/^/  /'
echo
echo "=== plus anything the SDK resolves implicitly ==="
grep -n "ANTHROPIC_AUTH_TOKEN\|ant auth login" tools/story-plugin.mjs | head -3
echo
echo "=== BLENDER, used by the asset script ==="
grep -n 'BLENDER' tools/build_assets.sh | head -2
echo
echo "=== is .env.example already whitelisted? ==="
grep -n "env" .gitignore .dockerignore
```
<details><summary>result</summary>

```
=== every env var the code actually reads ===
  ANTHROPIC_API_KEY
  ANTHROPIC_AUTH_TOKEN
  ANTHROPIC_WORKSPACE_ID
  HOST
  PORT
  STORY_EFFORT
  STORY_MODEL

=== plus anything the SDK resolves implicitly ===
168:    // Zero-arg constructor: resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
169:    // or an `ant auth login` profile, in that order.
212:        label = 'no Anthropic credentials - set ANTHROPIC_API_KEY or run `ant auth login`';

=== BLENDER, used by the asset script ===
10:BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
11:[ -x "$BLENDER" ] || { echo "Blender not found at $BLENDER (set \$BLENDER)"; exit 1; }

=== is .env.example already whitelisted? ===
.gitignore:8:.env
.gitignore:9:.env.*
.gitignore:10:!.env.example
.dockerignore:2:# environment at runtime (compose `env_file`, or `docker run --env-file`).
.dockerignore:3:.env
.dockerignore:4:.env.*
.dockerignore:5:!.env.example
```
</details>

All eight, and `.env.example` is already whitelisted in both ignore files. One detail matters: my loader and `docker --env-file` both treat everything after `=` literally, so inline comments would become part of the value. Comments go on their own lines:

**`Bash`** — Write .env.example and verify it parses cleanly
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > .env.example <<'EOF'
# Torchboy - example environment.
#
#   cp .env.example .env
#
# NOTHING HERE IS REQUIRED. With an empty .env the game builds, runs and plays
# normally; it just narrates from a written fallback set instead of writing the
# story live. Narration is a flourish, never a gate.
#
# .env and .env.* are gitignored, and .dockerignore keeps them out of the image.
# Credentials reach the container through the environment at runtime
# (`docker run --env-file .env`, or compose `env_file`), never through a layer.
#
# NOTE: values are taken literally to the end of the line - by this file's
# loader, and by `docker --env-file`. Do not put a comment after a value:
# `PORT=8080 # the port` sets PORT to "8080 # the port". Comments go on their
# own line, as they are here.


# ---------------------------------------------------------------- the story
# Written by Claude while you play. Roughly $0.03-0.05 per playthrough on the
# default model. Get a key at https://console.anthropic.com/settings/keys
#
# Leave blank to play with the written fallback beats.
ANTHROPIC_API_KEY=

# Only for ORG-LEVEL keys. If you see a 400 saying the key is "not scoped to a
# workspace", set this (Console -> Settings -> Workspaces). Workspace-scoped
# keys need nothing here.
ANTHROPIC_WORKSPACE_ID=

# Alternative to ANTHROPIC_API_KEY; the SDK resolves API key, then auth token,
# then an `ant auth login` profile, in that order. Leave blank unless you use it.
#ANTHROPIC_AUTH_TOKEN=

# Optional. Defaults are claude-sonnet-5 and low - short creative prose, not hard
# reasoning, and about a third of the cost of Opus per run.
#STORY_MODEL=claude-sonnet-5
#STORY_EFFORT=low


# ---------------------------------------------------------------- the server
# Used by `npm start` and by the container. The Vite dev server ignores these
# and always serves on 5173.
#PORT=8080
#HOST=0.0.0.0


# ---------------------------------------------------------------- assets
# Only needed for `npm run assets`, which rebuilds the .glb files from the
# Blender sources. Not needed to play - the assets are committed.
#BLENDER=/Applications/Blender.app/Contents/Ma
… [truncated]
```
<details><summary>result</summary>

```
=== does an empty key degrade gracefully, or error badly? ===
torchboy on http://0.0.0.0:8080
  story: no credentials - the game will use its written fallback beats
  page:  200
  story: 503  (503 = graceful fallback, what we want)
```
</details>

Empty key degrades to a graceful 503, so `cp .env.example .env` is immediately playable. Let me confirm the host-side loader treats the commented lines correctly:

**`Bash`** — Verify the loader parses .env.example correctly
```bash
cd /tmp && rm -rf envtest && mkdir envtest && cd envtest
cp ~/proj/me/learn/blender-mcp/cavern-game/.env.example .env
node -e "
const fs=require('fs'),path=require('path');
// the exact loader from server.mjs
for (const dir of ['.']) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file,'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\$/);
    if (!m) continue;
    const [,k,raw]=m;
    if (process.env[k] !== undefined) continue;
    process.env[k]=raw.trim().replace(/^(['\"])(.*)\1\$/,'\$2');
  }
}
const mine=['ANTHROPIC_API_KEY','ANTHROPIC_WORKSPACE_ID','ANTHROPIC_AUTH_TOKEN','STORY_MODEL','STORY_EFFORT','PORT','HOST','BLENDER'];
for (const k of mine) console.log('  '+k.padEnd(24), JSON.stringify(process.env[k]));
"
echo "--- commented lines must be undefined, blanks must be empty string ---"
cd /tmp && rm -rf envtest
```
<details><summary>result</summary>

```
  ANTHROPIC_API_KEY        ""
  ANTHROPIC_WORKSPACE_ID   ""
  ANTHROPIC_AUTH_TOKEN     undefined
  STORY_MODEL              undefined
  STORY_EFFORT             undefined
  PORT                     undefined
  HOST                     undefined
  BLENDER                  undefined
--- commented lines must be undefined, blanks must be empty string ---
Shell cwd was reset to ~/proj/me/learn/blender-mcp
```
</details>

Parses exactly right — blanks become empty strings (graceful), commented lines stay undefined so defaults apply. Wiring it into the docs:

**`Bash`** — Document .env.example and verify ignore rules
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
def sub(p, old, new, label):
    s=open(p).read()
    if old not in s: sys.exit(f'MISS {label}')
    open(p,'w').write(s.replace(old,new,1)); print('ok:', label)

sub('docs/SETUP.md',
"""The story is written by Claude at play time. Put a key in `.env` in this
directory (or one level up — both are checked):

``​`bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_WORKSPACE_ID=wrkspc_...   # only for org-level keys
STORY_MODEL=claude-sonnet-5         # optional; this is the default
STORY_EFFORT=low                    # optional; this is the default
``​`""",
"""The story is written by Claude at play time. Start from the example, which
documents every variable the project reads:

``​`bash
cp .env.example .env
``​`

Then fill in `ANTHROPIC_API_KEY`. Everything in that file is optional — copied
as-is with nothing filled in, the game runs and uses its written fallback beats.
`.env` is also checked one directory up, so a key kept outside the project works.

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | enables the live story |
| `ANTHROPIC_WORKSPACE_ID` | only for org-level keys |
| `ANTHROPIC_AUTH_TOKEN` | alternative to the API key |
| `STORY_MODEL` / `STORY_EFFORT` | default `claude-sonnet-5` / `low` |
| `PORT` / `HOST` | `npm start` and the container only; `npm run dev` is always 5173 |
| `BLENDER` | only for `npm run assets` |

**Values are read literally to the end of the line**, by this project's loader
and by `docker --env-file` alike. `PORT=8080 # the port` sets `PORT` to
`"8080 # the port"`. Put comments on their own line.""",
    'setup env')

sub('docs/DEPLOYMENT.md',
"""`--env-file` is optional. Without credentials the game runs normally and uses its
written fallback beats — narration is a flourish, never a gate.""",
"""`--env-file` is optional. Without credentials the game runs normally and uses its
written fallback beats — narration is a flourish, never a gate. `cp .env.example
.env` gives you a documented starting point; copied unfilled it is a valid,
playable configuration.""",
    'deployment env')

sub('AGENTS.md',
"""Assets are committed, so the game runs without Blender. `.env` is optiona
… [truncated]
```
<details><summary>result</summary>

```
ok: setup env
ok: deployment env
ok: agents env
=== final check ===
# Torchboy - example environment.
#
#   cp .env.example .env
...
  uncommented vars: 2
  commented vars:   6

  PROBLEM: .env.example is gitignored
  .env still ignored (correct)
ok  150 runs / 450 levels, all invariants hold (10.2ms per run)
✓ built in 758ms
```
</details>

`.env.example` is being ignored despite the negation — let me see which rule wins:

**`Bash`** — Find the rule ignoring .env.example
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
git check-ignore -v .env.example
echo "--- .gitignore env block ---"
grep -n "env" .gitignore
```
<details><summary>result</summary>

```
.gitignore:10:!.env.example	.env.example
--- .gitignore env block ---
8:.env
9:.env.*
10:!.env.example
```
</details>

`git check-ignore -v` prints the last *matching* pattern, negation included — so my exit-code check was misleading. The authoritative test is whether git would actually track it:

**`Bash`** — Definitively verify ignore behaviour
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== would git commit these? ==="
git ls-files --others --exclude-standard | grep -E "^\.env" || echo "  (no .env* files listed)"
echo
echo "=== definitive per-file ==="
for f in .env .env.example; do
  if git ls-files --others --exclude-standard --directory | grep -qx "$f"; then
    echo "  $f -> WILL be committed"
  else
    echo "  $f -> ignored"
  fi
done
echo
echo "=== and docker? ==="
docker build -t torchboy:envcheck . >/dev/null 2>&1
docker run --rm torchboy:envcheck sh -c 'ls -a /app | grep -c "^\.env" || echo "  no .env* in image"'
```
<details><summary>result</summary>

```
=== would git commit these? ===
.env.example

=== definitive per-file ===
  .env -> ignored
  .env.example -> WILL be committed

=== and docker? ===
0
  no .env* in image
```
</details>

**`Bash`** — Show the final file
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker rmi torchboy:envcheck >/dev/null 2>&1
echo "=== .env.example ==="
cat .env.example
```
<details><summary>result</summary>

```
=== .env.example ===
# Torchboy - example environment.
#
#   cp .env.example .env
#
# NOTHING HERE IS REQUIRED. With an empty .env the game builds, runs and plays
# normally; it just narrates from a written fallback set instead of writing the
# story live. Narration is a flourish, never a gate.
#
# .env and .env.* are gitignored, and .dockerignore keeps them out of the image.
# Credentials reach the container through the environment at runtime
# (`docker run --env-file .env`, or compose `env_file`), never through a layer.
#
# NOTE: values are taken literally to the end of the line - by this file's
# loader, and by `docker --env-file`. Do not put a comment after a value:
# `PORT=8080 # the port` sets PORT to "8080 # the port". Comments go on their
# own line, as they are here.


# ---------------------------------------------------------------- the story
# Written by Claude while you play. Roughly $0.03-0.05 per playthrough on the
# default model. Get a key at https://console.anthropic.com/settings/keys
#
# Leave blank to play with the written fallback beats.
ANTHROPIC_API_KEY=

# Only for ORG-LEVEL keys. If you see a 400 saying the key is "not scoped to a
# workspace", set this (Console -> Settings -> Workspaces). Workspace-scoped
# keys need nothing here.
ANTHROPIC_WORKSPACE_ID=

# Alternative to ANTHROPIC_API_KEY; the SDK resolves API key, then auth token,
# then an `ant auth login` profile, in that order. Leave blank unless you use it.
#ANTHROPIC_AUTH_TOKEN=

# Optional. Defaults are claude-sonnet-5 and low - short creative prose, not hard
# reasoning, and about a third of the cost of Opus per run.
#STORY_MODEL=claude-sonnet-5
#STORY_EFFORT=low

… [truncated]
```
</details>

Added `.env.example`, covering all eight variables the code actually reads — I grepped `process.env` across `server.mjs`, `tools/`, `vite.config.mjs` and `src/` rather than listing the ones I remembered, which is how `ANTHROPIC_AUTH_TOKEN` and `BLENDER` made it in.

**Shape of it.** The two you'd normally fill (`ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`) are present and blank; the six with sensible defaults are commented out so the defaults apply. That makes `cp .env.example .env` a valid, playable configuration on its own — verified: an empty key degrades to a graceful `503` and the written fallback beats, not an auth error.

**One gotcha documented in the file**, because it would otherwise cost someone an afternoon: values are read literally to end-of-line, by both this project's loader and `docker --env-file`. `PORT=8080 # the port` sets `PORT` to `"8080 # the port"`. So every comment sits on its own line, including in the example itself.

**Verified rather than assumed:**
- Parsed through the exact loader from `server.mjs` — blanks become empty strings, commented lines stay `undefined` so defaults apply.
- Run as a real `--env-file` against the container: page 200, story 503, graceful fallback message in the logs.
- `.env` → ignored, `.env.example` → will be committed, neither ends up in the image.

That last one I initially misread: `git check-ignore -v` prints the last *matching* pattern, and for `.env.example` that's the negation `!.env.example`, so my exit-code check reported a problem that wasn't one. The authoritative check — whether `git ls-files --others --exclude-standard` lists it — confirms it's tracked correctly.

Docs updated in three places: `SETUP.md` now leads with `cp .env.example .env` and carries the full variable table, `DEPLOYMENT.md` notes the unfilled copy is valid, and `AGENTS.md` points at it from bootstrap.


---
[← 25-i-need-this-to-be-containerized.md](25-i-need-this-to-be-containerized.md)  ·  [index](README.md)