-- DataAccessLead: add firstName/lastName (backfilled from the existing
-- free-text `name` column so existing rows stay valid under the new
-- NOT NULL constraint), drop the free-text countriesInterested column
-- (replaced by DataAccessLeadInterest), add the optional
-- invitedOrganizationId link set once an admin approves a lead.
ALTER TABLE "data_access_leads" ADD COLUMN "firstName" TEXT;
ALTER TABLE "data_access_leads" ADD COLUMN "lastName" TEXT;

UPDATE "data_access_leads"
SET
  "firstName" = COALESCE(NULLIF(split_part("name", ' ', 1), ''), 'Unknown'),
  "lastName" = COALESCE(NULLIF(substr("name", length(split_part("name", ' ', 1)) + 2), ''), '');

ALTER TABLE "data_access_leads" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "data_access_leads" ALTER COLUMN "lastName" SET NOT NULL;

ALTER TABLE "data_access_leads" DROP COLUMN "countriesInterested";

ALTER TABLE "data_access_leads" ADD COLUMN "invitedOrganizationId" TEXT;
CREATE UNIQUE INDEX "data_access_leads_invitedOrganizationId_key" ON "data_access_leads"("invitedOrganizationId");
ALTER TABLE "data_access_leads" ADD CONSTRAINT "data_access_leads_invitedOrganizationId_fkey"
  FOREIGN KEY ("invitedOrganizationId") REFERENCES "subscriber_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataAccessLeadInterest: one row per (lead, country) with the dialect/
-- subdialect tags checked under that country.
CREATE TABLE "data_access_lead_interests" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "dialectTags" TEXT[],
    "subdialectTags" TEXT[],

    CONSTRAINT "data_access_lead_interests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_access_lead_interests_leadId_countryId_key" ON "data_access_lead_interests"("leadId", "countryId");
CREATE INDEX "data_access_lead_interests_leadId_idx" ON "data_access_lead_interests"("leadId");

ALTER TABLE "data_access_lead_interests" ADD CONSTRAINT "data_access_lead_interests_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "data_access_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_access_lead_interests" ADD CONSTRAINT "data_access_lead_interests_countryId_fkey"
  FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SubscriberInvite: optional firstName/lastName, set on org-provisioning
-- invites so acceptInvite can name the new SubscriberUser correctly.
ALTER TABLE "subscriber_invites" ADD COLUMN "firstName" TEXT;
ALTER TABLE "subscriber_invites" ADD COLUMN "lastName" TEXT;
