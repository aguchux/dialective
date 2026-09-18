-- Certified (staff-grade) reviewer status on an integration subscription.
--
-- For ID Review this is a large privilege, not a convenience flag: a
-- certified reviewer sees the document unobscured (no magnifier) and
-- their single verdict decides the verification outright -- no second
-- peer, no admin confirmation. It exists so the platform's own trained
-- reviewers can clear KYC from the trainer app instead of the admin
-- panel.
--
-- Defaults to false: nobody is certified by this migration. Every gate
-- checks certified AND status = 'APPROVED' together, so revoking approval
-- revokes certification with it.
ALTER TABLE "integration_subscriptions"
  ADD COLUMN "certified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "certifiedAt" TIMESTAMP(3),
  ADD COLUMN "certifiedByAdminId" TEXT;

ALTER TABLE "integration_subscriptions"
  ADD CONSTRAINT "integration_subscriptions_certifiedByAdminId_fkey"
  FOREIGN KEY ("certifiedByAdminId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
