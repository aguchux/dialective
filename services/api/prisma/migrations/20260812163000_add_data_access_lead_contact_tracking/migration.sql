-- AlterTable
ALTER TABLE "data_access_leads"
ADD COLUMN "contactedAt" TIMESTAMP(3),
ADD COLUMN "contactNote" TEXT,
ADD COLUMN "contactedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "data_access_leads_contactedAt_idx" ON "data_access_leads"("contactedAt");
CREATE INDEX "data_access_leads_contactedByUserId_idx" ON "data_access_leads"("contactedByUserId");

-- AddForeignKey
ALTER TABLE "data_access_leads"
ADD CONSTRAINT "data_access_leads_contactedByUserId_fkey"
FOREIGN KEY ("contactedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
