import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { apiClient, AuthResult } from './api-client';

/**
 * NextAuth has NO database adapter here on purpose -- api is the sole owner
 * of users/credentials/tokens/sessions in Postgres (AGENTS.md
 * "Authentication"). Every provider below either calls api directly
 * (Credentials) or, once NextAuth itself has finished verifying the
 * identity (Google's OAuth handshake), hands the verified result to api via
 * a server-to-server call authenticated with OAUTH_CALLBACK_SECRET. api
 * mints the actual access/refresh tokens; the `jwt` callback below is what
 * carries them into the NextAuth session.
 *
 * There is deliberately NO NextAuth EmailProvider here. Magic-link is
 * entirely api-owned: api generates/hashes/verifies its own opaque token
 * (POST /auth/magic-link/request, POST /auth/magic-link/callback) and
 * Resend sends the email (api's MailService) -- see app/magic-link/page.tsx
 * and app/api/auth/magic-link-consume/route.ts for how a clicked link
 * becomes a NextAuth session via the Credentials provider below, using the
 * `__apiAuthResult` passthrough. Don't add NextAuth's built-in Email
 * provider back; it would create a second, api-unaware magic-link token
 * system.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const result = await apiClient.login(credentials.email, credentials.password);
        return authResultToNextAuthUser(result);
      },
    }),

    /**
     * Not user-facing as a "provider button" -- used internally by
     * app/api/auth/magic-link-consume/route.ts, which has already called
     * api's POST /auth/magic-link/callback and just needs to turn the
     * resulting AuthResult into a NextAuth session via signIn('magic-link', ...).
     */
    CredentialsProvider({
      id: 'magic-link',
      name: 'Magic Link',
      credentials: { authResult: { label: 'authResult', type: 'text' } },
      async authorize(credentials) {
        if (!credentials?.authResult) {
          return null;
        }
        const result = JSON.parse(credentials.authResult) as AuthResult;
        return authResultToNextAuthUser(result);
      },
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  callbacks: {
    /**
     * For Google: NextAuth has already exchanged the OAuth code and
     * verified the identity by this point. Hand the verified email +
     * provider account id to api so api can create/link the user row --
     * api never talks to Google directly.
     */
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        const result = await apiClient.oauthCallback(user.email, 'GOOGLE', account.providerAccountId);
        (user as unknown as { __apiAuthResult: AuthResult }).__apiAuthResult = result;
      }
      return true;
    },

    async jwt({ token, user }) {
      const apiResult = (user as unknown as { __apiAuthResult?: AuthResult } | undefined)?.__apiAuthResult;
      if (apiResult) {
        token.accessToken = apiResult.accessToken;
        token.refreshToken = apiResult.refreshToken;
        token.role = apiResult.user.role;
        token.userId = apiResult.user.id;
      }
      return token;
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.id = token.userId as string;
      session.user.role = token.role as 'TRAINER' | 'ADMIN';
      return session;
    },
  },

  pages: {
    signIn: '/login',
  },
};

function authResultToNextAuthUser(result: AuthResult) {
  return {
    id: result.user.id,
    email: result.user.email,
    __apiAuthResult: result,
  };
}
