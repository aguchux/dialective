-- Admin-authored comparison bullets per subscription plan, display-only
-- (not enforced by any guard, unlike the existing numeric limit columns).
ALTER TABLE "subscription_plans" ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
