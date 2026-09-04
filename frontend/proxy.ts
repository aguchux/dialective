import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  DEFAULT_REFERRAL_COOKIE_MAX_AGE_SECONDS,
  MARKETING_CAMPAIGN_COOKIE_KEY,
  REFERRAL_COOKIE_KEY,
  normalizeMarketingCampaignId,
  normalizeReferralCode,
} from '@/lib/referral-cookie';
import { postAuthPath, roleHomePath } from '@/lib/role-home';

const AUTH_PAGES = new Set(['/login', '/register']);

function withReferralCookie(request: NextRequest, response: NextResponse) {
  const referralCode = normalizeReferralCode(
    request.nextUrl.searchParams.get('ref') ??
      request.nextUrl.searchParams.get('referral') ??
      request.nextUrl.searchParams.get('referralCode'),
  );

  if (referralCode) {
    response.cookies.set(REFERRAL_COOKIE_KEY, referralCode, {
      httpOnly: false,
      maxAge: DEFAULT_REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }

  const campaignShareId = normalizeMarketingCampaignId(
    request.nextUrl.searchParams.get('campaign'),
  );

  if (campaignShareId) {
    response.cookies.set(MARKETING_CAMPAIGN_COOKIE_KEY, campaignShareId, {
      httpOnly: false,
      maxAge: DEFAULT_REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }

  return response;
}

function next(request: NextRequest) {
  return withReferralCookie(request, NextResponse.next());
}

function redirect(request: NextRequest, pathname: string, includeCallback = false) {
  const url = request.nextUrl.clone();
  const destination = new URL(pathname, request.url);
  url.pathname = destination.pathname;
  url.search = destination.search;

  if (includeCallback) {
    url.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  }

  return withReferralCookie(request, NextResponse.redirect(url));
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPath =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/distributor') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/notifications') ||
    pathname === '/onboarding';

  if (!AUTH_PAGES.has(pathname) && !isProtectedPath) {
    return next(request);
  }

  const token = await getToken({ req: request });

  if (token?.authError === 'SessionExpired') {
    return AUTH_PAGES.has(pathname)
      ? next(request)
      : redirect(request, '/login?reason=idle', true);
  }

  if (!token || token.authError === 'RefreshTokenInvalid') {
    return AUTH_PAGES.has(pathname) ? next(request) : redirect(request, '/login', true);
  }

  const role = typeof token.role === 'string' ? token.role : undefined;
  const homePath = roleHomePath(role, token.onboardingComplete === true);

  if (AUTH_PAGES.has(pathname)) {
    const destination = postAuthPath(
      role,
      token.onboardingComplete === true,
      request.nextUrl.searchParams.get('callbackUrl'),
    );
    return redirect(request, destination);
  }

  if (pathname.startsWith('/admin')) {
    return role === 'ADMIN' ? next(request) : redirect(request, homePath);
  }

  if (pathname.startsWith('/distributor')) {
    return role === 'DISTRIBUTOR' ? next(request) : redirect(request, homePath);
  }

  if (pathname === '/onboarding') {
    return homePath === '/onboarding' ? next(request) : redirect(request, homePath);
  }

  if (pathname.startsWith('/dashboard') && homePath !== '/dashboard') {
    return redirect(request, homePath);
  }

  return next(request);
}
