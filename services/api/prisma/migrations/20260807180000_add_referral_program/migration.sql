-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'REFERRAL_COMMISSION';

-- CreateTable
CREATE TABLE "referral_programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_programs_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add as nullable first so existing rows don't violate NOT NULL,
-- backfill a unique code per row (derived from id, already unique), then
-- tighten to NOT NULL + add the unique index. referredById is nullable by
-- design (most users are never referred) so no backfill needed there.
ALTER TABLE "users" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "users" ADD COLUMN "referredById" TEXT;

UPDATE "users" SET "referralCode" = substr(md5(random()::text || id), 1, 10) WHERE "referralCode" IS NULL;

ALTER TABLE "users" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
