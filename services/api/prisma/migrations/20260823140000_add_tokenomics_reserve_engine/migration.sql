-- Tokenomics reserve engine. These tables are additive: legacy wallets and
-- ledger entries remain authoritative until their individual mutation paths
-- are migrated to token_accounts in a controlled cut-over.
CREATE TYPE "TokenAccountKind" AS ENUM ('USER', 'TREASURY', 'BURN');
CREATE TYPE "TokenOperationType" AS ENUM ('MINT', 'TRANSFER', 'LOCK', 'UNLOCK', 'BURN', 'REDEEM', 'ADJUSTMENT', 'TREASURY_ALLOCATION');
CREATE TYPE "TokenOperationStatus" AS ENUM ('PENDING', 'SETTLED', 'REVERSED', 'CANCELLED');
CREATE TYPE "ReserveTransactionType" AS ENUM ('INITIAL_RESERVE', 'PAYMENT_FUNDING', 'BUSINESS_REVENUE', 'RESERVE_ALLOCATION', 'REDEMPTION', 'FEE', 'REFUND', 'REVERSAL', 'ADJUSTMENT', 'OTHER');
CREATE TYPE "ReserveTransactionStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'EXCLUDED', 'REVERSED');
CREATE TYPE "ReserveDirection" AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE "tokenomics_policies" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "mintingPaused" BOOLEAN NOT NULL DEFAULT false,
  "valuationIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
  "maxIncreaseRate" DECIMAL(8,6) NOT NULL DEFAULT 0.05,
  "maxDecreaseRate" DECIMAL(8,6) NOT NULL DEFAULT 0.05,
  "dailyEmissionBudgetUsd" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "healthyCoverageThreshold" DECIMAL(8,6) NOT NULL DEFAULT 1,
  "watchCoverageThreshold" DECIMAL(8,6) NOT NULL DEFAULT 0.8,
  "restrictedCoverageThreshold" DECIMAL(8,6) NOT NULL DEFAULT 0.6,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tokenomics_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "token_accounts" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" "TokenAccountKind" NOT NULL,
  "userId" TEXT,
  "available" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "locked" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "token_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "token_accounts_code_key" ON "token_accounts"("code");
CREATE UNIQUE INDEX "token_accounts_userId_key" ON "token_accounts"("userId");
CREATE INDEX "token_accounts_kind_idx" ON "token_accounts"("kind");

CREATE TABLE "token_operations" (
  "id" TEXT NOT NULL,
  "type" "TokenOperationType" NOT NULL,
  "status" "TokenOperationStatus" NOT NULL DEFAULT 'SETTLED',
  "idempotencyKey" TEXT NOT NULL,
  "reference" TEXT,
  "reason" TEXT,
  "policyVersion" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "token_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "token_operations_idempotencyKey_key" ON "token_operations"("idempotencyKey");
CREATE INDEX "token_operations_type_createdAt_idx" ON "token_operations"("type", "createdAt");

CREATE TABLE "token_ledger_entries" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "availableDelta" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "lockedDelta" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "token_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "token_ledger_entries_accountId_operationId_key" ON "token_ledger_entries"("accountId", "operationId");
CREATE INDEX "token_ledger_entries_operationId_idx" ON "token_ledger_entries"("operationId");

CREATE TABLE "reserve_accounts" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "asset" TEXT NOT NULL,
  "network" TEXT NOT NULL DEFAULT '',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reserve_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reserve_accounts_provider_asset_network_key" ON "reserve_accounts"("provider", "asset", "network");

CREATE TABLE "reserve_transactions" (
  "id" TEXT NOT NULL,
  "reserveAccountId" TEXT NOT NULL,
  "type" "ReserveTransactionType" NOT NULL,
  "status" "ReserveTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "direction" "ReserveDirection" NOT NULL,
  "amount" DECIMAL(20,8) NOT NULL,
  "eligibleUsdAmount" DECIMAL(20,8) NOT NULL,
  "normalizationRate" DECIMAL(20,8) NOT NULL,
  "providerReference" TEXT,
  "sourceReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "reserve_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reserve_transactions_idempotencyKey_key" ON "reserve_transactions"("idempotencyKey");
CREATE INDEX "reserve_transactions_status_createdAt_idx" ON "reserve_transactions"("status", "createdAt");
CREATE INDEX "reserve_transactions_providerReference_idx" ON "reserve_transactions"("providerReference");
CREATE INDEX "reserve_transactions_sourceReference_idx" ON "reserve_transactions"("sourceReference");

CREATE TABLE "valuation_snapshots" (
  "id" TEXT NOT NULL,
  "eligibleReserveUsd" DECIMAL(20,8) NOT NULL,
  "redeemableSupply" DECIMAL(20,8) NOT NULL,
  "totalMinted" DECIMAL(20,8) NOT NULL,
  "circulatingSupply" DECIMAL(20,8) NOT NULL,
  "treasurySupply" DECIMAL(20,8) NOT NULL,
  "lockedSupply" DECIMAL(20,8) NOT NULL,
  "burnedSupply" DECIMAL(20,8) NOT NULL,
  "rawValueUsd" DECIMAL(20,8) NOT NULL,
  "previousPublishedValue" DECIMAL(20,8),
  "publishedValueUsd" DECIMAL(20,8) NOT NULL,
  "coverageRatio" DECIMAL(20,8),
  "policyVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "valuation_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "valuation_snapshots_createdAt_idx" ON "valuation_snapshots"("createdAt");

ALTER TABLE "token_ledger_entries"
  ADD CONSTRAINT "token_ledger_entries_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "token_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "token_ledger_entries_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "token_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reserve_transactions"
  ADD CONSTRAINT "reserve_transactions_reserveAccountId_fkey"
  FOREIGN KEY ("reserveAccountId") REFERENCES "reserve_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
