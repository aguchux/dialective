ALTER TABLE "platform_settings"
ADD COLUMN "testimonyTextRewardTokens" DECIMAL(20, 8) NOT NULL DEFAULT 5,
ADD COLUMN "testimonyVideoRewardTokens" DECIMAL(20, 8) NOT NULL DEFAULT 5;

-- Preserve the configured single reward for existing installations as the
-- initial reward for both formats. New settings can then be adjusted
-- independently without changing historical credits.
UPDATE "platform_settings"
SET
  "testimonyTextRewardTokens" = "testimonyRewardTokens",
  "testimonyVideoRewardTokens" = "testimonyRewardTokens";
