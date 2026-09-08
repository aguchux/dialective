-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'VALIDATOR';

-- CreateEnum
CREATE TYPE "ValidatorLevel" AS ENUM ('L1', 'L2', 'L3');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "validatorLevel" "ValidatorLevel",
  ADD COLUMN "validatorLevelUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "validatorLevelUpdatedById" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_validatorLevelUpdatedById_fkey"
  FOREIGN KEY ("validatorLevelUpdatedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
