-- One VDCL per contributor, covering every dialect they record in.
--
-- The agreement was scoped per dialect, which produced a licence key
-- (VDCL-NG-IG-...) that branded the whole licence as Igbo-only, and left a
-- contributor who later recorded Pidgin with unlicensed work and nothing
-- prompting them. 160 contributors already record in more than one dialect,
-- so the per-dialect model described the exception rather than the rule.
--
-- The dialects covered move to the MANIFEST, derived per version from the
-- recordings it actually covers. That keeps the licence key stable for life
-- while each signed document still states exactly what was licensed.

-- Existing agreements cannot survive this change: their licenceKey carries a
-- dialect segment that is now wrong, and their signed manifests describe a
-- single dialect under a licence that now claims to be holistic. Both rows
-- are PENDING_COUNTERSIGNATURE -- signed by the contributor but never
-- countersigned -- so no rights were granted and no documents were issued.
-- Deleting them lets those contributors re-sign against the new wording,
-- which is the honest outcome: what they signed described one dialect, and
-- the new licence does not.
--
-- Scoped to agreements only. Recordings, accounts, KYC and wallets are
-- untouched; the cascade reaches only vdcl_* rows.
DELETE FROM "vdcl_agreements";

-- Dialects this VERSION covers, derived from its items at compile time.
-- The DEFAULT only exists to make the ADD COLUMN valid against any rows that
-- survive; it is dropped immediately so the column matches the Prisma schema
-- (which declares no default) and a future insert that forgets to supply it
-- fails loudly rather than silently recording a licence covering nothing.
ALTER TABLE "vdcl_manifests" ADD COLUMN "dialectTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "vdcl_manifests" ALTER COLUMN "dialectTags" DROP DEFAULT;

DROP INDEX IF EXISTS "vdcl_agreements_contributorId_dialectTag_key";
DROP INDEX IF EXISTS "vdcl_agreements_dialectTag_idx";
DROP INDEX IF EXISTS "vdcl_agreements_contributorId_idx";

ALTER TABLE "vdcl_agreements" DROP COLUMN "dialectTag";

-- One licence per contributor. This is the whole point of the change, and it
-- is enforced by the database rather than by every call site remembering to
-- look for an existing agreement first.
CREATE UNIQUE INDEX "vdcl_agreements_contributorId_key"
  ON "vdcl_agreements" ("contributorId");
