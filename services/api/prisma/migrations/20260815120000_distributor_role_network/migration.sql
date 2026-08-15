ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR';

ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR_BULK_ALLOCATION';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR_FUNDING_BONUS';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR_PAYOUT_BONUS';

CREATE TABLE "distributor_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "bulkAllocationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "defaultBulkDiscountRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
  "multiLevelReferralEnabled" BOOLEAN NOT NULL DEFAULT false,
  "maxReferralDepth" INTEGER NOT NULL DEFAULT 1,
  "level1Rate" DECIMAL(8,6) NOT NULL DEFAULT 0.05,
  "level2Rate" DECIMAL(8,6) NOT NULL DEFAULT 0.02,
  "level3Rate" DECIMAL(8,6) NOT NULL DEFAULT 0.01,
  "level4Rate" DECIMAL(8,6) NOT NULL DEFAULT 0.002,
  "level5Rate" DECIMAL(8,6) NOT NULL DEFAULT 0.0003,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "distributor_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_allocations" (
  "id" TEXT NOT NULL,
  "distributorId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "tokenAmount" DECIMAL(20,8) NOT NULL,
  "discountRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "distributor_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "distributor_allocations_distributorId_createdAt_idx" ON "distributor_allocations"("distributorId", "createdAt");
CREATE INDEX "distributor_allocations_grantedById_createdAt_idx" ON "distributor_allocations"("grantedById", "createdAt");

ALTER TABLE "distributor_allocations"
ADD CONSTRAINT "distributor_allocations_distributorId_fkey"
FOREIGN KEY ("distributorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "distributor_allocations"
ADD CONSTRAINT "distributor_allocations_grantedById_fkey"
FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
