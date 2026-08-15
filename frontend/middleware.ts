import proxy from './proxy';

// Next.js 14 executes middleware.ts. Keep the policy in proxy.ts so the
// eventual Next.js 16 migration only needs this compatibility file removed.
export default proxy;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
