import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Defense-in-depth on top of DashboardLayout's client-side session gate
 * (app/dashboard/layout.tsx): without this, every /dashboard/** route is a
 * plain public Next.js route at the framework level -- an unauthenticated
 * request gets a 200 with the full page shell/JS before the client-side
 * redirect fires. This redirects server-side instead, before any dashboard
 * code renders.
 */
export async function middleware(request: NextRequest) {
  // NextAuth's own routes (sign-in, callback, session, csrf) live under
  // /api/auth/** -- the matcher below can't exclude a sub-path directly, so
  // this bails out before the token check, otherwise the login flow itself
  // gets redirected to /login and can never complete.
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request });

  if (token && token.authError !== 'RefreshTokenInvalid') {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/team/:path*', '/api/:path*', '/usage/:path*', '/settings/:path*'],
};
