import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://dialectlibrary.com';

/**
 * community.dialectlibrary.com never hosts its own login form -- a signed-
 * out visitor is bounced to frontend's /login with a callbackUrl back here,
 * and frontend's shared-cookie session (Domain=.dialectlibrary.com) is what
 * lets them land back already authenticated. Read-only routes (home, a
 * single post, a space) stay public so links are shareable; only
 * write/personal routes require a session.
 */
const PROTECTED_PREFIXES = ['/new', '/me', '/saved', '/notifications', '/settings'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', FRONTEND_URL);
  loginUrl.searchParams.set('callbackUrl', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/new/:path*', '/me/:path*', '/saved/:path*', '/notifications/:path*', '/settings/:path*'],
};
