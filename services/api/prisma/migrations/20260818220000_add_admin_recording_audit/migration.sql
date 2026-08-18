-- CreateEnum
CREATE TYPE "AdminAuditStatus" AS ENUM ('VALID', 'INVALID');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "adminAuditStatus" "AdminAuditStatus";
ALTER TABLE "submissions" ADD COLUMN "adminAuditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "word_recordings" ADD COLUMN "adminAuditStatus" "AdminAuditStatus";
ALTER TABLE "word_recordings" ADD COLUMN "adminAuditedAt" TIMESTAMP(3);
