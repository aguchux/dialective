FROM node:20-alpine AS dependencies
WORKDIR /app
# Build context must be repo root: isvc-scorer depends on the
# @dialectiva/db workspace package (packages/db), whose generated Prisma
# client is produced from services/api's schema during the build below.
#   docker build -f services/isvc-scorer/Dockerfile -t isvc-scorer .
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY services/api/package.json ./services/api/
COPY services/isvc-scorer/package.json ./services/isvc-scorer/
RUN npm ci

FROM dependencies AS build
# Prisma generation does not connect to Postgres, but prisma.config.ts
# requires a syntactically valid URL while loading.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/src ./packages/db/src
COPY services/api/prisma.config.ts ./services/api/
COPY services/api/prisma ./services/api/prisma
# packages/db must be compiled (its package.json "main" points at dist/)
# after prisma generate populates src/generated, before this service's own
# build resolves @dialectiva/db's types.
RUN npm run prisma:generate --workspace=@dialectiva/api && npm run build --workspace=@dialectiva/db
COPY services/isvc-scorer/tsconfig.json ./services/isvc-scorer/
COPY services/isvc-scorer/src ./services/isvc-scorer/src
RUN npm run build --workspace=@dialectiva/isvc-scorer

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --workspace=@dialectiva/db --workspace=@dialectiva/isvc-scorer && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/services/isvc-scorer/node_modules ./services/isvc-scorer/node_modules
# Symlink, not copy: see services/api/Dockerfile's runtime stage for why a
# file copy here duplicates packages like class-transformer into a second
# module instance, silently breaking decorator-metadata-based validation.
RUN node -e " \
  const fs = require('fs'), path = require('path'); \
  const src = './services/isvc-scorer/node_modules', dest = './node_modules'; \
  function leaves(dir) { \
    return fs.readdirSync(dir).flatMap((name) => { \
      if (name.startsWith('@')) return fs.readdirSync(path.join(dir, name)).map((sub) => path.join(name, sub)); \
      return [name]; \
    }); \
  } \
  for (const rel of leaves(src)) { \
    const from = path.resolve(src, rel), to = path.join(dest, rel); \
    if (!fs.existsSync(to)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.symlinkSync(path.relative(path.dirname(to), from), to, 'dir'); } \
  } \
"
COPY --from=build /app/services/isvc-scorer/dist ./services/isvc-scorer/dist
WORKDIR /app/services/isvc-scorer
RUN node -e "require('reflect-metadata'); require('@dialectiva/db')"
EXPOSE 3000
CMD ["node", "dist/main.js"]
