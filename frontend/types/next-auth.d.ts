import type { DefaultSession } from 'next-auth';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      role: 'TRAINER' | 'ADMIN' | 'PARTNER';
      onboardingComplete: boolean;
      dialectTag: string | null;
      referralCode: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    role?: 'TRAINER' | 'ADMIN' | 'PARTNER';
    userId?: string;
    onboardingComplete?: boolean;
    dialectTag?: string | null;
    referralCode?: string | null;
  }
}
