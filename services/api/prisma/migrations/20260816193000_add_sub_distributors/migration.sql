-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'SUB_DISTRIBUTOR_ADJUSTMENT';

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'SUB_DISTRIBUTOR_ADJUSTMENT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "promotedById" TEXT;

-- CreateIndex
CREATE INDEX "users_promotedById_idx" ON "users"("promotedById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
