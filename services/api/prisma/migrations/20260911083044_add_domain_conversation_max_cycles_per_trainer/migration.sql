-- Caps how many times a trainer may cycle through the Domain Conversation
-- prompt pool before nextPrompt blocks until new prompts are generated.
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationMaxCyclesPerTrainer" INTEGER NOT NULL DEFAULT 2;
