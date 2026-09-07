# Deployment

The image serves the built client **and** the story endpoint. It is not a static
file server, and that is deliberate — see
[adr/0011](adr/0011-serve-the-container-with-a-node-server.md).

## Run it

```bash
docker compose up --build          # http://localhost:8080
```

or without compose:

```bash
docker build -t torchboy .
docker run -p 8080:8080 --env-file .env torchboy
```

`--env-file` is optional. Without credentials the game runs normally and uses its
written fallback beats — narration is a flourish, never a gate. `cp .env.example
.env` gives you a documented starting point; copied unfilled it is a valid,
playable configuration.

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

## Caching

`index.html` is served `no-cache` so a redeploy takes effect immediately.
Fingerprinted files under `/assets/` are served `immutable` for a year, which is
safe because Vite renames them on every build. If you change the build output
layout, revisit that rule in `server.mjs`.

## Dependency hygiene

**`dependencies` must contain exactly what the server needs at runtime.** The
runtime stage installs with `--omit=dev`, so a package needed by `server.mjs` or
`tools/story-plugin.mjs` and listed under `devDependencies` produces an image
that builds fine and then crashes on boot with `ERR_MODULE_NOT_FOUND`. This has
happened once already: `@anthropic-ai/sdk` and `zod` were dev dependencies
because Vite always installs those in development, which hid the mistake.

The converse is also enforced: `three` is a **build** dependency. It is bundled
into `dist/` by Vite and never imported at runtime, and leaving it in
`dependencies` put 32MB of it into the runtime image for nothing.

## Local run without Docker

```bash
npm run build && npm start        # http://localhost:8080
```

Same server, same behaviour. It also reads `.env` for convenience, but a real
environment variable always wins over the file — so a container's environment
cannot be overridden by a stray file.
