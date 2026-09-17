-- Corrects 20260917150000_repair_negative_locked_balances, which rebuilt
-- lockedBalance from task stakes ONLY and ignored P2P escrow.
--
-- Wallet.lockedBalance holds two unrelated kinds of hold: training task
-- stakes (TASK_LOCK) and P2P sell escrow (P2P_ESCROW_LOCK). The earlier
-- migration counted only the first, so any wallet with live escrow at the
-- moment it ran had that escrow erased from the balance. When the trade then
-- resolved normally, the refund decremented an amount that was no longer
-- there and drove the wallet negative -- two wallets by 37 and 20 DL.
--
-- Rebuilt here from both sources:
--   task escrow = stakes with a TASK_LOCK, no TASK_REFUND, not yet resolved
--   p2p escrow  = P2P_ESCROW_LOCK - P2P_ESCROW_REFUND - released trades
--
-- The released-trades term matters: releasing to a buyer consumes the
-- seller's escrow rather than returning it, and its P2P_ESCROW_RELEASE
-- ledger row is deliberately written with amount 0 (the seller's spendable
-- total doesn't change), so the ledger alone cannot tell that the hold ended.
--
-- Floored at 0. This is a rebuild rather than a ledger replay because the
-- lock-release writes carry no ledger row of their own -- the same property
-- that let this drift go unnoticed. Wallet.balance is untouched and
-- continues to reconcile exactly against the ledger.

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
) calc
WHERE w.id = calc.wallet_id
  AND w."lockedBalance" <> GREATEST(0, calc.task_out + calc.p2p_out);
