-- Admin review of Connect speaker applications, plus the expiring photo
-- upload link sent on approval.
--
-- Additive and nullable throughout: existing registrations default to
-- PENDING, which is also what an attendee-only row stays at (the speaker
-- queue filters on `speaking = true`, so an attendee is never shown as an
-- undecided applicant).
CREATE TYPE "ConnectSpeakerStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

ALTER TABLE "connect_registrations"
  ADD COLUMN "speakerStatus" "ConnectSpeakerStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "speakerDecidedAt" TIMESTAMP(3),
  ADD COLUMN "speakerDecidedById" TEXT,
  ADD COLUMN "photoUrl" TEXT,
  ADD COLUMN "photoKey" TEXT,
  ADD COLUMN "photoUploadedAt" TIMESTAMP(3),
  -- Only the hash is stored; the raw token lives solely in the email, same
  -- as password-reset and magic-link tokens.
  ADD COLUMN "photoTokenHash" TEXT,
  ADD COLUMN "photoTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "connect_registrations_photoTokenHash_key" ON "connect_registrations"("photoTokenHash");
CREATE INDEX "connect_registrations_eventKey_speaking_speakerStatus_idx" ON "connect_registrations"("eventKey", "speaking", "speakerStatus");

ALTER TABLE "connect_registrations"
  ADD CONSTRAINT "connect_registrations_speakerDecidedById_fkey"
  FOREIGN KEY ("speakerDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
