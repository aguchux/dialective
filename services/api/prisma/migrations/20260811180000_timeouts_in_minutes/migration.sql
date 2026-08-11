-- Rename hour-based timeout columns to minute-based, converting existing
-- values (x60) so any admin-configured override keeps the same real-world
-- duration instead of silently becoming 60x shorter.
ALTER TABLE "platform_settings" RENAME COLUMN "wordStuckTimeoutHours" TO "wordStuckTimeoutMinutes";
ALTER TABLE "platform_settings" RENAME COLUMN "scoringSlaHours" TO "scoringSlaMinutes";

ALTER TABLE "platform_settings" ALTER COLUMN "wordStuckTimeoutMinutes" SET DEFAULT 1440;
ALTER TABLE "platform_settings" ALTER COLUMN "scoringSlaMinutes" SET DEFAULT 60;

UPDATE "platform_settings" SET "wordStuckTimeoutMinutes" = "wordStuckTimeoutMinutes" * 60;
UPDATE "platform_settings" SET "scoringSlaMinutes" = "scoringSlaMinutes" * 60;
