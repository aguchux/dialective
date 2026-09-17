-- Go-live financial-integrity hardening.
--
-- 1. Deposit.expectedChargeAmount -- what the provider was asked to collect,
--    so confirmation can reject an underpayment instead of minting the full
--    tokenAmount on a "successful" status alone.
-- 2. P2PTradeStatus.SETTLING -- transitional status that lets the release and
--    refund paths atomically exclude each other from one trade's escrow.

ALTER TABLE "deposits"
  ADD COLUMN IF NOT EXISTS "expectedChargeAmount" DECIMAL(20,8);

ALTER TYPE "P2PTradeStatus" ADD VALUE IF NOT EXISTS 'SETTLING';

-- Backfill the expected local-fiat charge for existing Flutterwave deposits
-- from the country rate that was used to compute it at checkout. Only rows
-- where exactly one country maps to the deposit currency can be reconstructed
-- unambiguously; the rest stay null and fall back to status-only confirmation
-- (the pre-existing behaviour) with a warning logged.
UPDATE "deposits" d
SET "expectedChargeAmount" = ROUND(d."usdAmount" * c."usdExchangeRate", 8)
FROM "countries" c
WHERE d."expectedChargeAmount" IS NULL
  AND d.provider = 'flutterwave'
  AND c."usdExchangeRate" IS NOT NULL
  AND UPPER(c."currencyCode") = UPPER(d.currency)
  AND (
    SELECT COUNT(*) FROM "countries" c2
    WHERE UPPER(c2."currencyCode") = UPPER(d.currency) AND c2."usdExchangeRate" IS NOT NULL
  ) = 1;
