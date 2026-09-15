-- CreateIndex
CREATE INDEX "p2p_token_offers_status_type_createdAt_idx" ON "p2p_token_offers"("status", "type", "createdAt");
