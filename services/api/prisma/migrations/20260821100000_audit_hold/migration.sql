-- Automatic compliance-audit hold: distinct from the existing status
-- (ACTIVE/SUSPENDED/BLOCKED) enum.
ALTER TABLE "users" ADD COLUMN "auditHoldAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "auditHoldReleasedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "auditHoldReleasedById" TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_auditHoldReleasedById_fkey"
  FOREIGN KEY ("auditHoldReleasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_settings" ADD COLUMN "auditHoldEveryNSubmissions" INTEGER NOT NULL DEFAULT 500;
