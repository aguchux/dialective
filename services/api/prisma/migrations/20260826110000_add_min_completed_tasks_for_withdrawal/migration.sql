-- New withdrawal gate alongside the existing minWithdrawalTokens amount
-- threshold: a trainer must have this many SETTLED submissions+wordRecordings
-- before any withdrawal (fiat or crypto) is allowed. Nullable override,
-- same pattern as minWithdrawalTokens -- null means "use the code default"
-- (100), set means the admin's override wins.
ALTER TABLE "platform_settings" ADD COLUMN "minCompletedTasksForWithdrawal" INTEGER;
