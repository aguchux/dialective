-- Unifies P2P's payment-method picker with the withdrawal flow's payout
-- accounts: a trainer now has exactly one saved-account list
-- (PayoutAccount, /payout-accounts) used by both. UserPaymentMethod is
-- retired. Existing user_payment_methods rows are not migrated (accepted
-- data loss, by explicit product decision) -- any trainer with a saved P2P
-- bank account re-adds it from Profile after this ships, and any open sell
-- offer/trade referencing one loses its payment-method pointer (the offer
-- itself is unaffected; a seller just needs to pick an account again before
-- accepting/completing).

-- Drop old FKs pointing at user_payment_methods.
ALTER TABLE "p2p_token_offers" DROP CONSTRAINT "p2p_token_offers_paymentMethodId_fkey";
ALTER TABLE "p2p_token_trades" DROP CONSTRAINT "p2p_token_trades_sellerPaymentMethodId_fkey";

-- Null out references to rows that are about to disappear.
UPDATE "p2p_token_offers" SET "paymentMethodId" = NULL WHERE "paymentMethodId" IS NOT NULL;
UPDATE "p2p_token_trades" SET "sellerPaymentMethodId" = NULL WHERE "sellerPaymentMethodId" IS NOT NULL;

DROP TABLE "user_payment_methods";

-- Re-point both FKs at payout_accounts instead.
ALTER TABLE "p2p_token_offers" ADD CONSTRAINT "p2p_token_offers_paymentMethodId_fkey"
  FOREIGN KEY ("paymentMethodId") REFERENCES "payout_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "p2p_token_trades" ADD CONSTRAINT "p2p_token_trades_sellerPaymentMethodId_fkey"
  FOREIGN KEY ("sellerPaymentMethodId") REFERENCES "payout_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
