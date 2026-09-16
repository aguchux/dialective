-- CreateEnum
CREATE TYPE "WordValidationStatus" AS ENUM ('SETTLED');

-- AlterTable
ALTER TABLE "word_validations" ADD COLUMN     "status" "WordValidationStatus" NOT NULL DEFAULT 'SETTLED';
