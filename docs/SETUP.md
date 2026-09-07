# Setup

## Requirements

| | |
|---|---|
| **Node** | `^20.19.0 \|\| >=22.12.0` — Vite 7's requirement, pinned in `package.json` engines. `.nvmrc` holds the version this was built on (23). Nothing else is needed to run the game. |
| **Blender** | 5.x, only if you want to rebuild `public/models/*.glb`. |
| **Anthropic credentials** | optional; without them the story falls back to written beats. |

```bash
npm install
npm run dev          # http://localhost:5173
```

The `.glb` assets are committed, so this works on a clean checkout with no
Blender and no API key.

## Credentials (optional)

The story is written by Claude at play time. Start from the example, which
documents every variable the project reads:

```bash
cp .env.example .env
```

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
`"8080 # the port"`. Put comments on their own line.

`.env` and `.env.*` are gitignored. **The key must never reach the browser** —
see [ARCHITECTURE.md](ARCHITECTURE.md#architecture-invariants).

Two things that are easy to get wrong:

- **Vite does not put `.env` into `process.env` for plugins.** It only exposes
  `VITE_`-prefixed variables, and only to client code. `vite.config.mjs`
  therefore loads the file explicitly for the server side.
- **An org-level key is rejected without a workspace.** If you see a 400 saying
  the key is "not scoped to a workspace", set `ANTHROPIC_WORKSPACE_ID` (Console
  → Settings → Workspaces) or use a workspace-scoped key.

Cost is roughly **$0.03–0.05 per playthrough** on the default model.

### Checking it works

```bash
curl -s -X POST localhost:5173/api/story/next \
  -H 'Content-Type: application/json' \
  -d '{"want":"beat","told":[],"events":[],"summary":"the deepest cavern"}'
```

A `200` with a `text` field means it is wired up. A `503` means no credentials
were found — the game will still run.

## Running it as a container

```bash
docker compose up --build      # http://localhost:8080
```

Needs no Node on the host. Credentials are passed at runtime and never baked into
the image. Full detail in [DEPLOYMENT.md](DEPLOYMENT.md).

## Rebuilding assets (optional)

```bash
npm run assets       # headless Blender -> public/models/*.glb
```

Set `BLENDER` if it is not at the macOS default path:

```bash
BLENDER=/path/to/blender npm run assets
```

This builds the character and the props. It does **not** build a cavern mesh —
caves are generated in the browser. See
[adr/0001](adr/0001-generate-caves-in-the-browser.md) and
[systems/ASSETS.md](systems/ASSETS.md).

## Troubleshooting

| Symptom | Cause |
|---|---|
| Story never appears, console says "falling back" | no credentials, or the model call failed — check the dev server log |
| `400 ... not scoped to a workspace` | org-level key; set `ANTHROPIC_WORKSPACE_ID` |
| No sound | browsers require a gesture before audio starts; click once. `M` toggles mute and the setting persists |
| `npm run assets` says Blender not found | set `BLENDER` to the binary path |
| Everything renders as flat fog | a fog regression — fog must be linear, not exponential ([systems/RENDERING.md](systems/RENDERING.md)) |
