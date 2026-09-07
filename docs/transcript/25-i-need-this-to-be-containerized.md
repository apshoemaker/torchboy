# 25. I need this to be containerized, too, please

[← index](README.md)

## The prompt

> I need this to be containerized, too, please

## What happened

Containerizing this has one real design question: the story API is Vite middleware, so a plain static image would silently lose it — and shipping a container where narration just never appears is the kind of failure that looks like "no API key". Let me look at how the handler is exposed:

**`Bash`** — Read plugin export and vite config
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
sed -n '/^export function storyPlugin/,$p' tools/story-plugin.mjs
echo "=== vite config ==="; cat vite.config.mjs
```
<details><summary>result</summary>

```
export function storyPlugin() {
  let client = null;
  let clientError = null;
  try {
    // Zero-arg constructor: resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
    // or an `ant auth login` profile, in that order.
    //
    // An org-level key (one not scoped to a single workspace) is rejected with
    // a 400 unless the request names a workspace, so pass one through when it
    // is configured. Workspace-scoped keys need nothing here.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic(workspace
      ? { defaultHeaders: { 'anthropic-workspace-id': workspace } }
      : {});
  } catch (e) {
    clientError = e.message;
  }

  const readBody = (req) => new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });

  const handler = async (req, res, next) => {
    if (!req.url.startsWith('/api/story')) return next();
    res.setHeader('Content-Type', 'application/json');

    if (!client) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'no Anthropic credentials', detail: clientError }));
      return;
    }
    if (!req.url.startsWith('/api/story/next')) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'use POST /api/story/next' }));
      return;
    }

    try {
… [truncated]
```
</details>

The handler is created inside the plugin closure. Let me extract it so a real server can mount the same code — no duplicated request handling, and the key stays server-side either way:

**`Bash`** — Extract the story handler from the Vite plugin
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='tools/story-plugin.mjs'; s=open(p).read()

old = """export function storyPlugin() {"""
new = """/**
 * The request handler on its own, so it can be mounted by something that is not
 * Vite. `vite dev` and `vite preview` get it through the plugin below; the
 * container runs it under `server.mjs`. One implementation either way - the
 * alternative was a second copy of this logic that would drift.
 *
 * Signature is connect-style `(req, res, next)`: anything that is not
 * /api/story is passed straight through.
 */
export function createStoryHandler() {"""
assert old in s, 'MISS open'; s = s.replace(old, new, 1)

old = """  return {
    name: 'torchboy-story',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}"""
new = """  return handler;
}

/** Vite plugin wrapper: same handler, mounted on dev and on preview. */
export function storyPlugin() {
  const handler = createStoryHandler();
  return {
    name: 'torchboy-story',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}"""
assert old in s, 'MISS close'; s = s.replace(old, new, 1)
open(p,'w').write(s); print('handler extracted')
PY
node --check tools/story-plugin.mjs && echo "syntax ok"
node -e "import('./tools/story-plugin.mjs').then(m=>console.log('exports:', Object.keys(m)))"
```
<details><summary>result</summary>

```
handler extracted
syntax ok
exports: [ 'createStoryHandler', 'storyPlugin' ]
```
</details>

**`Bash`** — Write the production server
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > server.mjs <<'EOF'
/**
 * Production server for the container: static `dist/` plus the story endpoint.
 *
 * Why this exists rather than serving `dist/` from nginx: the story API is a
 * server-side concern by design - the Anthropic key must never reach the
 * browser (docs/adr/0006). A static-only image would still *run*, but narration
 * would silently never appear, which looks exactly like a missing API key. So
 * the image serves the same two things the dev server does.
 *
 * `vite preview` also mounts the story handler and would have worked, but it is
 * a development convenience that documents itself as not for production. This
 * is ~100 lines of node:http with no framework and no Vite at runtime.
 *
 *   PORT   default 8080
 *   HOST   default 0.0.0.0
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStoryHandler } from './tools/story-plugin.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`no build found at ${ROOT} - run \`npm run build\` first`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.glb':  'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.map':  'application/json; charset=utf-8',
};

const story = createStoryHandler();

const server = http.createServer((req, res) => {
  // the story handler passes anything that is not /api/story through
  story(req, res, () => serveStatic(req, res));
});

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
… [truncated]
```
<details><summary>result</summary>

```
syntax ok
```
</details>

**`Bash`** — Test the production server end to end
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import json
p='package.json'; d=json.load(open(p))
s = d['scripts']
s['start'] = "node server.mjs"
d['scripts'] = {k: s[k] for k in ["dev","build","start","preview","check","test","levels","assets"]}
json.dump(d, open(p,'w'), indent=2); open(p,'a').write('\n')
print(json.dumps(d['scripts'], indent=2))
PY
npm run build >/dev/null 2>&1
PORT=8099 node server.mjs &
SRV=$!
sleep 1.5
echo "=== page ==="; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" localhost:8099/
echo "=== asset ==="; A=$(curl -s localhost:8099/ | grep -oE '/assets/[^"]+\.js' | head -1); echo "$A"
curl -s -o /dev/null -w "%{http_code} %{content_type} cache=%header{cache-control}\n" "localhost:8099$A"
echo "=== model ==="; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" localhost:8099/models/torchboy.glb
echo "=== health ==="; curl -s localhost:8099/healthz; echo
echo "=== traversal blocked? ==="; curl -s -o /dev/null -w "%{http_code}\n" "localhost:8099/../package.json"; curl -s -o /dev/null -w "%{http_code}\n" "localhost:8099/%2e%2e%2fpackage.json"
echo "=== story endpoint reachable ==="; curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8099/api/story/next -H 'Content-Type: application/json' -d '{"want":"beat","told":[],"events":[],"summary":"t"}'
echo "=== spa fallback ==="; curl -s -o /dev/null -w "%{http_code}\n" localhost:8099/some/deep/route
echo "=== missing asset 404s ==="; curl -s -o /dev/null -w "%{http_code}\n" localhost:8099/nope.js
kill $SRV 2>/dev/null
```
<details><summary>result</summary>

```
{
  "dev": "vite",
  "build": "vite build",
  "start": "node server.mjs",
  "preview": "vite preview --port 4173",
  "check": "node tools/validate_levels.mjs && vite build",
  "test": "node tools/validate_levels.mjs 300",
  "levels": "node tools/validate_levels.mjs",
  "assets": "bash tools/build_assets.sh"
}
torchboy on http://0.0.0.0:8099
  story: no credentials - the game will use its written fallback beats
=== page ===
200 text/html; charset=utf-8
=== asset ===
/assets/index-DLjZ24vC.js
200 text/javascript; charset=utf-8 cache=public, max-age=31536000, immutable
=== model ===
200 model/gltf-binary
=== health ===
ok
=== traversal blocked? ===
404
403
=== story endpoint reachable ===
[story] no Anthropic credentials - set ANTHROPIC_API_KEY or run `ant auth login`: Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted
503
=== spa fallback ===
200
=== missing asset 404s ===
404
```
</details>

Server works — traversal blocked, SPA fallback correct, immutable caching on hashed assets only. One gap: `npm start` doesn't read `.env` the way `npm run dev` does. Let me fix that without letting a file override real container env:

**`Bash`** — Add .env loading with correct precedence, verify
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='server.mjs'; s=open(p).read()
old = """const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');"""
new = """const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'dist');

/**
 * Load .env for local `npm start`, matching what vite.config.mjs does for the
 * dev server. Real environment variables ALWAYS win: in a container the env is
 * the source of truth and a stray .env baked into an image must not override
 * it. (.dockerignore keeps .env out of the image in the first place.)
 */
for (const dir of [path.join(HERE, '..'), HERE]) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split('\\n')) {
    const m = line.match(/^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*)$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] !== undefined) continue;          // env wins
    process.env[k] = raw.trim().replace(/^(['"])(.*)\\1$/, '$2');
  }
}"""
assert old in s, 'MISS'
open(p,'w').write(s.replace(old,new,1)); print('ok')
PY
node --check server.mjs
npm run build >/dev/null 2>&1
PORT=8099 node server.mjs & SRV=$!
sleep 1.5
curl -s -X POST localhost:8099/api/story/next -H 'Content-Type: application/json' \
  -d '{"want":"beat","told":[],"events":[],"summary":"the deepest cavern"}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('story:', (d.get('text') or d.get('error'))[:90])"
echo "--- env must win over .env file ---"
kill $SRV 2>/dev/null; sleep 0.5
ANTHROPIC_API_KEY=sk-ant-[REDACTED] PORT=8099 node server.mjs & SRV=$!
sleep 1.5
curl -s -o /dev/null -w "with bad env key: %{http_code} (401 = env won over .env)\n" -X POST localhost:8099/api/story/next -H 'Content-Type: application/json' -d '{"want":"beat","told":[],"events":[],"summary":"t"}'
kill $SRV 2>/dev/null
```
<details><summary>result</summary>

```
ok
torchboy on http://0.0.0.0:8099
  story: credentials present
story: The dark pressed close and his torch guttered small, and something in his chest pressed ba
--- env must win over .env file ---
torchboy on http://0.0.0.0:8099
  story: credentials present
[story] bad credentials: 401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."},"request_id":null}
with bad env key: 401 (401 = env won over .env)
```
</details>

Precedence is correct — the environment beats the file. Now the container:

**`Bash`** — Check docker availability
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker version --format '{{.Server.Version}}' 2>/dev/null || docker --version 2>/dev/null || echo "docker NOT available"
```
<details><summary>result</summary>

```
Docker version 29.2.0, build 0b9d198
```
</details>

**`Bash`** — Write Dockerfile, dockerignore, compose
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > .dockerignore <<'EOF'
# Credentials must never enter the image. The server reads them from the
# environment at runtime (compose `env_file`, or `docker run --env-file`).
.env
.env.*
!.env.example

node_modules
dist
.git
.gitignore

# docs and media are ~8MB of gifs the runtime never serves
docs
README.md
AGENTS.md
CLAUDE.md

# asset SOURCES are not needed at runtime - the built .glb files in public/ are
blender
tools/gen_levels.mjs
tools/build_assets.sh

Dockerfile
.dockerignore
compose.yaml
.nvmrc
.playwright-mcp
**/__pycache__
*.blend1
EOF

cat > Dockerfile <<'EOF'
# syntax=docker/dockerfile:1

# Torchboy. Two stages: build the client bundle, then ship a runtime that has
# no build toolchain in it.
#
# The runtime is NOT a static file server. The story endpoint has to run
# server-side, because the Anthropic key must never reach the browser
# (docs/adr/0006). A static-only image would still boot, but narration would
# silently never appear. `server.mjs` serves dist/ and mounts the same story
# handler the dev server uses.

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app

# deps first, so a source-only change does not reinstall them
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.mjs ./
COPY src ./src
COPY public ./public
COPY tools ./tools
RUN npm run build

# validate the cave generator against the built source - a container that
… [truncated]
```
<details><summary>result</summary>

```
--- files written ---
-rw-r--r--@ 1 apshoemaker  staff   522 Sep  7 09:18 .dockerignore
-rw-r--r--@ 1 apshoemaker  staff   469 Sep  7 09:18 compose.yaml
-rw-r--r--@ 1 apshoemaker  staff  1784 Sep  7 09:18 Dockerfile
-rw-r--r--@ 1 apshoemaker  staff  5064 Sep  7 09:18 server.mjs
```
</details>

**`Bash`** — Build the image
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker build -t torchboy:latest . 2>&1 | tail -25
```
<details><summary>result</summary>

```
ERROR: Cannot connect to the Docker daemon at unix://~/.docker/run/docker.sock. Is the docker daemon running?
```
</details>

Docker CLI is there but the daemon isn't running. Let me check for an already-running alternative before launching anything:

**`Bash`** — Look for an available container runtime
```bash
which colima podman orbstack nerdctl 2>/dev/null
ls -d /Applications/Docker.app /Applications/OrbStack.app 2>/dev/null
docker context ls 2>/dev/null | head
```
<details><summary>result</summary>

```
colima not found
podman not found
orbstack not found
nerdctl not found
/Applications/Docker.app
NAME              DESCRIPTION                               DOCKER ENDPOINT                                     ERROR
default           Current DOCKER_HOST based configuration   unix:///var/run/docker.sock                         
desktop-linux *   Docker Desktop                            unix://~/.docker/run/docker.sock
```
</details>

Docker Desktop is installed but stopped. Starting it so I can actually verify the image rather than hand you an unbuilt Dockerfile:

**`Bash`** — Start Docker Desktop and wait for the daemon
```bash
open -a Docker 2>&1 || echo "could not launch"
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then echo "daemon up after ~$((i*5))s"; break; fi
  sleep 5
done
docker info --format 'server: {{.ServerVersion}}  arch: {{.Architecture}}' 2>/dev/null || echo "still not up"
```
<details><summary>result</summary>

```
daemon up after ~10s
server: 29.2.0  arch: aarch64
```
</details>

**`Bash`** — Build the image
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker build -t torchboy:latest . 2>&1 | tail -30
```
<details><summary>result</summary>

```
#16 1.642 - Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
#16 1.642 - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
#16 1.642 ✓ built in 1.16s
#16 DONE 1.7s

#17 [build 10/10] RUN node tools/validate_levels.mjs 60
#17 0.916 ok  60 runs / 180 levels, all invariants hold (13.4ms per run)
#17 DONE 0.9s

#18 [runtime 5/7] COPY --from=build /app/dist ./dist
#18 DONE 0.0s

#19 [runtime 6/7] COPY server.mjs ./
#19 DONE 0.0s

#20 [runtime 7/7] COPY tools/story-plugin.mjs ./tools/story-plugin.mjs
#20 DONE 0.0s

#21 exporting to image
#21 exporting layers
#21 exporting layers 0.9s done
#21 exporting manifest sha256:22277d775c2cd89fca826c0c8738ffddefa8026e925c2737d05b9ad60a7dccb5
#21 exporting manifest sha256:22277d775c2cd89fca826c0c8738ffddefa8026e925c2737d05b9ad60a7dccb5 done
#21 exporting config sha256:37fa146221def40914503fe3aeb8df5c587edea5076407a28f2974bac52f4205 done
#21 exporting attestation manifest sha256:517dc91898e0f9242d2704c74f472ee6512c6d2c20b050193d29d5fdb41d7e8b done
#21 exporting manifest list sha256:de57bee600be8c7c940102b6f7e2537b3777301a1b63864f01f765a606e71546 done
#21 naming to docker.io/library/torchboy:latest done
#21 unpacking to docker.io/library/torchboy:latest
#21 unpacking to docker.io/library/torchboy:latest 0.2s done
#21 DONE 1.0s
```
</details>

Image builds, and the generator validation ran inside it. Now let me actually run it and verify the whole surface:

**`Bash`** — Run the container and verify it end to end
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker images torchboy:latest --format '  size: {{.Size}}'
docker rm -f tb >/dev/null 2>&1
docker run -d --name tb -p 8099:8080 torchboy:latest >/dev/null
sleep 3
echo "=== runs as? ==="; docker exec tb id
echo "=== page ==="; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" localhost:8099/
echo "=== model ==="; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" localhost:8099/models/torchboy.glb
echo "=== health ==="; curl -s localhost:8099/healthz; echo
echo "=== story without credentials (must be 503, game still plays) ==="
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8099/api/story/next -H 'Content-Type: application/json' -d '{"want":"beat","told":[],"events":[],"summary":"t"}'
echo "=== is .env in the image? (must be absent) ==="
docker exec tb sh -c 'ls -a /app | tr "\n" " "'; echo
docker exec tb sh -c 'test -e /app/.env && echo "LEAK: .env present" || echo "  no .env in image"'
echo "=== any key material baked into layers? ==="
docker save torchboy:latest 2>/dev/null | tar -xO 2>/dev/null | grep -acE "sk-ant-[A-Za-z0-9_-]{20,}" || echo "  0 matches"
echo "=== vite/three shipped into runtime? (should be absent) ==="
docker exec tb sh -c 'ls /app/node_modules | wc -l; ls /app/node_modules | grep -E "^(vite|three)$" || echo "  no vite, no three"'
```
<details><summary>result</summary>

```
Exit code 1
size: 275MB
=== runs as? ===
Error response from daemon: container 1e0205a1ae215db694a3eb1f1e8ddbba01a18173ea332a03420635b146bcd644 is not running
=== page ===
000 
=== model ===
000 
=== health ===

=== story without credentials (must be 503, game still plays) ===
000
=== is .env in the image? (must be absent) ===
Error response from daemon: container 1e0205a1ae215db694a3eb1f1e8ddbba01a18173ea332a03420635b146bcd644 is not running

Error response from daemon: container 1e0205a1ae215db694a3eb1f1e8ddbba01a18173ea332a03420635b146bcd644 is not running
=== any key material baked into layers? ===
0
  0 matches
=== vite/three shipped into runtime? (should be absent) ===
Error response from daemon: container 1e0205a1ae215db694a3eb1f1e8ddbba01a18173ea332a03420635b146bcd644 is not running
```
</details>

**`Bash`** — Diagnose why the container exited
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker logs tb 2>&1 | tail -20
echo "--- exit code ---"; docker inspect tb --format '{{.State.ExitCode}} {{.State.Error}}'
```
<details><summary>result</summary>

```
node:internal/modules/package_json_reader:314
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@anthropic-ai/sdk' imported from /app/tools/story-plugin.mjs
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:314:9)
    at packageResolve (node:internal/modules/esm/resolve:768:81)
    at moduleResolve (node:internal/modules/esm/resolve:855:18)
    at defaultResolve (node:internal/modules/esm/resolve:985:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:747:20)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:724:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:320:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:182:49) {
  code: 'ERR_MODULE_NOT_FOUND'
}

Node.js v22.23.2
--- exit code ---
1
```
</details>

The container exposed a real repo bug: `@anthropic-ai/sdk` and `zod` are listed as **devDependencies**, but `story-plugin.mjs` needs them at runtime. That never showed under Vite because dev deps are always installed. Fixing the labelling:

**`Bash`** — Move server deps to dependencies and rebuild
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import json
p='package.json'; d=json.load(open(p))
# The story middleware runs in Node at request time, so its imports are runtime
# dependencies, not build-time ones. Vite only hid this because dev deps are
# always installed in development.
for pkg in ['@anthropic-ai/sdk', 'zod']:
    d['dependencies'][pkg] = d['devDependencies'].pop(pkg)
d['dependencies'] = dict(sorted(d['dependencies'].items()))
json.dump(d, open(p,'w'), indent=2); open(p,'a').write('\n')
print('dependencies   :', json.dumps(d['dependencies']))
print('devDependencies:', json.dumps(d['devDependencies']))
PY
npm install --package-lock-only >/dev/null 2>&1
echo "--- rebuild ---"
docker build -t torchboy:latest . 2>&1 | grep -E "^#1[5-9] |DONE|ERROR|ok  " | tail -8
```
<details><summary>result</summary>

```
dependencies   : {"@anthropic-ai/sdk": "^0.124.0", "three": "^0.180.0", "zod": "^4.5.4"}
devDependencies: {"vite": "^7.1.0"}
--- rebuild ---
#17 0.900 ok  60 runs / 180 levels, all invariants hold (12.8ms per run)
#17 DONE 0.9s
#18 [runtime 5/7] COPY --from=build /app/dist ./dist
#18 DONE 0.0s
#19 [runtime 6/7] COPY server.mjs ./
#19 DONE 0.0s
#20 DONE 0.0s
#21 DONE 1.5s
```
</details>

**`Bash`** — Verify the running container fully
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker rm -f tb >/dev/null 2>&1
docker run -d --name tb -p 8099:8080 torchboy:latest >/dev/null
sleep 4
echo "=== state ==="; docker inspect tb --format '{{.State.Status}}'
docker images torchboy:latest --format '  image size: {{.Size}}'
echo "=== runs as ==="; docker exec tb id
echo "=== page ==="; curl -s -o /dev/null -w "  %{http_code} %{content_type}\n" localhost:8099/
echo "=== model ==="; curl -s -o /dev/null -w "  %{http_code} %{content_type}\n" localhost:8099/models/torchboy.glb
echo "=== health ==="; printf "  "; curl -s localhost:8099/healthz; echo
echo "=== story, no credentials (503 expected, game still plays) ==="
printf "  "; curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8099/api/story/next -H 'Content-Type: application/json' -d '{"want":"beat","told":[],"events":[],"summary":"t"}'
echo "=== .env absent from image? ==="
docker exec tb sh -c 'test -e /app/.env && echo "  LEAK" || echo "  no .env in image"'
docker exec tb sh -c 'ls -a /app | tr "\n" " "'; echo
echo "=== vite absent from runtime? ==="
docker exec tb sh -c 'ls /app/node_modules | grep -cx vite || echo "  vite not installed"'
echo "=== healthcheck reported by docker ==="
sleep 8; docker inspect tb --format '  {{.State.Health.Status}}'
```
<details><summary>result</summary>

```
=== state ===
running
image size: 303MB
=== runs as ===
uid=1000(node) gid=1000(node) groups=1000(node)
=== page ===
  200 text/html; charset=utf-8
=== model ===
  200 model/gltf-binary
=== health ===
  ok
=== story, no credentials (503 expected, game still plays) ===
  503
=== .env absent from image? ===
  no .env in image
. .. dist node_modules package-lock.json package.json server.mjs tools 
=== vite absent from runtime? ===
0
  vite not installed
=== healthcheck reported by docker ===
  healthy
```
</details>

Container is healthy, non-root, no `.env` baked in, no Vite in the runtime. Now the real test — with credentials, does the story actually work through the container?

**`Bash`** — Verify story works in container, and compose path
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker rm -f tb >/dev/null 2>&1
docker run -d --name tb -p 8099:8080 --env-file .env torchboy:latest >/dev/null
sleep 4
docker logs tb 2>&1 | tail -3
echo "=== story through the container ==="
curl -s -X POST localhost:8099/api/story/next -H 'Content-Type: application/json' \
  -d '{"want":"beat","told":[],"events":["he woke on cold stone at the bottom of the dark"],"summary":"the deepest cavern, nothing explored"}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(' ', (d.get('text') or d.get('error'))); print('  keys:', list(d)); print('  %.1fs' % (d.get('ms',0)/1000))"
echo
echo "=== compose path ==="
docker rm -f tb >/dev/null 2>&1
docker compose up -d 2>&1 | tail -3
sleep 5
docker compose ps --format '  {{.Service}}  {{.Status}}'
curl -s -o /dev/null -w "  page: %{http_code}\n" localhost:8080/
curl -s -o /dev/null -w "  story: %{http_code}\n" -X POST localhost:8080/api/story/next -H 'Content-Type: application/json' -d '{"want":"beat","told":[],"events":[],"summary":"t"}'
```
<details><summary>result</summary>

```
torchboy on http://0.0.0.0:8080
  story: credentials present
=== story through the container ===
  Cold stone pressed up through him before his eyes learned the dark, and the torch guttered like it, too, was afraid of what waited above.
  keys: ['text', 'ms', 'usage']
  2.3s

=== compose path ===
 Container cavern-game-torchboy-1 Created 
 Container cavern-game-torchboy-1 Starting 
 Container cavern-game-torchboy-1 Started 
torchboy  Up 5 seconds (health: starting)
  page: 200
  story: 200
```
</details>

**`Bash`** — See what dominates the runtime image
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker compose down >/dev/null 2>&1
docker run --rm torchboy:latest sh -c 'du -sh /app/node_modules; du -sh /app/node_modules/* | sort -rh | head -5'
```
<details><summary>result</summary>

```
56.4M	/app/node_modules
32.2M	/app/node_modules/three
13.5M	/app/node_modules/@anthropic-ai
7.8M	/app/node_modules/zod
1.2M	/app/node_modules/json-schema-to-ts
1.1M	/app/node_modules/@babel
```
</details>

`three` is 32MB of the runtime image and is never imported there — Vite bundles it into `dist/` at build time. That makes it a build dependency:

**`Bash`** — Move three to build deps, rebuild, verify
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import json
p='package.json'; d=json.load(open(p))
# three is bundled into dist/ by Vite and never imported at runtime, so it is a
# build-time dependency. Leaving it in `dependencies` put 32MB of it into the
# runtime image for nothing.
d['devDependencies']['three'] = d['dependencies'].pop('three')
d['devDependencies'] = dict(sorted(d['devDependencies'].items()))
json.dump(d, open(p,'w'), indent=2); open(p,'a').write('\n')
print('dependencies   :', json.dumps(d['dependencies']))
print('devDependencies:', json.dumps(d['devDependencies']))
PY
npm install --package-lock-only >/dev/null 2>&1
npm run check 2>&1 | grep -E "^ok|built|error"
docker build -t torchboy:latest . 2>&1 | grep -E "ERROR|ok  " ; docker images torchboy:latest --format 'image size: {{.Size}}'
docker rm -f tb >/dev/null 2>&1
docker run -d --name tb -p 8099:8080 torchboy:latest >/dev/null; sleep 4
echo "=== still serves, and three is bundled not installed ==="
curl -s -o /dev/null -w "  page: %{http_code}\n" localhost:8099/
A=$(curl -s localhost:8099/ | grep -oE '/assets/[^"]+\.js' | head -1)
curl -s "localhost:8099$A" | grep -c "THREE\|WebGLRenderer" | head -1 | sed 's/^/  three symbols in bundle: /'
docker exec tb sh -c 'du -sh /app/node_modules; ls /app/node_modules | grep -x three || echo "  three not in runtime"'
```
<details><summary>result</summary>

```
dependencies   : {"@anthropic-ai/sdk": "^0.124.0", "zod": "^4.5.4"}
devDependencies: {"three": "^0.180.0", "vite": "^7.1.0"}
ok  150 runs / 450 levels, all invariants hold (10.1ms per run)
✓ built in 747ms
#17 1.160 ok  60 runs / 180 levels, all invariants hold (16.7ms per run)
image size: 261MB
=== still serves, and three is bundled not installed ===
  page: 200
  three symbols in bundle: 12
24.2M	/app/node_modules
  three not in runtime
```
</details>

261MB, and three is in the bundle rather than the image. Let me confirm the actual game boots from the container, not just that the page returns 200:

**`playwright/browser_navigate`**
```js
http://localhost:8099/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:8099/');
``​`
### Page
- Page URL: http://localhost:8099/
- Page Title: Torchboy — The Deep Hollow
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-07T15-22-27-216Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-07T15-22-26-908Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
() => new Promise((res) => {
  const t0 = Date.now();
  const tick = () => {
    const g = window.__game;
    if (g?.props && document.getElementById('loading').classList.contains('gone')) {
      return res({
        booted: true,
        level: g.game.level,
        secretsOnLevel: g.cavern.countOn(0),
        stairsSealed: g.props.isSealed(0),
        propsSelfCheck: g.props.selfCheck(g.grid).length === 0 ? 'clean' : 'FAILED',
        storyLive: g.narrator.live,
        bootMs: Date.now() - t0,
      });
    }
    if (Date.now() - t0 > 60000) return res({ booted: false });
    setTimeout(tick, 300);
  };
  tick();
})
```
<details><summary>result</summary>

```
### Result
{
  "booted": true,
  "level": 0,
  "secretsOnLevel": {
    "total": 3,
    "found": 0,
    "complete": false
  },
  "stairsSealed": true,
  "propsSelfCheck": "FAILED",
  "storyLive": false,
  "bootMs": 1
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise((res) => {\n  const t0 = Date.now();\n  const tick = () => {\n    const g = window.__game;\n    if (g?.props && document.getElementById(\'loading\').classList.contains(\'gone\')) {\n      return res({\n        booted: true,\n        level: g.game.level,\n        secretsOnLevel: g.cavern.countOn(0),\n        stairsSealed: g.props.isSealed(0),\n        propsSelfCheck: g.props.selfCheck(g.grid).length === 0 ? \'clean\' : \'FAILED\',\n        storyLive: g.narrator.live,\n        bootMs: Date.now() - t0,\n      });\n    }\n    if (Date.now() - t0 > 60000) return res({ booted: false });\n    setTimeout(tick, 300);\n  };\n  tick();\n})');
``​`
### Page
- Page URL: http://localhost:8099/
- Page Title: Torchboy — The Deep Hollow
- Console: 1 errors, 2 warnings
### Events
- New console entries: .playwright-mcp/console-2026-09-07T15-22-26-908Z.log#L3-L5
```
</details>

`propsSelfCheck: FAILED` and a console error — let me look before drawing conclusions, since calling `selfCheck` mid-run has side effects of its own:

**`playwright/browser_console_messages`**
<details><summary>result</summary>

```
### Result
Total messages: 5 (Errors: 1, Warnings: 2)
Returning 3 messages for level "warning"

[ERROR] Failed to load resource: the server responded with a status of 503 (Service Unavailable) @ http://localhost:8099/api/story/next:0
[WARNING] [story] falling back: no Anthropic credentials - set ANTHROPIC_API_KEY or run `ant auth login` @ http://localhost:8099/assets/index-DLjZ24vC.js:3859
[WARNING] [props] off the ground or on the wrong level: [ember@L0 -0.08u, ember@L0 -0.05u, ember@L0 -0.05u] @ http://localhost:8099/assets/index-DLjZ24vC.js:3859
```
</details>

That warning is my own doing, not a bug: `selfCheck` is a **boot-time** check, and I called it mid-run after `update()` had bobbed the embers through their −0.13 arc. Let me confirm by loading clean and not touching it:

**`playwright/browser_navigate`**
```js
http://localhost:8099/
```
<details><summary>result</summary>

```
### Ran Playwright code
``​`js
await page.goto('http://localhost:8099/');
``​`
### Page
- Page URL: http://localhost:8099/
- Page Title: Torchboy — The Deep Hollow
- Console: 1 errors, 1 warnings
### Snapshot
- [Snapshot](.playwright-mcp/page-2026-09-07T15-23-07-922Z.yml)
### Events
- New console entries: .playwright-mcp/console-2026-09-07T15-23-07-741Z.log#L1-L2
```
</details>

**`playwright/browser_evaluate`**
```js
() => new Promise((res) => {
  const t0 = Date.now();
  const tick = () => {
    const g = window.__game;
    if (g?.props && document.getElementById('loading').classList.contains('gone')) {
      // do NOT call selfCheck here - it is a boot-time probe and it moves the
      // active level as a side effect. main.js already ran it before enterLevel.
      return res({
        booted: true, level: g.game.level,
        counts: g.cavern.countOn(0), stairsSealed: g.props.isSealed(0),
        embersVisible: g.props.items.filter(i => i.level === 0 && i.spec.kind === 'ember' && i.mesh.visible).length,
        storyLive: g.narrator.live, storyReady: g.narrator.ready,
      });
    }
    if (Date.now() - t0 > 60000) return res({ booted: false });
    setTimeout(tick, 300);
  };
  tick();
})
```
<details><summary>result</summary>

```
### Result
{
  "booted": true,
  "level": 0,
  "counts": {
    "total": 3,
    "found": 0,
    "complete": false
  },
  "stairsSealed": true,
  "embersVisible": 7,
  "storyLive": false,
  "storyReady": true
}
### Ran Playwright code
``​`js
await page.evaluate('() => new Promise((res) => {\n  const t0 = Date.now();\n  const tick = () => {\n    const g = window.__game;\n    if (g?.props && document.getElementById(\'loading\').classList.contains(\'gone\')) {\n      // do NOT call selfCheck here - it is a boot-time probe and it moves the\n      // active level as a side effect. main.js already ran it before enterLevel.\n      return res({\n        booted: true, level: g.game.level,\n        counts: g.cavern.countOn(0), stairsSealed: g.props.isSealed(0),\n        embersVisible: g.props.items.filter(i => i.level === 0 && i.spec.kind === \'ember\' && i.mesh.visible).length,\n        storyLive: g.narrator.live, storyReady: g.narrator.ready,\n      });\n    }\n    if (Date.now() - t0 > 60000) return res({ booted: false });\n    setTimeout(tick, 300);\n  };\n  tick();\n})');
``​`
### Events
- New console entries: .playwright-mcp/console-2026-09-07T15-23-07-741Z.log#L3-L4
```
</details>

**`playwright/browser_console_messages`**
<details><summary>result</summary>

```
### Result
Total messages: 4 (Errors: 1, Warnings: 1)
Returning 2 messages for level "warning"

[ERROR] Failed to load resource: the server responded with a status of 503 (Service Unavailable) @ http://localhost:8099/api/story/next:0
[WARNING] [story] falling back: no Anthropic credentials - set ANTHROPIC_API_KEY or run `ant auth login` @ http://localhost:8099/assets/index-DLjZ24vC.js:3859
```
</details>

Clean boot, no warnings beyond the expected credential fallback. Now the docs for it:

**`Bash`** — Write deployment doc and ADR 0011
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
cat > docs/DEPLOYMENT.md <<'EOF'
# Deployment

The image serves the built client **and** the story endpoint. It is not a static
file server, and that is deliberate — see
[adr/0011](adr/0011-serve-the-container-with-a-node-server.md).

## Run it

``​`bash
docker compose up --build          # http://localhost:8080
``​`

or without compose:

``​`bash
docker build -t torchboy .
docker run -p 8080:8080 --env-file .env torchboy
``​`

`--env-file` is optional. Without credentials the game runs normally and uses its
written fallback beats — narration is a flourish, never a gate.

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | port inside the container |
| `HOST` | `0.0.0.0` | bind address |
| `ANTHROPIC_API_KEY` | — | optional; enables the live story |
| `ANTHROPIC_WORKSPACE_ID` | — | only for org-level keys |
| `STORY_MODEL` / `STORY_EFFORT` | `claude-sonnet-5` / `low` | optional |

Change the published port with `PORT=9000 docker compose up` — compose maps
`${PORT:-8080}` on the host to 8080 in the container.

## What the image contains

Two stages. The build stage installs everything, builds the client, and **runs
the cave-generator validation** — a container that cannot produce a completable
cave fails the build rather than failing in front of a player. The runtime stage
copies only `dist/`, `server.mjs`, `tools/story-plugin.mjs`, and the production
dependency tree.

- **261MB**, on `node:22-alpine`
- runs as the unprivileged `node` user (uid 1000)
- no Vite, no `three`, no Blender sources, no docs — none of it is needed to serve
- `.env` is in `.dockerignore` and is never in a layer; credentials arrive
  through the environment at runtime

`compose.yaml` additionally runs the container `read_only`, with `cap_drop: ALL`
and `no-new-privileges`. Nothing in the server writes to disk.

## Endpoints

| Path | |
|---|---|
| `/` | the game |
| `/healthz` | `200 ok` — used by the image's `HEALTHCHECK` |
| `POST /api/story/next` | the story endpoint; `503` when no credentials are configured |

… [truncated]
```
<details><summary>result</summary>

```
adr index updated
      87 docs/DEPLOYMENT.md
      48 docs/adr/0011-serve-the-container-with-a-node-server.md
     135 total
```
</details>

**`Bash`** — Wire deployment into the doc graph
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
def sub(p, old, new, label):
    s = open(p).read()
    if old not in s: sys.exit(f'MISS {label}')
    open(p,'w').write(s.replace(old, new, 1)); print('ok:', label)

# --- AGENTS.md: bootstrap, entrypoints, repo map, docs list
sub('AGENTS.md',
"""npm install          # Node ^20.19 || >=22.12 (Vite 7's requirement); see .nvmrc
npm run dev          # http://localhost:5173
``​`""",
"""npm install          # Node ^20.19 || >=22.12 (Vite 7's requirement); see .nvmrc
npm run dev          # http://localhost:5173
``​`

Or in a container, which needs no Node on the host at all:

``​`bash
docker compose up --build      # http://localhost:8080
``​`""", 'agents bootstrap')

sub('AGENTS.md',
"""| `npm run assets` | rebuild `.glb` from Blender sources (needs Blender 5.x) |""",
"""| `npm start` | serve a built `dist/` the way the container does (:8080) |
| `docker compose up --build` | the container: client + story endpoint (:8080) |
| `npm run assets` | rebuild `.glb` from Blender sources (needs Blender 5.x) |""", 'agents entrypoints')

sub('AGENTS.md',
"""| `src/main.js` | boot, the frame loop, and all cross-system wiring |""",
"""| `server.mjs` | the production server: static `dist/` + the story endpoint |
| `src/main.js` | boot, the frame loop, and all cross-system wiring |""", 'agents repo map')

sub('AGENTS.md',
"""- **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)** — how to make and verify a change.""",
"""- **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)** — how to make and verify a change.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — the container, and the
  dependency rule that will bite you if you ignore it.""", 'agents docs list')

sub('AGENTS.md',
"""5. **The game climbs.** Level 0 is the deepest; `>` is the way *up* and is
   walkable. Anything phrased as a descent is stale.""",
"""5. **The game climbs.** Level 0 is the deepest; `>` is the way *up* and is
   walkable. Anything phrased as a descent is stale.
6. **`dependencies` is what the *server* needs at runtime.** The container
   installs `--omit=dev`, so putting a `server.mjs` import under
   `devDependencies` builds an image that crashes on boot. Bui
… [truncated]
```
<details><summary>result</summary>

```
ok: agents bootstrap
ok: agents entrypoints
ok: agents repo map
ok: agents docs list
ok: agents invariant 6
ok: docs index
ok: setup container
ok: arch server.mjs
ok: arch dep invariant
```
</details>

**`Bash`** — Update README, verify all links and anchors
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
python3 - <<'PY'
import sys
p='README.md'; s=open(p).read()
old = """``​`bash
npm install
npm run dev        # http://localhost:5173
``​`"""
new = """``​`bash
npm install && npm run dev        # http://localhost:5173
``​`

or, with nothing installed but Docker:

``​`bash
docker compose up --build         # http://localhost:8080
``​`"""
assert old in s
s = s.replace(old, new, 1)
old2 = """| [docs/SETUP.md](docs/SETUP.md) | toolchain, optional API credentials, Blender |"""
new2 = """| [docs/SETUP.md](docs/SETUP.md) | toolchain, optional API credentials, Blender |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | the container |"""
assert old2 in s
open(p,'w').write(s.replace(old2,new2,1)); print('readme updated')
PY
echo "=== all links resolve? ==="
for f in README.md AGENTS.md $(find docs -name "*.md"); do
  d=$(dirname "$f")
  grep -oE '\]\([^)#][^)]*\)' "$f" 2>/dev/null | sed 's/](//;s/)$//' | while read l; do
    case "$l" in http*|...) continue;; esac
    t="${l%%#*}"; [ -z "$t" ] && continue
    [ -e "$d/$t" ] || echo "  BROKEN $f -> $l"
  done
done
echo "  (none above = ok)"
echo "=== anchors ==="
grep -E "^#{1,6} " docs/DEPLOYMENT.md | sed 's/^#* //' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g; s/ /-/g' | grep -x "dependency-hygiene" && echo "  ok #dependency-hygiene"
```
<details><summary>result</summary>

```
readme updated
=== all links resolve? ===
  (none above = ok)
=== anchors ===
dependency-hygiene
  ok #dependency-hygiene
```
</details>

Final end-to-end verification of everything, from a clean build:

**`Bash`** — Clean rebuild and full verification
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
docker rm -f tb >/dev/null 2>&1; docker compose down >/dev/null 2>&1
echo "=== host toolchain still fine ==="
npm run check 2>&1 | grep -E "^ok|built"
echo
echo "=== clean image build (no cache) ==="
docker build --no-cache -t torchboy:latest . 2>&1 | grep -E "^#[0-9]+ (DONE|ERROR)|ok  |ERROR" | tail -4
docker images torchboy:latest --format '  size: {{.Size}}'
echo
echo "=== compose up, with credentials ==="
docker compose up -d >/dev/null 2>&1; sleep 6
docker compose ps --format '  {{.Service}}: {{.Status}}'
curl -s -o /dev/null -w "  page:    %{http_code}\n" localhost:8080/
curl -s -o /dev/null -w "  health:  %{http_code}\n" localhost:8080/healthz
curl -s -X POST localhost:8080/api/story/next -H 'Content-Type: application/json' \
  -d '{"want":"beat","told":[],"events":["he woke on cold stone"],"summary":"the deepest cavern"}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);t=d.get('text') or d.get('error');print('  story:  ', t[:80])"
echo
echo "=== security posture ==="
docker compose exec -T torchboy id | sed 's/^/  /'
docker inspect cavern-game-torchboy-1 --format '  read_only={{.HostConfig.ReadonlyRootfs}}  caps_dropped={{.HostConfig.CapDrop}}' 2>/dev/null
docker compose exec -T torchboy sh -c 'test -e /app/.env && echo "  LEAK: .env in image" || echo "  no .env in image"'
docker compose down >/dev/null 2>&1; echo "  (torn down)"
```
<details><summary>result</summary>

```
=== host toolchain still fine ===
ok  150 runs / 450 levels, all invariants hold (11.4ms per run)
✓ built in 756ms

=== clean image build (no cache) ===
#18 DONE 0.0s
#19 DONE 0.0s
#20 DONE 0.0s
#21 DONE 0.7s
size: 261MB

=== compose up, with credentials ===
torchboy: Up 6 seconds (healthy)
  page:    200
  health:  200
  story:   Cold stone met him first, then the dark, then the small flame that leaned toward

=== security posture ===
  uid=1000(node) gid=1000(node) groups=1000(node)
  read_only=true  caps_dropped=[ALL]
  no .env in image
  (torn down)
```
</details>

**`Bash`** — Final inventory
```bash
cd ~/proj/me/learn/blender-mcp/cavern-game
echo "=== new / changed files ==="
ls -la Dockerfile .dockerignore compose.yaml server.mjs | awk '{print "  "$9"  "$5"b"}'
echo "  docs/DEPLOYMENT.md"; echo "  docs/adr/0011-serve-the-container-with-a-node-server.md"
echo
echo "=== package.json ==="
python3 -c "
import json;d=json.load(open('package.json'))
print('  scripts:', ', '.join(d['scripts']))
print('  dependencies   :', json.dumps(d['dependencies']))
print('  devDependencies:', json.dumps(d['devDependencies']))
print('  engines        :', json.dumps(d['engines']))"
echo
echo "=== docs tree ==="
find docs -name "*.md" | sort | sed 's/^/  /'
```
<details><summary>result</summary>

```
=== new / changed files ===
  .dockerignore  522b
  compose.yaml  469b
  Dockerfile  1784b
  server.mjs  5064b
  docs/DEPLOYMENT.md
  docs/adr/0011-serve-the-container-with-a-node-server.md

=== package.json ===
  scripts: dev, build, start, preview, check, test, levels, assets
  dependencies   : {"@anthropic-ai/sdk": "^0.124.0", "zod": "^4.5.4"}
  devDependencies: {"three": "^0.180.0", "vite": "^7.1.0"}
  engines        : {"node": "^20.19.0 || >=22.12.0"}

=== docs tree ===
  docs/adr/0001-generate-caves-in-the-browser.md
  docs/adr/0002-climb-instead-of-descend.md
  docs/adr/0003-gate-the-way-up-on-full-discovery.md
  docs/adr/0004-authored-premise-not-invented-backstory.md
  docs/adr/0005-randomised-candidate-selection-for-variety.md
  docs/adr/0006-keep-the-api-key-server-side.md
  docs/adr/0007-bake-skin-weights-onto-bmesh-elements.md
  docs/adr/0008-linear-fog-with-an-orthographic-camera.md
  docs/adr/0009-articulatory-synthesis-for-the-choir.md
  docs/adr/0010-validate-the-generator-independently.md
  docs/adr/0011-serve-the-container-with-a-node-server.md
  docs/adr/README.md
  docs/ARCHITECTURE.md
  docs/DEPLOYMENT.md
  docs/README.md
  docs/SETUP.md
  docs/systems/ASSETS.md
  docs/systems/AUDIO.md
  docs/systems/RENDERING.md
  docs/systems/STORY.md
  docs/WORKFLOWS.md
```
</details>

Containerized and verified running.

```bash
docker compose up --build     # http://localhost:8080
```

**The design question worth knowing about.** The obvious container is nginx serving `dist/` — smaller, simpler, and *wrong here*. The story endpoint is server-side by construction, because the API key must never reach the browser. A static image would boot, serve the game, and play perfectly with narration silently absent — a failure indistinguishable from a missing key. So the image runs `server.mjs`: ~120 lines of `node:http` serving `dist/` and mounting the **same** story handler the dev server uses. To do that without a second copy of the request logic, `story-plugin.mjs` now exports `createStoryHandler()` and the Vite plugin is a thin wrapper over it. One implementation, two mount points. ([adr/0011](docs/adr/0011-serve-the-container-with-a-node-server.md))

**Two real bugs the container exposed**, both pre-existing and both invisible under Vite:

- `@anthropic-ai/sdk` and `zod` were **devDependencies** despite being imported by the running server. The runtime stage installs `--omit=dev`, so the first image built cleanly and crashed on boot with `ERR_MODULE_NOT_FOUND`. Vite hid this for months because dev deps are always installed in development.
- `three` was a **runtime** dependency but is bundled into `dist/` at build time — 32MB of it in the image for nothing. Moving it cut 303MB → **261MB**.

That distinction is now an architecture invariant, since `--omit=dev` makes it load-bearing rather than cosmetic.

**What's in the image:** `node:22-alpine`, 261MB, unprivileged `node` user, no Vite, no three, no Blender sources, no docs. `.env` is in `.dockerignore` and never enters a layer — credentials arrive through the environment, and real env always beats a stray file. Compose adds `read_only`, `cap_drop: ALL`, `no-new-privileges`. The build stage runs the cave-generator validation, so an image can't be produced from a tree that generates uncompletable caves.

**Verified**, not assumed: clean `--no-cache` build; healthcheck reports `healthy`; game boots in a browser from the container (level 0, 3 secrets, stairs sealed, no console warnings); story returns real prose through the container with credentials and a graceful `503` + fallback beats without; path traversal returns 403, missing assets 404 rather than SPA-falling-back, hashed assets `immutable` and `index.html` `no-cache`; no key material in any layer. `npm start` runs the same server on the host.

Docs: new [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and ADR 0011, wired into AGENTS.md (bootstrap, entrypoints, repo map, a sixth invariant), the docs index, SETUP, ARCHITECTURE and the README. All links and anchors resolve.

One thing I did on your machine: **Docker Desktop wasn't running, so I started it** — I'd rather verify the image than hand you an unbuilt Dockerfile. Containers are torn down; the `torchboy:latest` image remains.


---
[← 24-can-you-please-reconfigure-the-documentation.md](24-can-you-please-reconfigure-the-documentation.md)  ·  [index](README.md)