-- Lets a trainer withdraw a testimony they submitted, but only before it has
-- been reviewed (enforced in TestimonialsService.deleteMine).
--
-- Soft delete, not a row removal: enforceMonthlySubmissionCap counts every
-- testimony regardless of status so a rejected or pending attempt cannot be
-- retried indefinitely. Hard-deleting would let someone delete-and-resubmit
-- in a loop and defeat that anti-flooding guard entirely.
ALTER TABLE "testimonies" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- listMine and the admin review queue both filter on this per user.
CREATE INDEX "testimonies_userId_deletedAt_idx" ON "testimonies"("userId", "deletedAt");
