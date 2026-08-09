FROM node:20-alpine AS dependencies
WORKDIR /app
COPY services/api/package.json services/api/package-lock.json ./
RUN npm ci

FROM dependencies AS build
# Prisma generation does not connect to Postgres, but prisma.config.ts
# requires a syntactically valid URL while loading.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
# Build context must be repo root so models/asr-registry.yaml resolves, e.g.:
#   docker build -f services/api/Dockerfile -t api .
COPY services/api/prisma.config.ts ./
COPY services/api/prisma ./prisma
COPY services/api/tsconfig.json ./
COPY services/api/src ./src
COPY models/asr-registry.yaml ./models/asr-registry.yaml
RUN npm run build

# Release-only image. It contains Prisma CLI and ts-node so the Kubernetes
# Job can migrate and seed immediately without downloading packages at boot.
FROM build AS prisma-release
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "prisma:release"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY services/api/package.json services/api/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY models/asr-registry.yaml ./dist/models/asr-registry.yaml
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
