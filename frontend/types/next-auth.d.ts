import type { DefaultSession } from 'next-auth';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    authError?: 'RefreshAccessTokenError' | 'RefreshTokenInvalid';
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      role: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR';
      onboardingComplete: boolean;
      dialectTag: string | null;
      referralCode: string | null;
      countryId: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    refreshRetryAt?: number;
    authError?: 'RefreshAccessTokenError' | 'RefreshTokenInvalid';
    role?: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR';
    userId?: string;
    firstName?: string | null;
    lastName?: string | null;
    onboardingComplete?: boolean;
    dialectTag?: string | null;
    referralCode?: string | null;
    countryId?: string | null;
  }
}
