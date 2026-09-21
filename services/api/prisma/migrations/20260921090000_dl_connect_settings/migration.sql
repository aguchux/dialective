-- DL Connect settings: the hero shown under the menu bar in the trainer
-- dashboard and the community app, plus the event year everything is
-- scoped by.
--
-- connectEventYear is what makes next year's event a settings change
-- rather than a deploy: it is the eventKey suffix ("2026" ->
-- connect-2026) that registrations, the speaker queue and the reminder
-- blasts all read, so flipping it to "2027" starts a fresh list without
-- touching this year's data.
--
-- Additive; the hero defaults to OFF so nothing appears until an admin
-- turns it on.
ALTER TABLE "platform_settings"
  ADD COLUMN "connectHeroEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connectEventYear" TEXT NOT NULL DEFAULT '2026',
  ADD COLUMN "connectHeroTitle" TEXT,
  ADD COLUMN "connectHeroSubtitle" TEXT,
  ADD COLUMN "connectHeroDateLabel" TEXT,
  ADD COLUMN "connectHeroCtaLabel" TEXT,
  ADD COLUMN "connectHeroUrl" TEXT,
  ADD COLUMN "connectHeroImageBucket" TEXT,
  ADD COLUMN "connectHeroImageKey" TEXT;
