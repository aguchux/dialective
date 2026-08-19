-- Origin tracking for Prompt content and source-word traceability for
-- composed sentences (see Prompt.origin/PromptWord.sourceWordId doc
-- comments in schema.prisma).

CREATE TYPE "PromptOrigin" AS ENUM ('SEED', 'LLM_FREEFORM', 'WORD_COMPOSED');

ALTER TABLE "prompts" ADD COLUMN "origin" "PromptOrigin" NOT NULL DEFAULT 'LLM_FREEFORM';

ALTER TABLE "prompt_words" ADD COLUMN "sourceWordId" TEXT;
