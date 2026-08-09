-- Removes Google OAuth support. Guarded: fails loudly instead of silently
-- reassigning/deleting data if any linked_accounts row still references
-- provider = 'GOOGLE' -- those accounts would be unable to sign in once
-- GOOGLE is removed, and deciding what happens to them (delete, force a
-- password reset, merge into another provider) is a product decision, not
-- something a migration should silently make.
DO $$
DECLARE
  google_account_count integer;
BEGIN
  SELECT count(*) INTO google_account_count FROM "linked_accounts" WHERE "provider" = 'GOOGLE';
  IF google_account_count > 0 THEN
    RAISE EXCEPTION 'Cannot remove GOOGLE from AuthProvider: % linked_accounts row(s) still reference it. Resolve those accounts (delete, or migrate them to another provider) before re-running this migration.', google_account_count;
  END IF;
END $$;

-- Postgres has no ALTER TYPE ... DROP VALUE, so recreate the enum without
-- GOOGLE, following Prisma's standard pattern for enum value removal.
BEGIN;
CREATE TYPE "AuthProvider_new" AS ENUM ('CREDENTIALS', 'EMAIL');
ALTER TABLE "linked_accounts" ALTER COLUMN "provider" TYPE "AuthProvider_new" USING ("provider"::text::"AuthProvider_new");
ALTER TYPE "AuthProvider" RENAME TO "AuthProvider_old";
ALTER TYPE "AuthProvider_new" RENAME TO "AuthProvider";
DROP TYPE "AuthProvider_old";
COMMIT;
