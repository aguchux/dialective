-- CreateEnum
CREATE TYPE "KycRecheckRunTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateTable
CREATE TABLE "kyc_recheck_runs" (
    "id" TEXT NOT NULL,
    "trigger" "KycRecheckRunTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "eligible" INTEGER NOT NULL DEFAULT 0,
    "approved" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "nextCursor" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "kyc_recheck_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_recheck_runs_trigger_startedAt_idx" ON "kyc_recheck_runs"("trigger", "startedAt");
