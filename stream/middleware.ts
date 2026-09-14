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
  const token = await getToken({ req: request });

  if (token && token.authError !== 'RefreshTokenInvalid') {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/team/:path*'],
};
