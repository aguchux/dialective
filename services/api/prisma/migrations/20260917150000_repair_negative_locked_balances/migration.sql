-- Repairs lockedBalance corruption caused by the double lock-release bug.
--
-- settleWordRecordings/settleDomainConversationRecordings gated their
-- lockedBalance decrement on "was this row ever locked" (a TASK_LOCK ledger
-- entry exists) rather than "is that lock still held". A row can legitimately
-- be refunded by one sweep and then settled by another -- refundStuckWord-
-- Recordings stamps refundedAt as its claim marker and, under
-- noFailOnTrainEnabled, hands the row on to be scored and paid -- so both
-- sweeps decremented lockedBalance for the same stake. 51,132 recordings
-- released a lock twice, driving ~4.9k DL of phantom decrements and leaving
-- 300 wallets with a NEGATIVE lockedBalance.
--
-- The application fix (isStakeStillLocked) stops new occurrences. This
-- repairs the balances already damaged.
--
-- Only lockedBalance is touched. Wallet.balance is provably correct -- it
-- reconciles exactly against the ledger for every wallet, because the phantom
-- decrements only ever hit lockedBalance and wrote no ledger row of their own
-- (which is also why this needs a backfill rather than a ledger replay).
-- No trainer was under- or over-paid by this bug; only the held-tokens figure
-- was wrong.
--
-- The correct value is derived from the ledger, the only honest record of
-- what actually moved: locked = sum(-TASK_LOCK) - sum(TASK_REFUND) for stakes
-- that have not yet been released by a settlement. Floored at 0 so a wallet
-- can never be left negative.

-- Both task types lock stake into the same lockedBalance, so both must be
-- counted -- rebuilding from word_recordings alone would zero out every
-- in-flight Domain Conversation stake (193 rows / 19.3 DL at the time of
-- writing) and silently confiscate them.
WITH outstanding AS (
  SELECT "userId", SUM("tokensSpent") AS amount
  FROM (
    SELECT r."userId", r."tokensSpent", r.id
    FROM "word_recordings" r
    WHERE r."settledAt" IS NULL AND r."refundedAt" IS NULL AND r."userId" IS NOT NULL
    UNION ALL
    SELECT d."userId", d."tokensSpent", d.id
    FROM "domain_conversation_recordings" d
    WHERE d."settledAt" IS NULL AND d."refundedAt" IS NULL AND d."userId" IS NOT NULL
  ) staked
  WHERE EXISTS (
      SELECT 1 FROM "ledger_entries" l
      WHERE l.reference = staked.id AND l.type = 'TASK_LOCK'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ledger_entries" l
      WHERE l.reference = staked.id AND l.type = 'TASK_REFUND'
    )
  GROUP BY "userId"
)
UPDATE "wallets" w
SET "lockedBalance" = GREATEST(0, COALESCE(o.amount, 0))
FROM outstanding o
WHERE w."userId" = o."userId"
  AND w."lockedBalance" <> GREATEST(0, COALESCE(o.amount, 0));

-- Wallets with no outstanding locked stake of either kind: anything non-zero
-- there is residue from the same bug (most of the negative rows land here).
UPDATE "wallets" w
SET "lockedBalance" = 0
WHERE w."lockedBalance" <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM (
      SELECT r."userId", r.id FROM "word_recordings" r
      WHERE r."settledAt" IS NULL AND r."refundedAt" IS NULL
      UNION ALL
      SELECT d."userId", d.id FROM "domain_conversation_recordings" d
      WHERE d."settledAt" IS NULL AND d."refundedAt" IS NULL
    ) staked
    WHERE staked."userId" = w."userId"
      AND EXISTS (
        SELECT 1 FROM "ledger_entries" l
        WHERE l.reference = staked.id AND l.type = 'TASK_LOCK'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "ledger_entries" l
        WHERE l.reference = staked.id AND l.type = 'TASK_REFUND'
      )
  );
