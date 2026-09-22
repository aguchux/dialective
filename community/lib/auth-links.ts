const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://dialectlibrary.com';

/**
 * Community hosts no login form of its own -- auth lives on the main site,
 * and the shared session cookie (Domain=.dialectlibrary.com) is what makes
 * the round trip work. These build the same {frontend}/login?callbackUrl=
 * shape middleware.ts already redirects with, so a visitor who signs in
 * from the header lands back exactly where they were rather than on the
 * trainer dashboard.
 *
 * Called from a client component, so window is available; the server-
 * render fallback is community's own origin, which the main site's
 * postAuthPath allows.
 */
function authUrl(path: '/login' | '/register', returnTo?: string): string {
  const callbackUrl =
    returnTo ??
    (typeof window !== 'undefined'
      ? window.location.href
      : (process.env.NEXT_PUBLIC_COMMUNITY_URL ?? 'https://community.dialectlibrary.com'));

  const url = new URL(path, FRONTEND_URL);
  url.searchParams.set('callbackUrl', callbackUrl);
  return url.toString();
}

export function loginUrl(returnTo?: string): string {
  return authUrl('/login', returnTo);
}

export function joinUrl(returnTo?: string): string {
  return authUrl('/register', returnTo);
}
