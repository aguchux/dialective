-- Settlement historically wrote settledAt and payoutTokenAmount but left the
-- display/workflow status as SCORED. These rows are already paid; this is a
-- state-only repair and does not touch balances or create ledger entries.
UPDATE "submissions"
SET "status" = 'SETTLED'
WHERE "status" = 'SCORED' AND "settledAt" IS NOT NULL;

UPDATE "word_recordings"
SET "status" = 'SETTLED'
WHERE "status" = 'SCORED' AND "settledAt" IS NOT NULL;
