-- Adsterra/Monetag don't have a reusable "site/zone ID" to template a URL
-- from -- each ad unit's <script src> carries its own unique hash. Rename
-- the columns to reflect that the full script URL is what's actually
-- stored (still validated as an https:// URL, never raw script/HTML).
ALTER TABLE "community_settings" RENAME COLUMN "adsterraSiteId" TO "adsterraScriptUrl";
ALTER TABLE "community_settings" RENAME COLUMN "monetagZoneId" TO "monetagScriptUrl";
