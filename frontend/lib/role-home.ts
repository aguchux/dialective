export function roleHomePath(role: string | undefined, onboardingComplete = true): string {
  if (role === 'ADMIN') {
    return '/admin';
  }
  if (role === 'DISTRIBUTOR') {
    return '/distributor';
  }
  if (role === 'VALIDATOR') {
    return '/validator';
  }

  return onboardingComplete ? '/dashboard' : '/onboarding';
}

/**
 * The one external origin a post-auth redirect may leave for. Community
 * is a separate Vercel app on a sibling subdomain that shares this app's
 * session cookie (Domain=.dialectlibrary.com) and hosts no login form of
 * its own -- it bounces signed-out visitors here and expects to be
 * returned to. Without this, every community callbackUrl is an absolute
 * URL, fails the relative-path guard below, and silently dumps the user
 * on /dashboard instead of the discussion they were reading.
 *
 * Deliberately an exact-origin allowlist, not a suffix match: a test for
 * something like endsWith('.dialectlibrary.com') would also accept
 * `evil-dialectlibrary.com`, which is the classic way this guard gets
 * defeated.
 */
const ALLOWED_EXTERNAL_ORIGINS = [
  process.env.NEXT_PUBLIC_COMMUNITY_URL ?? 'https://community.dialectlibrary.com',
];

export function postAuthPath(
  role: string | undefined,
  onboardingComplete: boolean | undefined,
  callbackUrl: string | null,
): string {
  const homePath = roleHomePath(role, onboardingComplete);

  if (!callbackUrl) {
    return homePath;
  }

  // An absolute URL is only honoured when its origin is an exact match
  // for an allowed one. Anything unparseable falls through to the
  // relative-path handling below and is then rejected by it.
  if (/^https?:\/\//i.test(callbackUrl)) {
    try {
      const target = new URL(callbackUrl);
      if (ALLOWED_EXTERNAL_ORIGINS.some((allowed) => new URL(allowed).origin === target.origin)) {
        return callbackUrl;
      }
    } catch {
      /* malformed URL -- fall through to homePath */
    }
    return homePath;
  }

  if (
    !callbackUrl.startsWith('/') ||
    callbackUrl.startsWith('//') ||
    callbackUrl.includes('\\')
  ) {
    return homePath;
  }

  if (role === 'ADMIN' && isPathWithin(callbackUrl, '/admin')) {
    return callbackUrl;
  }

  if (role === 'DISTRIBUTOR' && isPathWithin(callbackUrl, '/distributor')) {
    return callbackUrl;
  }

  if (role === 'VALIDATOR' && isPathWithin(callbackUrl, '/validator')) {
    return callbackUrl;
  }

  if (
    role !== 'ADMIN' &&
    role !== 'DISTRIBUTOR' &&
    role !== 'VALIDATOR' &&
    onboardingComplete &&
    isPathWithin(callbackUrl, '/dashboard')
  ) {
    return callbackUrl;
  }

  return homePath;
}

function isPathWithin(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`) || pathname.startsWith(`${root}?`);
}
