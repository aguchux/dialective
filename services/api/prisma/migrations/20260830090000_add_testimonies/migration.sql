ALTER TYPE "LedgerEntryType" ADD VALUE 'TESTIMONY_APPROVED_REWARD';

ALTER TABLE "platform_settings" ADD COLUMN "testimonyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "testimonyMaxTextLength" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "platform_settings" ADD COLUMN "testimonyMaxVideoSeconds" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "platform_settings" ADD COLUMN "testimonyRewardTokens" DECIMAL(20,8) NOT NULL DEFAULT 5;

CREATE TYPE "TestimonyKind" AS ENUM ('VIDEO', 'TEXT');

CREATE TYPE "TestimonyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "testimonies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TestimonyKind" NOT NULL,
    "text" TEXT,
    "videoBucket" TEXT,
    "videoKey" TEXT,
    "durationMs" INTEGER,
    "status" "TestimonyStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "rewardCredited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testimonies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "testimonies_userId_idx" ON "testimonies"("userId");

CREATE INDEX "testimonies_status_createdAt_idx" ON "testimonies"("status", "createdAt");

ALTER TABLE "testimonies" ADD CONSTRAINT "testimonies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
