import proxy from './proxy';

// Next.js 14 executes middleware.ts. Keep the policy in proxy.ts so the
// eventual Next.js 16 migration only needs this compatibility file removed.
export default proxy;

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/onboarding', '/login', '/register'],
};
