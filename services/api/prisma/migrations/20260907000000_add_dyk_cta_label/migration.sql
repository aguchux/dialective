-- Admin-editable CTA button text for a DYK notice, replacing the frontend's
-- hardcoded "Try it Now" label. Existing rows default to that same text so
-- behavior is unchanged until an admin edits one.
ALTER TABLE "DykNotice" ADD COLUMN "ctaLabel" TEXT NOT NULL DEFAULT 'Try it Now';
