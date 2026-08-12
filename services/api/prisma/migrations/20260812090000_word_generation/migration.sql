-- Coverage toggles
ALTER TABLE "countries" ADD COLUMN "llmGenerationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "dialects" ADD COLUMN "llmGenerationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- PlatformSettings: word-generator-job knobs
ALTER TABLE "platform_settings" ADD COLUMN "llmGenerationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "llmProviderOrder" TEXT NOT NULL DEFAULT 'openai,deepseek,anthropic';
ALTER TABLE "platform_settings" ADD COLUMN "llmWordsPerItem" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "platform_settings" ADD COLUMN "llmItemsPerRun" INTEGER NOT NULL DEFAULT 15;

-- WordTranslation
CREATE TABLE "word_translations" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "word_translations_wordId_dialectTag_key" ON "word_translations"("wordId", "dialectTag");
CREATE INDEX "word_translations_dialectTag_idx" ON "word_translations"("dialectTag");

ALTER TABLE "word_translations" ADD CONSTRAINT "word_translations_wordId_fkey"
    FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PromptTranslation
CREATE TABLE "prompt_translations" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prompt_translations_promptId_dialectTag_key" ON "prompt_translations"("promptId", "dialectTag");
CREATE INDEX "prompt_translations_dialectTag_idx" ON "prompt_translations"("dialectTag");

ALTER TABLE "prompt_translations" ADD CONSTRAINT "prompt_translations_promptId_fkey"
    FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
