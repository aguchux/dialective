FROM node:20-alpine AS build
WORKDIR /app
# `npm run build` runs "prisma generate && nest build" -- prisma generate
# only needs DATABASE_URL to resolve to a non-empty string, it doesn't
# connect to a database, but prisma.config.ts's env() throws if the var is
# unset at all.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
# Build context must be repo root so models/asr-registry.yaml resolves, e.g.:
#   docker build -f services/api/Dockerfile -t api .
COPY services/api/package.json ./
RUN npm install
COPY services/api/prisma.config.ts ./
COPY services/api/prisma ./prisma
COPY services/api/tsconfig.json ./
COPY services/api/src ./src
COPY models/asr-registry.yaml ./models/asr-registry.yaml
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY services/api/package.json ./
RUN npm install --omit=dev
COPY services/api/prisma.config.ts ./
COPY services/api/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY models/asr-registry.yaml ./dist/models/asr-registry.yaml
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
