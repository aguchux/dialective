-- Track who opened an offer's detail page.
--
-- The market list's Buy/Sell button used to accept an offer directly from the
-- table row, which both risked accidental accepts and left us no signal about
-- interest that did not convert. Buy/Sell now lives on a detail page reached
-- via a View CTA, and this table is what that page records.
--
-- One row per (offer, viewer), so a refresh or a second visit never inflates
-- the count -- lastViewedAt is bumped instead. viewCount on the offer is a
-- denormalized count of these rows, incremented only when a row is actually
-- created, so the market list can show interest without a correlated
-- subquery per row.
CREATE TABLE "p2p_offer_views" (
  "id"           TEXT NOT NULL,
  "offerId"      TEXT NOT NULL,
  "viewerId"     TEXT NOT NULL,
  "viewedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "p2p_offer_views_pkey" PRIMARY KEY ("id")
);

-- The dedupe guarantee the count depends on.
CREATE UNIQUE INDEX "p2p_offer_views_offerId_viewerId_key"
  ON "p2p_offer_views" ("offerId", "viewerId");

CREATE INDEX "p2p_offer_views_offerId_lastViewedAt_idx"
  ON "p2p_offer_views" ("offerId", "lastViewedAt");

CREATE INDEX "p2p_offer_views_viewerId_idx"
  ON "p2p_offer_views" ("viewerId");

ALTER TABLE "p2p_offer_views"
  ADD CONSTRAINT "p2p_offer_views_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "p2p_token_offers" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "p2p_offer_views"
  ADD CONSTRAINT "p2p_offer_views_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "p2p_token_offers"
  ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
