-- Collects trainer gender (Male/Female): required going forward as part of
-- /onboarding, and backfilled via a blocking dashboard dialog for trainers
-- who already completed onboarding before this shipped.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "users" ADD COLUMN "gender" "Gender";
