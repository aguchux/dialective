-- Links a Connect registration to the Dialect Library member who claimed
-- it, so event reminders can reach their verified email/phone instead of
-- only the address typed into the form.
--
-- Additive and nullable: existing registrations stay unlinked, and a
-- registration is only ever linked when the person confirmed "yes, that's
-- me" against the matched account. ON DELETE SET NULL because deleting a
-- member must not delete their event registration -- the interest was
-- still real, it just stops being attributable.
ALTER TABLE "connect_registrations" ADD COLUMN "userId" TEXT;
ALTER TABLE "connect_registrations" ADD COLUMN "linkedAt" TIMESTAMP(3);

CREATE INDEX "connect_registrations_userId_idx" ON "connect_registrations"("userId");

ALTER TABLE "connect_registrations"
  ADD CONSTRAINT "connect_registrations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
