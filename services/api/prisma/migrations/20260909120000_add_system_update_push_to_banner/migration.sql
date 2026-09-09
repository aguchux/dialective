-- AlterTable
ALTER TABLE "system_updates" ADD COLUMN "pushToBanner" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "system_updates_pushToBanner_createdAt_idx" ON "system_updates"("pushToBanner", "createdAt");
