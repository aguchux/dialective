-- Stripe does not need, and Checkout must not receive, a Price for a free tier.
ALTER TABLE "subscription_plans" ALTER COLUMN "stripePriceId" DROP NOT NULL;
