import type { DefaultSession } from 'next-auth';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    authError?: 'RefreshAccessTokenError' | 'RefreshTokenInvalid' | 'SessionExpired';
    user: {
      id: string;
      role: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR';
      firstName: string | null;
      lastName: string | null;
      dialectTag: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    authError?: 'RefreshAccessTokenError' | 'RefreshTokenInvalid' | 'SessionExpired';
    userId?: string;
    role?: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR';
    firstName?: string | null;
    lastName?: string | null;
    dialectTag?: string | null;
  }
}
