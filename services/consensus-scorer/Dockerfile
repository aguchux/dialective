FROM node:20-alpine AS dependencies
WORKDIR /app
# Build context must be repo root: consensus-scorer depends on the
# @dialectiva/db workspace package (packages/db), whose generated Prisma
# client is produced from services/api's schema during the build below.
#   docker build -f services/consensus-scorer/Dockerfile -t consensus-scorer .
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
COPY services/api/prisma.config.ts ./services/api/
COPY services/api/prisma ./services/api/prisma
# packages/db must be compiled (its package.json "main" points at dist/)
# after prisma generate populates src/generated, before this service's own
# build resolves @dialectiva/db's types.
RUN npm run prisma:generate --workspace=@dialectiva/api && npm run build --workspace=@dialectiva/db
COPY services/consensus-scorer/tsconfig.json ./services/consensus-scorer/
COPY services/consensus-scorer/src ./services/consensus-scorer/src
RUN npm run build --workspace=@dialectiva/consensus-scorer

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --workspace=@dialectiva/db --workspace=@dialectiva/consensus-scorer && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/services/consensus-scorer/node_modules ./services/consensus-scorer/node_modules
RUN node -e " \
  const fs = require('fs'), path = require('path'); \
  const src = './services/consensus-scorer/node_modules', dest = './node_modules'; \
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
COPY --from=build /app/services/consensus-scorer/dist ./services/consensus-scorer/dist
WORKDIR /app/services/consensus-scorer
RUN node -e "require('reflect-metadata'); require('@dialectiva/db')"
EXPOSE 3000
CMD ["node", "dist/main.js"]
