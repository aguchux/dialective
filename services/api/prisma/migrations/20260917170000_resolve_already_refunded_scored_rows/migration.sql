-- Closes out rows that were already refunded but left at status SCORED, and
-- repairs the wallets the resulting double-refund damaged.
--
-- settleDuplicateSourceWithoutReward returns a repeat submission's stake
-- rather than paying a reward, but only checked that a TASK_LOCK existed --
-- not whether that stake had already been returned. A row refunded by an
-- earlier sweep and settled later therefore got a SECOND TASK_REFUND: the
-- trainer was credited twice and lockedBalance was decremented for tokens
-- that were no longer there, driving wallets negative ~0.1 DL at a time.
--
-- The code fix is committed but cannot ship: GitHub Actions is failing every
-- job in seconds with no steps executed (an account-level block, not a build
-- error), so the settlement-job image is stuck on the previous commit. This
-- migration removes the remaining fuel at the data layer instead, which is
-- reachable and sufficient: with no already-refunded row left in SCORED, the
-- duplicate-source path has nothing left to double-refund.
--
-- Safe because these rows are genuinely finished: each has exactly one
-- TASK_REFUND, no TRAINING_PAYOUT, and refundedAt set weeks ago. The trainer
-- already has their stake back, so settling at zero payout records what
-- actually happened rather than changing any balance.

UPDATE "word_recordings" r
SET status = 'SETTLED',
    "payoutTokenAmount" = 0,
    "settledAt" = now()
WHERE r."settledAt" IS NULL
  AND r.status = 'SCORED'
  AND EXISTS (SELECT 1 FROM "ledger_entries" l
              WHERE l.reference = r.id AND l.type = 'TASK_REFUND')
  AND NOT EXISTS (SELECT 1 FROM "ledger_entries" l
                  WHERE l.reference = r.id AND l.type = 'TRAINING_PAYOUT');

-- Same for the domain-conversation twin, which shares the code path.
UPDATE "domain_conversation_recordings" d
SET status = 'SETTLED',
    "payoutTokenAmount" = 0,
    "settledAt" = now()
WHERE d."settledAt" IS NULL
  AND d.status = 'SCORED'
  AND EXISTS (SELECT 1 FROM "ledger_entries" l
              WHERE l.reference = d.id AND l.type = 'TASK_REFUND')
  AND NOT EXISTS (SELECT 1 FROM "ledger_entries" l
                  WHERE l.reference = d.id AND l.type = 'TRAINING_PAYOUT');

-- Repair the wallets already driven negative, rebuilding lockedBalance from
-- outstanding task stakes plus P2P escrow (same derivation as
-- 20260917160000 -- see that migration for why both terms are required and
-- why this is a rebuild rather than a ledger replay). Floored at 0.
UPDATE "wallets" w
SET "lockedBalance" = GREATEST(0, calc.task_out + calc.p2p_out)
FROM (
  SELECT
    w2.id AS wallet_id,
    COALESCE((
      SELECT SUM(s."tokensSpent")
      FROM (
        SELECT r."tokensSpent", r.id, r."userId" FROM "word_recordings" r
          WHERE r."settledAt" IS NULL AND r."refundedAt" IS NULL AND r."userId" IS NOT NULL
        UNION ALL
        SELECT d."tokensSpent", d.id, d."userId" FROM "domain_conversation_recordings" d
          WHERE d."settledAt" IS NULL AND d."refundedAt" IS NULL AND d."userId" IS NOT NULL
      ) s
      WHERE s."userId" = w2."userId"
        AND EXISTS (SELECT 1 FROM "ledger_entries" l
                    WHERE l.reference = s.id AND l.type = 'TASK_LOCK')
        AND NOT EXISTS (SELECT 1 FROM "ledger_entries" l
                        WHERE l.reference = s.id AND l.type = 'TASK_REFUND')
    ), 0) AS task_out,
      COALESCE((SELECT SUM(-l.amount) FROM "ledger_entries" l
                WHERE l."walletId" = w2.id AND l.type = 'P2P_ESCROW_LOCK'), 0)
    - COALESCE((SELECT SUM(l.amount) FROM "ledger_entries" l
                WHERE l."walletId" = w2.id AND l.type = 'P2P_ESCROW_REFUND'), 0)
    - COALESCE((SELECT SUM(t."tokenAmount") FROM "p2p_token_trades" t
                WHERE t."sellerId" = w2."userId" AND t.status = 'RELEASED'), 0) AS p2p_out
  FROM "wallets" w2
  WHERE w2."lockedBalance" < 0
) calc
WHERE w.id = calc.wallet_id;
