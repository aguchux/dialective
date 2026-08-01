import { IsEmail, IsIn, IsString } from 'class-validator';

const OAUTH_PROVIDERS = ['GOOGLE'] as const;

/**
 * Posted by frontend's NextAuth `signIn` callback after NextAuth has
 * already completed the provider handshake (e.g. Google's OAuth code
 * exchange) and verified the identity. api trusts this call because it's
 * authenticated with OAUTH_CALLBACK_SECRET (see AuthController) — api never
 * talks to Google directly, NextAuth does, and only hands api the verified
 * result to persist (AGENTS.md "Authentication" / "NextAuth verifies
 * provider, api persists").
 */
export class OAuthCallbackDto {
  @IsEmail()
  email!: string;

  @IsIn(OAUTH_PROVIDERS)
  provider!: (typeof OAUTH_PROVIDERS)[number];

  @IsString()
  providerAccountId!: string;
}
