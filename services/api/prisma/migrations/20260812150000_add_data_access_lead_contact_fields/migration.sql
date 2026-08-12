-- AlterTable
ALTER TABLE "data_access_leads"
ADD COLUMN "website" TEXT,
ADD COLUMN "countriesInterested" TEXT,
DROP COLUMN "useCase";

-- CreateIndex
CREATE INDEX "data_access_leads_email_idx" ON "data_access_leads"("email");
