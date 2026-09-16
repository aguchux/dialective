-- Existing installations predate mobile-money and stablecoin settlement options.
-- Append the new methods without removing any admin-configured values.
UPDATE "p2p_market_settings"
SET "allowedPaymentMethods" = concat_ws(',',
  NULLIF("allowedPaymentMethods", ''),
  CASE WHEN NOT ('MOBILE_MONEY' = ANY(regexp_split_to_array(upper("allowedPaymentMethods"), '\s*,\s*'))) THEN 'MOBILE_MONEY' END,
  CASE WHEN NOT ('STABLECOIN' = ANY(regexp_split_to_array(upper("allowedPaymentMethods"), '\s*,\s*'))) THEN 'STABLECOIN' END
)
WHERE "id" = 'default';
