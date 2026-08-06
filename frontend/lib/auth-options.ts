import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { apiClient, AuthResult } from './api-client';

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

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        const result = await apiClient.oauthCallback(user.email, 'GOOGLE', account.providerAccountId);
        (user as unknown as { __apiAuthResult: AuthResult }).__apiAuthResult = result;
      }
      return true;
    },

    async jwt({ token, user, trigger, session }) {
      const apiResult = (user as unknown as { __apiAuthResult?: AuthResult } | undefined)?.__apiAuthResult;
      if (apiResult) {
        token.accessToken = apiResult.accessToken;
        token.refreshToken = apiResult.refreshToken;
        token.role = apiResult.user.role;
        token.userId = apiResult.user.id;
        token.onboardingComplete = apiResult.user.onboardingComplete;
        token.dialectTag = apiResult.user.dialectTag;
      }
      // Triggered by useSession().update() after onboarding is completed
      // mid-session, since the JWT otherwise only refreshes this on sign-in.
      if (trigger === 'update' && session) {
        token.onboardingComplete = session.onboardingComplete;
        token.dialectTag = session.dialectTag;
      }
      return token;
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.id = token.userId as string;
      session.user.role = token.role as 'TRAINER' | 'ADMIN';
      session.user.onboardingComplete = token.onboardingComplete ?? false;
      session.user.dialectTag = token.dialectTag ?? null;
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
