-- Flutterwave fiat rail (bank transfer + mobile money), a second payment/
-- payout provider alongside the existing NOWPayments stablecoin rail. Purely
-- additive: existing NOWPayments deposit/withdrawal rows and code paths are
-- unaffected. Kill switches (isFlutterwaveFundingEnabled,
-- isFlutterwavePayoutsEnabled) default false, so this migration ships inert.
CREATE TYPE "PayoutMethod" AS ENUM ('CRYPTO', 'BANK', 'MOBILE_MONEY');
CREATE TYPE "PayoutAccountType" AS ENUM ('BANK', 'MOBILE_MONEY', 'STABLECOIN_WALLET');
CREATE TYPE "PayoutAccountVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED');

CREATE TABLE "payout_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "PayoutAccountType" NOT NULL,
  "country" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'flutterwave',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" "PayoutAccountVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "bankCode" TEXT,
  "bankName" TEXT,
  "accountNumberEncryptedJson" JSONB,
  "accountNumberMasked" TEXT,
  "accountName" TEXT,
  "mobileMoneyNetwork" TEXT,
  "mobileMoneyNumberEncryptedJson" JSONB,
  "mobileMoneyNumberMasked" TEXT,
  "stablecoinAsset" TEXT,
  "stablecoinNetwork" TEXT,
  "walletAddress" TEXT,
  "walletAddressMasked" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payout_accounts_userId_idx" ON "payout_accounts"("userId");
CREATE INDEX "payout_accounts_userId_isDefault_idx" ON "payout_accounts"("userId", "isDefault");
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "flutterwave_webhook_events" (
  "id" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  "txRef" TEXT,
  "depositId" TEXT,
  "flutterwaveTxId" TEXT,
  "eventType" TEXT,
  "providerStatus" TEXT,
  "payload" JSONB NOT NULL,
  "processingError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "flutterwave_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flutterwave_webhook_events_eventHash_key" ON "flutterwave_webhook_events"("eventHash");
CREATE INDEX "flutterwave_webhook_events_depositId_idx" ON "flutterwave_webhook_events"("depositId");
CREATE INDEX "flutterwave_webhook_events_flutterwaveTxId_idx" ON "flutterwave_webhook_events"("flutterwaveTxId");
ALTER TABLE "flutterwave_webhook_events" ADD CONSTRAINT "flutterwave_webhook_events_depositId_fkey"
  FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "flutterwave_payout_events" (
  "id" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  "withdrawalRequestId" TEXT,
  "providerPayoutId" TEXT,
  "eventType" TEXT NOT NULL,
  "providerStatus" TEXT,
  "payload" JSONB NOT NULL,
  "processingError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flutterwave_payout_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flutterwave_payout_events_eventHash_key" ON "flutterwave_payout_events"("eventHash");
CREATE INDEX "flutterwave_payout_events_withdrawalRequestId_idx" ON "flutterwave_payout_events"("withdrawalRequestId");
CREATE INDEX "flutterwave_payout_events_providerPayoutId_idx" ON "flutterwave_payout_events"("providerPayoutId");
ALTER TABLE "flutterwave_payout_events" ADD CONSTRAINT "flutterwave_payout_events_withdrawalRequestId_fkey"
  FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "withdrawal_requests"
  ADD COLUMN "payoutMethod" "PayoutMethod" NOT NULL DEFAULT 'CRYPTO',
  ADD COLUMN "payoutAccountId" TEXT,
  ADD COLUMN "destinationBankCode" TEXT,
  ADD COLUMN "destinationBankName" TEXT,
  ADD COLUMN "destinationAccountNumberEncryptedJson" JSONB,
  ADD COLUMN "destinationAccountNumberMasked" TEXT,
  ADD COLUMN "destinationAccountName" TEXT,
  ADD COLUMN "destinationMobileNetwork" TEXT,
  ADD COLUMN "destinationMobileNumberEncryptedJson" JSONB,
  ADD COLUMN "destinationMobileNumberMasked" TEXT,
  ADD COLUMN "destinationCountry" TEXT;
CREATE INDEX "withdrawal_requests_payoutAccountId_idx" ON "withdrawal_requests"("payoutAccountId");
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_payoutAccountId_fkey"
  FOREIGN KEY ("payoutAccountId") REFERENCES "payout_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_settings"
  ADD COLUMN "isFlutterwaveFundingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isFlutterwavePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowedFlutterwaveCurrencies" TEXT NOT NULL DEFAULT 'NGN,GHS,KES,UGX,ZAR,TZS',
  ADD COLUMN "allowedFlutterwaveCountries" TEXT NOT NULL DEFAULT 'NG,GH,KE,UG,ZA,TZ';
