ALTER TABLE "platform_settings"
  ADD COLUMN "testimonyApprovalWeeklyLimit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "testimonyApprovalMonthlyLimit" INTEGER NOT NULL DEFAULT 3;
