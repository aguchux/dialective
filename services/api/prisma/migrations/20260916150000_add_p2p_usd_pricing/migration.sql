-- Snapshot the server-resolved USD value alongside the settlement-currency
-- value so every P2P offer and trade remains auditable after FX rates move.
ALTER TABLE "p2p_token_offers" ADD COLUMN "usdAmount" DECIMAL(20,8);
ALTER TABLE "p2p_token_trades" ADD COLUMN "usdAmount" DECIMAL(20,8);

-- Legacy rows predate USD snapshots. Reconstruct them from the configured DL
-- peg (falling back to the historical $0.10 default) before enforcing NOT NULL.
UPDATE "p2p_token_offers"
SET "usdAmount" = "tokenAmount" * COALESCE(
  (SELECT "tokenUsdRate" FROM "platform_settings" WHERE "id" = 'default'),
  0.10
);

UPDATE "p2p_token_trades"
SET "usdAmount" = "tokenAmount" * COALESCE(
  (SELECT "tokenUsdRate" FROM "platform_settings" WHERE "id" = 'default'),
  0.10
);

ALTER TABLE "p2p_token_offers" ALTER COLUMN "usdAmount" SET NOT NULL;
ALTER TABLE "p2p_token_trades" ALTER COLUMN "usdAmount" SET NOT NULL;

-- Stablecoins and USD are 1:1 settlement currencies. Preserve every existing
-- admin-selected currency while making these options available in production.
UPDATE "p2p_market_settings"
SET "allowedFiatCurrencies" = concat_ws(',',
  NULLIF("allowedFiatCurrencies", ''),
  CASE WHEN NOT ('USD' = ANY(regexp_split_to_array(upper("allowedFiatCurrencies"), '\s*,\s*'))) THEN 'USD' END,
  CASE WHEN NOT ('USDT' = ANY(regexp_split_to_array(upper("allowedFiatCurrencies"), '\s*,\s*'))) THEN 'USDT' END,
  CASE WHEN NOT ('USDC' = ANY(regexp_split_to_array(upper("allowedFiatCurrencies"), '\s*,\s*'))) THEN 'USDC' END
)
WHERE "id" = 'default';
