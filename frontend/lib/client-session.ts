import type { Session } from 'next-auth';
import { getSession } from 'next-auth/react';

let sessionRequest: Promise<Session | null> | null = null;

/** Share one NextAuth session request across simultaneous RTK Query calls. */
export function getCurrentSession(): Promise<Session | null> {
  if (!sessionRequest) {
    sessionRequest = requestSession().finally(() => {
      sessionRequest = null;
    });
  }

  return sessionRequest;
}

async function requestSession(): Promise<Session | null> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request<Promise<Session | null>>(
      'dialectiva-session-refresh',
      () => getSession(),
    );
  }

  return await getSession();
}
