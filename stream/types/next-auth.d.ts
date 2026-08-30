import type { DefaultSession } from 'next-auth';
import 'next-auth';
import 'next-auth/jwt';
import type { SubscriberOrgRole } from '@/lib/api-client';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    authError?: 'RefreshAccessTokenError' | 'RefreshTokenInvalid';
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      organizationId: string;
      orgRole: SubscriberOrgRole;
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
    userId?: string;
    firstName?: string | null;
    lastName?: string | null;
    organizationId?: string;
    orgRole?: SubscriberOrgRole;
  }
}
