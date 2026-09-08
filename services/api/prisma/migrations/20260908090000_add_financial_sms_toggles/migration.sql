-- AlterTable
-- Per-event admin toggles for financial-action SMS notifications, all off
-- by default -- mirrors the existing p2pSms* toggle family.
ALTER TABLE "platform_settings" ADD COLUMN "walletSmsWithdrawalPaidEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "walletSmsWithdrawalRejectedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "walletSmsWithdrawalFailedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "walletSmsDepositConfirmedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "referralSmsFundingBonusEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "referralSmsPayoutBonusEnabled" BOOLEAN NOT NULL DEFAULT false;
