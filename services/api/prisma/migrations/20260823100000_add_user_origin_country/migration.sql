-- Country of origin is account identity data. The pre-existing countryId
-- continues to scope a trainer's chosen dialect and training content.
ALTER TABLE "users" ADD COLUMN "originCountryId" TEXT;

-- Every existing account with a dialect/training country keeps that value as
-- its origin initially. Accounts that have never completed onboarding remain
-- NULL and are required to choose their origin before accessing trainer work.
UPDATE "users"
SET "originCountryId" = "countryId"
WHERE "originCountryId" IS NULL AND "countryId" IS NOT NULL;

CREATE INDEX "users_originCountryId_idx" ON "users"("originCountryId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_originCountryId_fkey"
  FOREIGN KEY ("originCountryId") REFERENCES "countries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
