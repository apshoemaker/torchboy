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

const HERE = path.dirname(fileURLToPath(import.meta.url));
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
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] !== undefined) continue;          // env wins
    process.env[k] = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
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
  }
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  // Resolve inside ROOT and verify it stayed there. Decoding can reintroduce
  // traversal that a raw-string check would miss, so the check comes last.
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400); return res.end('bad request');
  }
  let file = path.join(ROOT, rel);
  if (rel.endsWith('/')) file = path.join(file, 'index.html');
  if (path.relative(ROOT, file).startsWith('..')) {
    res.writeHead(403); return res.end('forbidden');
  }

  let stat = await fsp.stat(file).catch(() => null);
  if (stat?.isDirectory()) {
    file = path.join(file, 'index.html');
    stat = await fsp.stat(file).catch(() => null);
  }
  // single-page app: unknown paths fall back to index.html, but never for a
  // request that was clearly for an asset
  if (!stat) {
    if (path.extname(file)) { res.writeHead(404); return res.end('not found'); }
    file = path.join(ROOT, 'index.html');
    stat = await fsp.stat(file);
  }

  const ext = path.extname(file).toLowerCase();
  // Vite fingerprints everything under /assets/, so those are immutable.
  // index.html must never be cached or a deploy does not take effect.
  const immutable = rel.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\./.test(rel);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

server.listen(PORT, HOST, () => {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  console.log(`torchboy on http://${HOST}:${PORT}`);
  console.log(hasKey
    ? '  story: credentials present'
    : '  story: no credentials - the game will use its written fallback beats');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
