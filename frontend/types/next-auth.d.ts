import type { DefaultSession } from 'next-auth';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    authError?: 'RefreshAccessTokenError' | 'RefreshTokenInvalid' | 'SessionExpired';
    // Exposed so SessionActivityTracker can send a throttled heartbeat
    // (via useSession().update({ lastActiveAt })) and warn before the idle
    // cutoff -- see types below for lastActiveAt/sessionIdleTimeoutMinutes
    // semantics on the JWT they're mirrored from.
    lastActiveAt?: number;
    sessionIdleTimeoutMinutes?: number;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      gender: 'MALE' | 'FEMALE' | null;
      role: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR' | 'VALIDATOR';
      onboardingComplete: boolean;
      dialectTag: string | null;
      referralCode: string | null;
      originCountryId: string | null;
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
    authError?: 'RefreshAccessTokenError' | 'RefreshTokenInvalid' | 'SessionExpired';
    role?: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR' | 'VALIDATOR';
    userId?: string;
    firstName?: string | null;
    lastName?: string | null;
    gender?: 'MALE' | 'FEMALE' | null;
    onboardingComplete?: boolean;
    dialectTag?: string | null;
    referralCode?: string | null;
    originCountryId?: string | null;
    countryId?: string | null;
    // Rolling activity timestamp (ms epoch), bumped by a throttled
    // heartbeat from SessionActivityTracker while the tab is active. Read
    // by frontend/proxy.ts (server-enforced idle timeout, can't be
    // bypassed by disabling client JS) and mirrored client-side for the
    // "you'll be signed out soon" warning.
    lastActiveAt?: number;
    // ms epoch of the original sign-in -- the absolute-session-ceiling
    // anchor. Deliberately NOT reusing the JWT's own `iat` claim: NextAuth
    // re-stamps `iat` to "now" on every encode (i.e. on every request), so
    // it reflects "last re-encoded," not "originally signed in" -- an
    // explicit field is needed for a true absolute ceiling.
    signedInAt?: number;
    // PlatformSettings.sessionIdleTimeoutMinutes/sessionMaxHours, resolved
    // once at sign-in/refresh (see fetchSessionTimeoutSettings in
    // auth-options.ts) and carried in the JWT so proxy.ts can enforce them
    // without a per-request DB call.
    sessionIdleTimeoutMinutes?: number;
    sessionMaxHours?: number;
  }
}
