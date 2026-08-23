ALTER TABLE "withdrawal_requests"
ADD COLUMN "fiatAmount" DECIMAL(20, 8),
ADD COLUMN "fiatUsdExchangeRate" DECIMAL(18, 6);

-- Existing pending fiat withdrawals never stored their local amount. Backfill
-- from the current country FX rate so admins can review them before payout.
-- New requests snapshot this value at creation and are not affected by later
-- FX-rate changes.
UPDATE "withdrawal_requests" AS withdrawal
SET
  "fiatAmount" = withdrawal."usdtAmount" * country."usdExchangeRate",
  "fiatUsdExchangeRate" = country."usdExchangeRate"
FROM "countries" AS country
WHERE withdrawal."payoutMethod" <> 'CRYPTO'
  AND UPPER(withdrawal."destinationCountry") = country."code"
  AND country."usdExchangeRate" IS NOT NULL;
