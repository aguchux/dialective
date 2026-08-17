ALTER TABLE "users" ADD COLUMN "courseNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "SystemUpdateKind" AS ENUM ('MAINTENANCE', 'COURSE', 'BLOG', 'MESSAGE');
CREATE TYPE "SystemUpdateSourceType" AS ENUM ('MANUAL', 'BLOG_POST', 'COURSE');

CREATE TABLE "system_updates" (
  "id" TEXT NOT NULL,
  "kind" "SystemUpdateKind" NOT NULL,
  "sourceType" "SystemUpdateSourceType" NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "href" TEXT,
  "authorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "updateId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_updates_sourceType_sourceId_key" ON "system_updates"("sourceType", "sourceId");
CREATE INDEX "system_updates_kind_createdAt_idx" ON "system_updates"("kind", "createdAt");
CREATE UNIQUE INDEX "user_notifications_userId_updateId_key" ON "user_notifications"("userId", "updateId");
CREATE INDEX "user_notifications_userId_readAt_createdAt_idx" ON "user_notifications"("userId", "readAt", "createdAt");

ALTER TABLE "system_updates"
  ADD CONSTRAINT "system_updates_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_notifications"
  ADD CONSTRAINT "user_notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notifications"
  ADD CONSTRAINT "user_notifications_updateId_fkey"
  FOREIGN KEY ("updateId") REFERENCES "system_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
