import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { apiClient, ApiError, AuthResult, AuthTokens } from './api-client';

/**
 * Both password login and registration now stop at an emailed OTP step
 * (see AuthService.login/register on the API) instead of returning tokens
 * synchronously -- apiClient.login/register return a PendingOtp, not
 * AuthResult. The login/register pages call apiClient.login/register
 * directly (not via signIn) to obtain the ticket and render the code-entry
 * step, then call signIn('otp-verify', {ticket, code}) to finish. This
 * provider is the only one that ever completes a sign-in for the
 * password/OTP path; 'Credentials' below intentionally can no longer
 * succeed synchronously (see its authorize, which now always throws) and is
 * kept only so NextAuth's provider id space/back-compat callers don't 404 --
 * it is not wired into any UI anymore.
 */

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;
const TRANSIENT_REFRESH_RETRY_MS = 15_000;
const ROTATION_RESULT_CACHE_MS = 10_000;

type RefreshCacheEntry = {
  expiresAt: number;
  promise: Promise<AuthTokens>;
};

const refreshCache = new Map<string, RefreshCacheEntry>();

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize() {
        // Password login now requires an OTP step (see the module doc
        // comment above) -- the login page calls apiClient.login directly
        // to get a ticket, then signIn('otp-verify', ...) to finish. This
        // provider is never invoked by the UI anymore; it can't succeed.
        return null;
      },
    }),

    CredentialsProvider({
      id: 'otp-verify',
      name: 'OTP',
      credentials: {
        ticket: { label: 'ticket', type: 'text' },
        code: { label: 'code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.ticket || !credentials?.code) {
          return null;
        }
        const result = await apiClient.verifyOtp(credentials.ticket, credentials.code);
        return authResultToNextAuthUser(result);
      },
    }),

    CredentialsProvider({
      id: 'magic-link',
      name: 'Magic Link',
      credentials: { token: { label: 'token', type: 'text' } },
      async authorize(credentials) {
        if (!credentials?.token) {
          return null;
        }
        const result = await apiClient.consumeMagicLink(credentials.token);
        return authResultToNextAuthUser(result);
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const apiResult = (user as unknown as { __apiAuthResult?: AuthResult } | undefined)
        ?.__apiAuthResult;
      if (apiResult) {
        applyTokens(token, apiResult);
        token.role = apiResult.user.role;
        token.userId = apiResult.user.id;
        token.firstName = apiResult.user.firstName;
        token.lastName = apiResult.user.lastName;
        token.onboardingComplete = apiResult.user.onboardingComplete;
        token.dialectTag = apiResult.user.dialectTag;
        token.referralCode = apiResult.user.referralCode;
        token.originCountryId = apiResult.user.originCountryId;
        token.countryId = apiResult.user.countryId;
        return token;
      }
      // Triggered by useSession().update() after onboarding completes or the
      // profile is edited mid-session, since the JWT otherwise only
      // refreshes these fields on sign-in.
      if (trigger === 'update' && session) {
        if (session.onboardingComplete !== undefined)
          token.onboardingComplete = session.onboardingComplete;
        if (session.dialectTag !== undefined) token.dialectTag = session.dialectTag;
        if (session.originCountryId !== undefined) token.originCountryId = session.originCountryId;
        if (session.countryId !== undefined) token.countryId = session.countryId;
        if (session.firstName !== undefined) token.firstName = session.firstName;
        if (session.lastName !== undefined) token.lastName = session.lastName;
      }

      if (!token.accessToken || !token.refreshToken) {
        return token;
      }

      const expiresAt = token.accessTokenExpires ?? getAccessTokenExpiration(token.accessToken);
      token.accessTokenExpires = expiresAt;

      if (Date.now() < expiresAt - ACCESS_TOKEN_REFRESH_SKEW_MS) {
        token.authError = undefined;
        token.refreshRetryAt = undefined;
        return token;
      }

      if (token.refreshRetryAt && Date.now() < token.refreshRetryAt) {
        return token;
      }

      try {
        const refreshed = await refreshAccessToken(token.refreshToken);
        applyTokens(token, refreshed);
        return token;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          token.accessToken = undefined;
          token.refreshToken = undefined;
          token.accessTokenExpires = undefined;
          token.authError = 'RefreshTokenInvalid';
          token.refreshRetryAt = undefined;
          return token;
        }

        // Keep the refresh credential during temporary API/network failures so
        // a brief outage does not destroy an otherwise valid browser session.
        token.authError = 'RefreshAccessTokenError';
        token.refreshRetryAt = Date.now() + TRANSIENT_REFRESH_RETRY_MS;
      }
      return token;
    },

    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === 'string' ? token.accessToken : '';
      session.authError = token.authError;
      session.user.id = token.userId as string;
      session.user.role = token.role as 'TRAINER' | 'ADMIN' | 'PARTNER';
      session.user.firstName = token.firstName ?? null;
      session.user.lastName = token.lastName ?? null;
      session.user.onboardingComplete = token.onboardingComplete ?? false;
      session.user.dialectTag = token.dialectTag ?? null;
      session.user.referralCode = token.referralCode ?? null;
      session.user.originCountryId = token.originCountryId ?? null;
      session.user.countryId = token.countryId ?? null;
      return session;
    },
  },

  events: {
    async signOut({ token }) {
      if (token.refreshToken) {
        await apiClient.logout(token.refreshToken).catch(() => undefined);
      }
    },
  },

  pages: {
    signIn: '/login',
  },
};

function applyTokens(token: JWT, tokens: AuthTokens): void {
  token.accessToken = tokens.accessToken;
  token.refreshToken = tokens.refreshToken;
  token.accessTokenExpires = getAccessTokenExpiration(tokens.accessToken);
  token.authError = undefined;
  token.refreshRetryAt = undefined;
}

function getAccessTokenExpiration(accessToken: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
    ) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const now = Date.now();

  for (const [key, entry] of refreshCache) {
    if (entry.expiresAt <= now) {
      refreshCache.delete(key);
    }
  }

  const cached = refreshCache.get(refreshToken);
  if (cached) {
    return cached.promise;
  }

  const promise = apiClient.refresh(refreshToken);
  refreshCache.set(refreshToken, {
    expiresAt: now + ROTATION_RESULT_CACHE_MS,
    promise,
  });
  return promise;
}

function authResultToNextAuthUser(result: AuthResult) {
  const name = [result.user.firstName, result.user.lastName].filter(Boolean).join(' ') || undefined;
  return {
    id: result.user.id,
    email: result.user.email,
    name,
    __apiAuthResult: result,
  };
}
