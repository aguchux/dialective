-- Distinguishes a self-serve Stream signup (SubscriberAuthService.register())
-- from an admin-invited lead on the same DataAccessLead.invitedOrganizationId
-- column, so the admin UI can show "Signed up" instead of "Invited" and hide
-- the Resend invite action for rows that never had an invite in the first place.
ALTER TABLE "data_access_leads" ADD COLUMN "signedUpDirectly" BOOLEAN NOT NULL DEFAULT false;
