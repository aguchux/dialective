-- CreateEnum
CREATE TYPE "CourseVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "visibility" "CourseVisibility" NOT NULL DEFAULT 'PRIVATE';
