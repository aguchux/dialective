-- Corrects 20260917150000 and 20260917160000, which both rebuilt
-- lockedBalance using `refundedAt IS NULL` to decide whether a stake was
-- still held. That column is overloaded and cannot answer the question.
--
-- refundedAt means two different things. Some sweeps set it as a CLAIM
-- MARKER before deciding what to do -- refundStuckWordRecordings stamps it,
-- then under noFailOnTrainEnabled hands the row on to be scored and paid,
-- so no tokens ever moved. Other paths set it when tokens genuinely were
-- returned. Both look identical in that column.
--
-- Treating every refundedAt row as "no longer held" dropped 2,352 rows
-- (~104 DL) of genuinely-held stake out of the rebuild, leaving those
-- wallets' lockedBalance too low. When settlement later released those
-- stakes correctly, the balance had nothing to give and went negative --
-- which is what kept producing new negative wallets after each earlier
-- repair, at roughly one per settlement cycle.
--
-- The ledger is the only honest record: a stake is held if and only if it
-- has a TASK_LOCK and no TASK_REFUND. That is the same question
-- isStakeStillLocked asks in code, and this migration now asks it the same
-- way. It deliberately does NOT consult refundedAt at all.
--
-- Unsettled rows are counted whatever their refundedAt, since the ledger
-- decides. P2P escrow is included (see 20260917160000 for why the
-- released-trades term is required: releasing to a buyer consumes the
-- seller's escrow and its ledger row is written with amount 0). Floored at 0.

CREATE TEMP TABLE _held_stakes AS
SELECT s."userId", SUM(s."tokensSpent") AS amount
FROM (
  SELECT r."tokensSpent", r.id, r."userId" FROM "word_recordings" r
    WHERE r."settledAt" IS NULL AND r."userId" IS NOT NULL
  UNION ALL
  SELECT d."tokensSpent", d.id, d."userId" FROM "domain_conversation_recordings" d
    WHERE d."settledAt" IS NULL AND d."userId" IS NOT NULL
) s
WHERE EXISTS (SELECT 1 FROM "ledger_entries" l
              WHERE l.reference = s.id AND l.type = 'TASK_LOCK')
  AND NOT EXISTS (SELECT 1 FROM "ledger_entries" l
                  WHERE l.reference = s.id AND l.type = 'TASK_REFUND')
GROUP BY s."userId";

CREATE TEMP TABLE _p2p_escrow AS
SELECT w.id AS wallet_id,
     COALESCE(SUM(CASE WHEN l.type = 'P2P_ESCROW_LOCK' THEN -l.amount ELSE 0 END), 0)
   - COALESCE(SUM(CASE WHEN l.type = 'P2P_ESCROW_REFUND' THEN l.amount ELSE 0 END), 0) AS amount
FROM "wallets" w
LEFT JOIN "ledger_entries" l
  ON l."walletId" = w.id AND l.type IN ('P2P_ESCROW_LOCK', 'P2P_ESCROW_REFUND')
GROUP BY w.id;

UPDATE "wallets" w
SET "lockedBalance" = GREATEST(0,
      COALESCE(h.amount, 0)
    + COALESCE(p.amount, 0)
    - COALESCE((SELECT SUM(t."tokenAmount") FROM "p2p_token_trades" t
                WHERE t."sellerId" = w."userId" AND t.status = 'RELEASED'), 0))
FROM "_p2p_escrow" p
LEFT JOIN "wallets" w2 ON w2.id = p.wallet_id
LEFT JOIN "_held_stakes" h ON h."userId" = w2."userId"
WHERE w.id = p.wallet_id
  AND w."lockedBalance" <> GREATEST(0,
      COALESCE(h.amount, 0)
    + COALESCE(p.amount, 0)
    - COALESCE((SELECT SUM(t."tokenAmount") FROM "p2p_token_trades" t
                WHERE t."sellerId" = w."userId" AND t.status = 'RELEASED'), 0));

DROP TABLE _held_stakes;
DROP TABLE _p2p_escrow;
