-- CreateTable: gates a trainer's own access to their "Proof Account"
-- report -- existence of a row is what an admin creates by sending the
-- report, not a signed token in a URL.
CREATE TABLE "proof_report_shares" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_report_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proof_report_shares_userId_key" ON "proof_report_shares"("userId");

-- AddForeignKey
ALTER TABLE "proof_report_shares" ADD CONSTRAINT "proof_report_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
