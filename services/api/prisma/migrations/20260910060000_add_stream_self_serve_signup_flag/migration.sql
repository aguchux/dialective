-- Gates POST /voice-stream/auth/register (self-serve Stream signup, no
-- invite required) and the Stream /register page's signup-vs-request-access
-- form choice. Defaults to false -- Stream stays admin-invite-only unless an
-- admin explicitly turns this on.
ALTER TABLE "platform_settings" ADD COLUMN "streamSelfServeSignupEnabled" BOOLEAN NOT NULL DEFAULT false;
