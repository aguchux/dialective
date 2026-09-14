import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { apiClient, ApiError, SubscriberAuthResult, SubscriberAuthTokens } from './api-client';

/**
 * Mirrors frontend/lib/auth-options.ts's shape (proactive refresh with a
 * skew margin, transient-vs-invalid refresh-error handling, an in-flight
 * refresh cache) but simplified for Voice Stream: no magic-link provider,
 * no onboarding/dialect fields -- login/register both stop at an emailed
 * OTP step (see SubscriberAuthService), and this 'otp-verify' provider is
 * the only one that ever completes a sign-in.
 */

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;
const TRANSIENT_REFRESH_RETRY_MS = 15_000;
const ROTATION_RESULT_CACHE_MS = 10_000;

type RefreshCacheEntry = {
  expiresAt: number;
  promise: Promise<SubscriberAuthTokens>;
};

const refreshCache = new Map<string, RefreshCacheEntry>();

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  // NextAuth v4's default cookie name/secure-flag is inferred from
  // NEXTAUTH_URL / the request's forwarded protocol. Behind Vercel's proxy
  // that inference can silently pick the non-`__Secure-` cookie name (or the
  // wrong `secure` flag) on some requests, so a session set during
  // client-side navigation "works" (SessionProvider still has it in memory)
  // but a hard reload -- which forces the browser to actually present a
  // fresh cookie -- can't find it and signs the user out. Pinning this
  // explicitly (mirrors frontend/lib/auth-options.ts, minus the cross-domain
  // `domain` since stream.dialectlibrary.com doesn't share SSO with
  // frontend/community) removes the guesswork.
  cookies: {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
  },
  providers: [
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
  ],

  callbacks: {
    async jwt({ token, user }) {
      const apiResult = (user as unknown as { __apiAuthResult?: SubscriberAuthResult } | undefined)
        ?.__apiAuthResult;
      if (apiResult) {
        applyTokens(token, apiResult);
        token.userId = apiResult.user.id;
        token.firstName = apiResult.user.firstName;
        token.lastName = apiResult.user.lastName;
        token.organizationId = apiResult.organizationId;
        token.orgRole = apiResult.orgRole;
        return token;
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

        token.authError = 'RefreshAccessTokenError';
        token.refreshRetryAt = Date.now() + TRANSIENT_REFRESH_RETRY_MS;
      }
      return token;
    },

    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === 'string' ? token.accessToken : '';
      session.authError = token.authError;
      session.user.id = token.userId as string;
      session.user.firstName = token.firstName ?? null;
      session.user.lastName = token.lastName ?? null;
      session.user.organizationId = token.organizationId as string;
      session.user.orgRole = token.orgRole as SubscriberAuthResult['orgRole'];
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

function applyTokens(token: JWT, tokens: SubscriberAuthTokens): void {
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

function refreshAccessToken(refreshToken: string): Promise<SubscriberAuthTokens> {
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

function authResultToNextAuthUser(result: SubscriberAuthResult) {
  const name = [result.user.firstName, result.user.lastName].filter(Boolean).join(' ') || undefined;
  return {
    id: result.user.id,
    email: result.user.email,
    name,
    __apiAuthResult: result,
  };
}
