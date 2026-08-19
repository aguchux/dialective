FROM node:20-alpine AS dependencies
WORKDIR /app
# Build context must be repo root: audio-retention-job depends on the
# @dialectiva/db workspace package (packages/db), whose generated Prisma
# client is produced from services/api's schema during the build below.
#   docker build -f services/audio-retention-job/Dockerfile -t audio-retention-job .
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY services/api/package.json ./services/api/
COPY services/audio-retention-job/package.json ./services/audio-retention-job/
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
COPY services/audio-retention-job/tsconfig.json ./services/audio-retention-job/
COPY services/audio-retention-job/src ./services/audio-retention-job/src
RUN npm run build --workspace=@dialectiva/audio-retention-job

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --workspace=@dialectiva/db --workspace=@dialectiva/audio-retention-job && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/services/audio-retention-job/node_modules ./services/audio-retention-job/node_modules
COPY --from=build /app/services/audio-retention-job/dist ./services/audio-retention-job/dist
WORKDIR /app/services/audio-retention-job
RUN node -e "require('reflect-metadata'); require('@dialectiva/db')"
CMD ["node", "dist/main.js"]
