-- Keep fresh P2P settings rows aligned with the supported conversion and
-- settlement rails. Existing admin-configured rows are not overwritten.
ALTER TABLE "p2p_market_settings"
  ALTER COLUMN "allowedFiatCurrencies" SET DEFAULT 'NGN,USD,USDT,USDC',
  ALTER COLUMN "allowedPaymentMethods" SET DEFAULT 'BANK_TRANSFER,MOBILE_MONEY,STABLECOIN';
