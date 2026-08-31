-- CreateEnum
CREATE TYPE "ValidationReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ValidationAuditAction" AS ENUM ('SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "subscriber_validations"
  ADD COLUMN "status" "ValidationReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "subscriber_validations_organizationId_status_idx" ON "subscriber_validations"("organizationId", "status");

-- CreateTable
CREATE TABLE "validation_audit_logs" (
    "id" TEXT NOT NULL,
    "validationId" TEXT NOT NULL,
    "action" "ValidationAuditAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "validation_audit_logs_validationId_createdAt_idx" ON "validation_audit_logs"("validationId", "createdAt");

-- AddForeignKey
ALTER TABLE "validation_audit_logs" ADD CONSTRAINT "validation_audit_logs_validationId_fkey" FOREIGN KEY ("validationId") REFERENCES "subscriber_validations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing validations predate the review workflow -- treat them
-- as already APPROVED (they've been feeding ISVC all along) rather than
-- retroactively PENDING, which would silently zero out every existing
-- ISVC aggregation until someone reviews years of history.
UPDATE "subscriber_validations" SET "status" = 'APPROVED', "reviewedAt" = "createdAt" WHERE "status" = 'PENDING';
