-- Admin-gated master switch for the free-entry "Bank Transfer" payout
-- option (true free-text bank name + account number, OTP-confirmed,
-- no provider verification). Off by default.
ALTER TABLE "platform_settings" ADD COLUMN "isPlatformPayoutEnabled" BOOLEAN NOT NULL DEFAULT false;
