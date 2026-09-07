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
# cannot produce a completable cave should fail here, not in front of a player
RUN node tools/validate_levels.mjs 60

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# only the runtime dependency tree (@anthropic-ai/sdk + zod); no vite, no three
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY tools/story-plugin.mjs ./tools/story-plugin.mjs

# node:alpine ships an unprivileged `node` user; nothing here needs to write
USER node

ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
