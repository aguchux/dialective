-- Backfill fix for a settlement-job bug: refundStuckWordRecordings set
-- refundedAt but never advanced status away from PENDING, and because both
-- that sweep and resolveTimedOutScoring filter on refundedAt IS NULL, once
-- claimed a row became permanently invisible to every future settlement-job
-- run -- stuck at status='PENDING' forever even though its trainer had
-- already been refunded. Fixed in code (settlement-job now also sets
-- status='EXPIRED' in the same claim); this migration corrects every row
-- the bug already left stranded.
--
-- Scope is deliberately narrow: only rows already refunded (refundedAt IS
-- NOT NULL) while still reading PENDING -- a row with refundedAt IS NULL is
-- genuinely still awaiting reverse-validation within its SLA window and
-- must not be touched.
UPDATE "word_recordings"
SET "status" = 'EXPIRED'
WHERE "status" = 'PENDING'
  AND "direction" = 'ENGLISH_TO_DIALECT'
  AND "refundedAt" IS NOT NULL;
