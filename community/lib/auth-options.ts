import type { NextAuthOptions } from 'next-auth';

/**
 * community.dialectlibrary.com is SSO-only: a viewer always logs in on
 * frontend (the apex dialectlibrary.com), which sets its NextAuth session
 * cookie at Domain=.dialectlibrary.com (see frontend/lib/auth-options.ts's
 * cookies config). This app never issues its own session -- there is no
 * credentials provider, no login page, no jwt/session write path of its
 * own -- it only *decodes* the shared cookie. For that to work,
 * NEXTAUTH_SECRET here must be byte-for-byte identical to frontend's, and
 * the `cookies` names/options below must match frontend's exactly so
 * getToken()/getServerSession() find and can decrypt the same cookie.
 *
 * A visitor with no session is redirected to frontend's /login with a
 * callbackUrl back to community -- see middleware.ts.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  providers: [],
  cookies: {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
        domain: '.dialectlibrary.com',
      },
    },
  },
  callbacks: {
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === 'string' ? token.accessToken : '';
      session.authError = token.authError;
      session.user.id = token.userId as string;
      session.user.role = token.role as 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR';
      session.user.firstName = token.firstName ?? null;
      session.user.lastName = token.lastName ?? null;
      session.user.dialectTag = token.dialectTag ?? null;
      return session;
    },
  },
};
