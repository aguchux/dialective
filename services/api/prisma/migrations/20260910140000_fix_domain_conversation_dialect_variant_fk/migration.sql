-- The initial migration mistakenly declared this FK as ON DELETE RESTRICT.
-- DomainConversationRecording.dialectVariant has no explicit onDelete in
-- schema.prisma (nullable relation), which Prisma defaults to SET NULL --
-- matching WordRecording.dialectVariant's identical, longstanding
-- convention. Corrects the drift caught by CI's
-- "Verify schema is in sync with migrations" check.
ALTER TABLE "domain_conversation_recordings"
DROP CONSTRAINT "domain_conversation_recordings_dialectVariantId_fkey";

ALTER TABLE "domain_conversation_recordings"
ADD CONSTRAINT "domain_conversation_recordings_dialectVariantId_fkey"
FOREIGN KEY ("dialectVariantId") REFERENCES "dialect_variants"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
