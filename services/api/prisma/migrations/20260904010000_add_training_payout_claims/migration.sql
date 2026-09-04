-- One reward per trainer and source item. A source key is used because a
-- WordRecording belongs to either a Word or a Sentence, never both.
CREATE TABLE "training_payout_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_payout_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_payout_claims_recordingId_key"
    ON "training_payout_claims"("recordingId");
CREATE UNIQUE INDEX "training_payout_claims_userId_sourceKey_key"
    ON "training_payout_claims"("userId", "sourceKey");
CREATE INDEX "training_payout_claims_userId_idx"
    ON "training_payout_claims"("userId");

ALTER TABLE "training_payout_claims"
    ADD CONSTRAINT "training_payout_claims_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the earliest historical paid recording for each trainer/source.
-- This makes the new gate effective for old accounts immediately without
-- changing their existing ledger history.
INSERT INTO "training_payout_claims" ("id", "userId", "sourceKey", "recordingId", "createdAt")
SELECT gen_random_uuid()::text, ranked."userId", ranked."sourceKey", ranked."id", ranked."settledAt"
FROM (
    SELECT DISTINCT ON (wr."userId", CASE
        WHEN wr."wordId" IS NOT NULL THEN 'word:' || wr."wordId"
        ELSE 'sentence:' || wr."sentenceId"
      END)
      wr."id",
      wr."userId",
      CASE
        WHEN wr."wordId" IS NOT NULL THEN 'word:' || wr."wordId"
        ELSE 'sentence:' || wr."sentenceId"
      END AS "sourceKey",
      COALESCE(wr."settledAt", wr."createdAt") AS "settledAt"
    FROM "word_recordings" wr
    WHERE wr."userId" IS NOT NULL
      AND (wr."wordId" IS NOT NULL OR wr."sentenceId" IS NOT NULL)
      AND EXISTS (
        SELECT 1
        FROM "ledger_entries" le
        JOIN "wallets" w ON w."id" = le."walletId"
        WHERE le."type" = 'TRAINING_PAYOUT'
          AND le."reference" = wr."id"
          AND w."userId" = wr."userId"
      )
    ORDER BY
      wr."userId",
      CASE WHEN wr."wordId" IS NOT NULL THEN 'word:' || wr."wordId" ELSE 'sentence:' || wr."sentenceId" END,
      COALESCE(wr."settledAt", wr."createdAt") ASC,
      wr."id" ASC
) ranked;
