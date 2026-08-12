-- Dialect: admin/AI-drafted virtual keyboard character set
ALTER TABLE "dialects" ADD COLUMN "keyboardLayout" TEXT;

-- WordRecording: AI spelling-normalization companion field
ALTER TABLE "word_recordings" ADD COLUMN "normalizedTranslationText" TEXT;

-- PlatformSettings: spelling-normalization enable + provider order
ALTER TABLE "platform_settings" ADD COLUMN "spellingNormalizationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "spellingNormalizationProviderOrder" TEXT NOT NULL DEFAULT 'openai,deepseek,anthropic';
