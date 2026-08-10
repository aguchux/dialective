import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { postAuthPath, roleHomePath } from '@/lib/role-home';

const AUTH_PAGES = new Set(['/login', '/register']);

function redirect(request: NextRequest, pathname: string, includeCallback = false) {
  const url = request.nextUrl.clone();
  const destination = new URL(pathname, request.url);
  url.pathname = destination.pathname;
  url.search = destination.search;

  if (includeCallback) {
    url.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  }

  return NextResponse.redirect(url);
}

export default async function proxy(request: NextRequest) {
  const token = await getToken({ req: request });
  const pathname = request.nextUrl.pathname;

  if (!token) {
    return AUTH_PAGES.has(pathname) ? NextResponse.next() : redirect(request, '/login', true);
  }

  const role = typeof token.role === 'string' ? token.role : undefined;
  const homePath = roleHomePath(role, token.onboardingComplete === true);

  if (AUTH_PAGES.has(pathname)) {
    const destination = postAuthPath(role, token.onboardingComplete === true, request.nextUrl.searchParams.get('callbackUrl'));
    return redirect(request, destination);
  }

  if (pathname.startsWith('/admin')) {
    return role === 'ADMIN' ? NextResponse.next() : redirect(request, homePath);
  }

  if (pathname === '/onboarding') {
    return homePath === '/onboarding' ? NextResponse.next() : redirect(request, homePath);
  }

  if (pathname.startsWith('/dashboard') && homePath !== '/dashboard') {
    return redirect(request, homePath);
  }

  return NextResponse.next();
}
