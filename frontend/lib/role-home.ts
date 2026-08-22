export function roleHomePath(role: string | undefined, onboardingComplete = true): string {
  if (role === 'ADMIN') {
    return '/admin';
  }
  if (role === 'DISTRIBUTOR') {
    return '/distributor';
  }

  return onboardingComplete ? '/dashboard' : '/onboarding';
}

export function postAuthPath(
  role: string | undefined,
  onboardingComplete: boolean | undefined,
  callbackUrl: string | null,
): string {
  const homePath = roleHomePath(role, onboardingComplete);

  if (
    !callbackUrl ||
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

  if (
    role !== 'ADMIN' &&
    role !== 'DISTRIBUTOR' &&
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
