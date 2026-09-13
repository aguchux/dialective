ALTER TABLE "platform_settings"
  ADD COLUMN "otpChannel" TEXT NOT NULL DEFAULT 'sms',
  ADD COLUMN "whatsappOtpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappSenderId" TEXT,
  ADD COLUMN "whatsappTemplateId" TEXT,
  ADD COLUMN "whatsappApiKeyEncrypted" TEXT,
  ADD COLUMN "whatsappApiKeyIv" TEXT,
  ADD COLUMN "whatsappApiKeyAuthTag" TEXT;
