ALTER TABLE "manual_phone_verification_requests"
  ADD COLUMN "verifiedWithoutCode" BOOLEAN NOT NULL DEFAULT false;
