-- Landing-page ambient testimonial bubbles.
--
-- Both default to the "off" side so this ships dark: enabling the effect is a
-- deliberate admin action, and an existing deployment's landing page is
-- unchanged until someone turns it on.
ALTER TABLE "platform_settings"
  ADD COLUMN "testimonyBubblesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "testimonyBubbleIntervalSeconds" INTEGER NOT NULL DEFAULT 12;
