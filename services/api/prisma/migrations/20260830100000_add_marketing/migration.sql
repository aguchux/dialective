CREATE TYPE "MarketingAdFormat" AS ENUM ('FEED_SQUARE', 'STORY', 'LINK_PREVIEW');

CREATE TABLE "marketing_ad_photos" (
    "id" TEXT NOT NULL,
    "format" "MarketingAdFormat" NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_ad_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_ad_photos_format_active_sortOrder_idx" ON "marketing_ad_photos"("format", "active", "sortOrder");

CREATE TABLE "marketing_headlines" (
    "id" TEXT NOT NULL,
    "format" "MarketingAdFormat" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_headlines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_headlines_format_active_sortOrder_idx" ON "marketing_headlines"("format", "active", "sortOrder");

CREATE TABLE "marketing_campaign_shares" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "headlineId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaign_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_campaign_shares_userId_photoId_headlineId_key" ON "marketing_campaign_shares"("userId", "photoId", "headlineId");

CREATE INDEX "marketing_campaign_shares_userId_idx" ON "marketing_campaign_shares"("userId");

ALTER TABLE "marketing_campaign_shares" ADD CONSTRAINT "marketing_campaign_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_campaign_shares" ADD CONSTRAINT "marketing_campaign_shares_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "marketing_ad_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_campaign_shares" ADD CONSTRAINT "marketing_campaign_shares_headlineId_fkey" FOREIGN KEY ("headlineId") REFERENCES "marketing_headlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketing_campaign_registrations" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaign_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_campaign_registrations_invitedUserId_key" ON "marketing_campaign_registrations"("invitedUserId");

CREATE INDEX "marketing_campaign_registrations_shareId_idx" ON "marketing_campaign_registrations"("shareId");

ALTER TABLE "marketing_campaign_registrations" ADD CONSTRAINT "marketing_campaign_registrations_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "marketing_campaign_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_campaign_registrations" ADD CONSTRAINT "marketing_campaign_registrations_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 3 headlines that used to be hardcoded as REFERRAL_CAMPAIGNS in
-- TrainerDashboard.tsx, so trainers see existing share copy immediately
-- after deploy instead of an empty picker. No ad photos are seeded (the old
-- code reused a single placeholder image for all three, not a real asset
-- worth carrying forward) -- admin uploads real photos post-deploy.
INSERT INTO "marketing_headlines" ("id", "format", "title", "description", "active", "sortOrder", "createdAt") VALUES
    ('9f6a1b1e-1a1a-4a1a-8a1a-000000000001', 'FEED_SQUARE', 'Start Earning Real money on Dialect Library', 'Contribute voice in your dialect, help train AI, and earn for approved work.', true, 0, CURRENT_TIMESTAMP),
    ('9f6a1b1e-1a1a-4a1a-8a1a-000000000002', 'STORY', 'Contribute voice in your Dialect, get paid', 'Record your local dialect and help make AI more useful for every community.', true, 0, CURRENT_TIMESTAMP),
    ('9f6a1b1e-1a1a-4a1a-8a1a-000000000003', 'LINK_PREVIEW', 'Your dialect matters. Join Dialect Library today.', 'Help preserve dialect voices while contributing to better AI language tools.', true, 0, CURRENT_TIMESTAMP);
