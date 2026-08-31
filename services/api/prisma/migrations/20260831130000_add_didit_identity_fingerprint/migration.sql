-- A non-reversible HMAC digest of the DIDIT-approved document number. The
-- source document remains only inside the encrypted provider decision payload.
ALTER TABLE "users" ADD COLUMN "diditIdentityFingerprint" TEXT;

-- Null values are allowed for users who have not completed DIDIT. Once an
-- approved identity fingerprint is stored, it can belong to one account only.
CREATE UNIQUE INDEX "users_diditIdentityFingerprint_key"
  ON "users"("diditIdentityFingerprint");
