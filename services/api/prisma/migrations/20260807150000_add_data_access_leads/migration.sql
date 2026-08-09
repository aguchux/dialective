-- CreateTable
CREATE TABLE "data_access_leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT,
    "useCase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_access_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_access_leads_createdAt_idx" ON "data_access_leads"("createdAt");
