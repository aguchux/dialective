-- Shared chat thread per P2P trade; also carries admin messages once a
-- dispute is raised (isFromAdmin snapshotted at send time).
CREATE TABLE "p2p_trade_messages" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "isFromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT,
    "attachmentKey" TEXT,
    "attachmentContentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_trade_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "p2p_trade_messages_tradeId_createdAt_idx" ON "p2p_trade_messages"("tradeId", "createdAt");

ALTER TABLE "p2p_trade_messages" ADD CONSTRAINT "p2p_trade_messages_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "p2p_token_trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "p2p_trade_messages" ADD CONSTRAINT "p2p_trade_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
