-- AlterTable
ALTER TABLE "course_progress" ADD COLUMN     "maxSlideIndexReached" INTEGER NOT NULL DEFAULT 0;

-- Backfill: seed the high-water mark from each trainer's existing resume
-- point so nobody who was already mid-course (or already completed) gets
-- pushed backward by the new strict, sequential-advancement enforcement.
UPDATE "course_progress" SET "maxSlideIndexReached" = "lastSlideIndex";
