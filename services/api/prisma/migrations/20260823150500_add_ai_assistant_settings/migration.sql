-- Only one support surface is rendered at a time. TAWK preserves existing
-- deployments until an admin explicitly selects AI or disables support chat.
ALTER TABLE "platform_settings"
  ADD COLUMN "supportChatMode" TEXT NOT NULL DEFAULT 'TAWK';
