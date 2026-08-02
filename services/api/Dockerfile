FROM node:20-alpine AS build
WORKDIR /app
# `npm run build` runs "prisma generate && nest build" -- prisma generate
# only needs DATABASE_URL to resolve to a non-empty string, it doesn't
# connect to a database, but prisma.config.ts's env() throws if the var is
# unset at all.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY package.json ./
RUN npm install
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
