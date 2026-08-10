export function roleHomePath(role: string | undefined, onboardingComplete = true): string {
  if (role === 'ADMIN') {
    return '/admin';
  }

  return onboardingComplete ? '/dashboard' : '/onboarding';
}

export function postAuthPath(
  role: string | undefined,
  onboardingComplete: boolean | undefined,
  callbackUrl: string | null,
): string {
  const homePath = roleHomePath(role, onboardingComplete);

  if (!callbackUrl || !callbackUrl.startsWith('/') || callbackUrl.startsWith('//') || callbackUrl.includes('\\')) {
    return homePath;
  }

  if (role === 'ADMIN' && isPathWithin(callbackUrl, '/admin')) {
    return callbackUrl;
  }

  if (role !== 'ADMIN' && onboardingComplete && isPathWithin(callbackUrl, '/dashboard')) {
    return callbackUrl;
  }

  return homePath;
}

function isPathWithin(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`) || pathname.startsWith(`${root}?`);
}
