-- Offers no longer expire, and the trade lifecycle no longer has an
-- hours-scale backstop.
--
-- A posted offer is a standing intent to trade: it stays listed until its
-- owner cancels, deletes or edits it. The only automatic resolution left is
-- at the trade level -- an unpaid trade past paymentWindowMinutes is
-- cancelled and its offer goes back on the market.
--
-- expiresAt is kept (NOT NULL, read by existing clients) but standing
-- offers carry a far-future sentinel that the API maps back to null.

-- Stand up every currently-live offer so none of them expire.
UPDATE "p2p_token_offers"
SET "expiresAt" = '9999-12-31 23:59:59.999+00'
WHERE "status" IN ('ACTIVE', 'RESERVED');

-- Bring back offers that expired only because the old timer killed them.
-- A SELL offer's escrow was released when it expired, so only BUY offers
-- can be restored safely -- a SELL would be relisted unbacked.
UPDATE "p2p_token_offers"
SET "status" = 'ACTIVE', "expiresAt" = '9999-12-31 23:59:59.999+00'
WHERE "status" = 'EXPIRED' AND "type" = 'BUY';

ALTER TABLE "p2p_market_settings" DROP COLUMN IF EXISTS "abandonedTradeHours";
ALTER TABLE "p2p_market_settings" DROP COLUMN IF EXISTS "unpaidGraceMinutes";
ALTER TABLE "p2p_market_settings" DROP COLUMN IF EXISTS "offerExpiryMinutes";
