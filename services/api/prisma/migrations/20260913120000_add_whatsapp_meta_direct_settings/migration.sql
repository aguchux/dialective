ALTER TABLE "platform_settings"
  ADD COLUMN "whatsappProvider" TEXT NOT NULL DEFAULT 'mailersend',
  ADD COLUMN "whatsappMetaPhoneNumberId" TEXT,
  ADD COLUMN "whatsappMetaBusinessAccountId" TEXT,
  ADD COLUMN "whatsappMetaTemplateName" TEXT,
  ADD COLUMN "whatsappMetaTemplateLanguage" TEXT NOT NULL DEFAULT 'en_US',
  ADD COLUMN "whatsappMetaAccessTokenEncrypted" TEXT,
  ADD COLUMN "whatsappMetaAccessTokenIv" TEXT,
  ADD COLUMN "whatsappMetaAccessTokenAuthTag" TEXT;
