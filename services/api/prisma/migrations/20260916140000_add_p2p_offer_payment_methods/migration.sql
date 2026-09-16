-- The full set of payout accounts a SELL offer is willing to receive
-- payment into (P2PTokenOffer.paymentMethodId stays as the "primary" one).
CREATE TABLE "p2p_offer_payment_methods" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "payoutAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_offer_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "p2p_offer_payment_methods_offerId_payoutAccountId_key" ON "p2p_offer_payment_methods"("offerId", "payoutAccountId");

CREATE INDEX "p2p_offer_payment_methods_offerId_idx" ON "p2p_offer_payment_methods"("offerId");

ALTER TABLE "p2p_offer_payment_methods" ADD CONSTRAINT "p2p_offer_payment_methods_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "p2p_token_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "p2p_offer_payment_methods" ADD CONSTRAINT "p2p_offer_payment_methods_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "payout_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
