CREATE TYPE "TrainerRating" AS ENUM ('BAD', 'GOOD', 'VERY_GOOD', 'EXCELLENT');

ALTER TABLE "users"
  ADD COLUMN "trainerRating" "TrainerRating",
  ADD COLUMN "trainerRatingUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "trainerRatingUpdatedById" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_trainerRatingUpdatedById_fkey"
  FOREIGN KEY ("trainerRatingUpdatedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_trainerRating_idx" ON "users"("trainerRating");
