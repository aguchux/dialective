FROM node:20-alpine AS dependencies
WORKDIR /app
# Build context must be repo root: models/asr-registry.yaml must resolve,
# and api depends on the @dialectiva/db workspace package (packages/db),
# whose generated Prisma client api itself produces during the build below.
#   docker build -f services/api/Dockerfile -t api .
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY services/api/package.json ./services/api/
COPY services/consensus-scorer/package.json ./services/consensus-scorer/
COPY services/settlement-job/package.json ./services/settlement-job/
RUN npm ci

FROM dependencies AS build
# Prisma generation does not connect to Postgres, but prisma.config.ts
# requires a syntactically valid URL while loading.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/src ./packages/db/src
COPY services/api/prisma.config.ts services/api/tsconfig.json ./services/api/
COPY services/api/prisma ./services/api/prisma
COPY services/api/src ./services/api/src
COPY models/asr-registry.yaml ./models/asr-registry.yaml
# packages/db must be compiled (its package.json "main" points at dist/,
# since Python/plain-node consumers -- and this image's own runtime stage --
# can't require() raw TypeScript) after prisma generate populates
# src/generated, and before api's own build resolves @dialectiva/db's types.
RUN npm run prisma:generate --workspace=@dialectiva/api && npm run build --workspace=@dialectiva/db
RUN npm run build:app --workspace=@dialectiva/api

# Release-only image. It contains Prisma CLI and ts-node so the Kubernetes
# Job can migrate and seed immediately without downloading packages at boot.
FROM build AS prisma-release
ENV NODE_ENV=production
USER node
WORKDIR /app/services/api
CMD ["npm", "run", "prisma:release"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --workspace=@dialectiva/db --workspace=@dialectiva/api && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/services/api/node_modules ./services/api/node_modules
# npm's workspace hoisting nests some deps (e.g. @nestjs/platform-express)
# under services/api/node_modules instead of root even though @nestjs/core
# resolves at root -- Node's require() only walks up from @nestjs/core's own
# location, never sideways into services/api/node_modules, so anything
# nested there is invisible to it. Mirror services/api's local packages into
# root so root-resolving requires can still find them. A plain `cp -rn`
# won't do this: busybox cp treats an existing destination directory (e.g.
# the @nestjs scope folder, already at root) as a full skip rather than
# merging into it, so scoped packages nested one level under an existing
# root dir never get copied. Copy each leaf package directory individually
# instead (via Node, since busybox sh lacks the string/array handling this
# needs).
RUN node -e " \
  const fs = require('fs'), path = require('path'); \
  const src = './services/api/node_modules', dest = './node_modules'; \
  function leaves(dir) { \
    return fs.readdirSync(dir).flatMap((name) => { \
      if (name.startsWith('@')) return fs.readdirSync(path.join(dir, name)).map((sub) => path.join(name, sub)); \
      return [name]; \
    }); \
  } \
  for (const rel of leaves(src)) { \
    const from = path.join(src, rel), to = path.join(dest, rel); \
    if (!fs.existsSync(to)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); } \
  } \
"
COPY --from=build /app/services/api/dist ./services/api/dist
COPY models/asr-registry.yaml ./services/api/dist/models/asr-registry.yaml
WORKDIR /app/services/api
RUN node -e "require('reflect-metadata'); require('@dialectiva/db')"
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
