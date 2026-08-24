-- Second, independent KYC admin toggle: prompting for verification right
-- after onboarding, distinct from the existing withdrawal-threshold gate
-- (isKycRequiredForWithdrawals/kycMinWithdrawalTokens). Purely a UX prompt --
-- skipping it ("do this later") has no enforcement of its own, the trainer
-- just remains subject to whatever the withdrawal gate already requires.
-- Defaults false, so this migration ships inert.
ALTER TABLE "platform_settings" ADD COLUMN "isKycRequiredOnboarding" BOOLEAN NOT NULL DEFAULT false;
