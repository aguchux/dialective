
# node:20-alpine (musl libc) was dropped for the dependencies/build stages
# when DLKYC's face-match/liveness feature added canvas and
# @tensorflow/tfjs-node to services/api -- this service's `npm ci` at repo
# root still installs @dialectiva/api's full dependency tree (its
# prisma:generate script, invoked below, genuinely needs @dialectiva/api's
# deps present), and neither canvas nor tfjs-node publish musl/Alpine
# prebuilds. The final runtime stage below stays on node:20-alpine as
# before -- npm prune (production-dependencies stage) strips
# @dialectiva/api's deps back out before that image is assembled, so
# canvas/tfjs-node never actually need to run there.
FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 pkg-config \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*
# Build context must be repo root: word-generator-job depends on the
# @dialectiva/db workspace package (packages/db), whose generated Prisma
# client is produced from services/api's schema during the build below.
#   docker build -f services/word-generator-job/Dockerfile -t word-generator-job .
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY services/api/package.json ./services/api/
COPY services/settlement-job/package.json ./services/settlement-job/
COPY services/word-generator-job/package.json ./services/word-generator-job/
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
COPY services/word-generator-job/tsconfig.json ./services/word-generator-job/
COPY services/word-generator-job/src ./services/word-generator-job/src
RUN npm run build --workspace=@dialectiva/word-generator-job

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --workspace=@dialectiva/db --workspace=@dialectiva/word-generator-job && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/services/word-generator-job/node_modules ./services/word-generator-job/node_modules
COPY --from=build /app/services/word-generator-job/dist ./services/word-generator-job/dist
WORKDIR /app/services/word-generator-job
RUN node -e "require('reflect-metadata'); require('@dialectiva/db')"
CMD ["node", "dist/main.js"]
