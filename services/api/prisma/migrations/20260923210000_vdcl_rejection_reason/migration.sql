-- Why Dialect Library refused or revoked its countersignature, in words the
-- contributor reads.
--
-- A suspension is an internal compliance action; a revoked countersignature
-- is an instruction to the contributor to fix something and sign a new
-- version. That only works if the reason reaches them, so it lives on the
-- version rather than only in the audit log.
ALTER TABLE "vdcl_versions"
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3);

-- The countersignature step-up previously borrowed ADMIN_PAYOUT, so the
-- email an admin received said nothing about what was being authorised in
-- their name. Countersigning grants commercial rights over a real person's
-- voice; it deserves its own wording.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'VDCL_COUNTERSIGN';
