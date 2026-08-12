-- P2P escrow ledger entries
ALTER TYPE "LedgerEntryType" ADD VALUE 'P2P_ESCROW_LOCK';
ALTER TYPE "LedgerEntryType" ADD VALUE 'P2P_ESCROW_REFUND';
ALTER TYPE "LedgerEntryType" ADD VALUE 'P2P_ESCROW_RELEASE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'P2P_ESCROW_CREDIT';

-- P2P escrow market enums
CREATE TYPE "P2POfferType" AS ENUM ('SELL', 'BUY');
CREATE TYPE "P2POfferStatus" AS ENUM ('ACTIVE', 'RESERVED', 'EXPIRED', 'CANCELLED', 'COMPLETED', 'DISPUTED');
CREATE TYPE "P2PTradeStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID_MARKED', 'RELEASED', 'CANCEL_PENDING', 'CANCELLED', 'DISPUTED', 'EXPIRED');
CREATE TYPE "P2PDisputeStatus" AS ENUM ('OPEN', 'RESOLVED_BUYER', 'RESOLVED_SELLER');

-- Admin-gated P2P market settings
CREATE TABLE "p2p_market_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sellOffersEnabled" BOOLEAN NOT NULL DEFAULT false,
  "buyRequestsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "minTradeTokens" DECIMAL(20,8) NOT NULL DEFAULT 1,
  "maxTradeTokens" DECIMAL(20,8) NOT NULL DEFAULT 1000,
  "paymentWindowMinutes" INTEGER NOT NULL DEFAULT 15,
  "cancelGraceMinutes" INTEGER NOT NULL DEFAULT 5,
  "offerExpiryMinutes" INTEGER NOT NULL DEFAULT 1440,
  "maxOpenOffersPerUser" INTEGER NOT NULL DEFAULT 5,
  "maxOpenTradesPerUser" INTEGER NOT NULL DEFAULT 3,
  "allowedFiatCurrencies" TEXT NOT NULL DEFAULT 'NGN',
  "allowedPaymentMethods" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  "disputeWindowMinutes" INTEGER NOT NULL DEFAULT 1440,
  "adminOtpRequiredForDisputes" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "p2p_market_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_payment_methods" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "methodType" TEXT NOT NULL,
  "fiatCurrency" TEXT NOT NULL,
  "bankName" TEXT,
  "accountName" TEXT,
  "accountNumber" TEXT,
  "instructions" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "p2p_token_offers" (
  "id" TEXT NOT NULL,
  "type" "P2POfferType" NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenAmount" DECIMAL(20,8) NOT NULL,
  "remainingTokens" DECIMAL(20,8) NOT NULL,
  "fiatAmount" DECIMAL(20,8) NOT NULL,
  "fiatCurrency" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "paymentMethodId" TEXT,
  "status" "P2POfferStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "p2p_token_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "p2p_token_trades" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "sellerPaymentMethodId" TEXT,
  "tokenAmount" DECIMAL(20,8) NOT NULL,
  "fiatAmount" DECIMAL(20,8) NOT NULL,
  "fiatCurrency" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "status" "P2PTradeStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "paymentDeadlineAt" TIMESTAMP(3) NOT NULL,
  "cancelRequestedByUserId" TEXT,
  "cancelAvailableAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "disputedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "p2p_token_trades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "p2p_disputes" (
  "id" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "raisedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidenceUrl" TEXT,
  "status" "P2PDisputeStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedByAdminId" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "p2p_disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "p2p_disputes_tradeId_key" ON "p2p_disputes"("tradeId");
CREATE INDEX "user_payment_methods_userId_enabled_idx" ON "user_payment_methods"("userId", "enabled");
CREATE INDEX "p2p_token_offers_type_status_expiresAt_idx" ON "p2p_token_offers"("type", "status", "expiresAt");
CREATE INDEX "p2p_token_offers_userId_status_idx" ON "p2p_token_offers"("userId", "status");
CREATE INDEX "p2p_token_trades_buyerId_status_createdAt_idx" ON "p2p_token_trades"("buyerId", "status", "createdAt");
CREATE INDEX "p2p_token_trades_sellerId_status_createdAt_idx" ON "p2p_token_trades"("sellerId", "status", "createdAt");
CREATE INDEX "p2p_token_trades_offerId_idx" ON "p2p_token_trades"("offerId");
CREATE INDEX "p2p_token_trades_status_paymentDeadlineAt_idx" ON "p2p_token_trades"("status", "paymentDeadlineAt");
CREATE INDEX "p2p_disputes_status_createdAt_idx" ON "p2p_disputes"("status", "createdAt");

ALTER TABLE "user_payment_methods" ADD CONSTRAINT "user_payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "p2p_token_offers" ADD CONSTRAINT "p2p_token_offers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "p2p_token_offers" ADD CONSTRAINT "p2p_token_offers_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "user_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "p2p_token_trades" ADD CONSTRAINT "p2p_token_trades_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "p2p_token_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "p2p_token_trades" ADD CONSTRAINT "p2p_token_trades_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "p2p_token_trades" ADD CONSTRAINT "p2p_token_trades_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "p2p_token_trades" ADD CONSTRAINT "p2p_token_trades_sellerPaymentMethodId_fkey" FOREIGN KEY ("sellerPaymentMethodId") REFERENCES "user_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "p2p_disputes" ADD CONSTRAINT "p2p_disputes_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "p2p_token_trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "p2p_disputes" ADD CONSTRAINT "p2p_disputes_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "p2p_disputes" ADD CONSTRAINT "p2p_disputes_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
