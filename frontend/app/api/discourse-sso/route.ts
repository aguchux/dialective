import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * DiscourseConnect (Discourse's official SSO protocol -- see
 * https://meta.discourse.org/t/discourseconnect-official-single-sign-on-for-discourse-sso/13045).
 * Discourse never stores a password for any Dialect Library user: every
 * login/registration on community.dialectlibrary.com round-trips through
 * this route, which trusts the same NextAuth session as the rest of
 * `frontend`. Payload shapes are fixed by the protocol (form-encoded,
 * base64, HMAC-SHA256 hex signature) -- not this app's own convention.
 */

function getSsoSecret(): string {
  const secret = process.env.DISCOURSE_SSO_SECRET;
  if (!secret) {
    throw new Error('DISCOURSE_SSO_SECRET is not set');
  }
  return secret;
}

function getDiscourseUrl(): string {
  const url = process.env.DISCOURSE_URL;
  if (!url) {
    throw new Error('DISCOURSE_URL is not set');
  }
  return url;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function verifySignature(payload: string, sig: string, secret: string): boolean {
  const expected = Buffer.from(sign(payload, secret), 'hex');
  const actual = Buffer.from(sig, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sso = req.nextUrl.searchParams.get('sso');
  const sig = req.nextUrl.searchParams.get('sig');
  if (!sso || !sig) {
    return NextResponse.json({ error: 'Missing sso/sig parameters' }, { status: 400 });
  }

  let secret: string;
  let discourseUrl: string;
  try {
    secret = getSsoSecret();
    discourseUrl = getDiscourseUrl();
  } catch {
    return NextResponse.json({ error: 'Discourse SSO is not configured' }, { status: 500 });
  }

  if (!verifySignature(sso, sig, secret)) {
    return NextResponse.json({ error: 'Invalid SSO signature' }, { status: 401 });
  }

  const inbound = new URLSearchParams(Buffer.from(sso, 'base64').toString('utf8'));
  const nonce = inbound.get('nonce');
  const returnSsoUrl = inbound.get('return_sso_url');
  if (!nonce || !returnSsoUrl) {
    return NextResponse.json({ error: 'Malformed SSO payload' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    const callbackUrl = `${discourseUrl}/session/sso_login?${req.nextUrl.searchParams.toString()}`;
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  const name = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ');
  const outbound = new URLSearchParams({
    nonce,
    external_id: session.user.id,
    email: session.user.email,
    ...(name ? { name } : {}),
    admin: String(session.user.role === 'ADMIN'),
    moderator: String(session.user.role === 'ADMIN'),
  });

  const outboundPayload = Buffer.from(outbound.toString(), 'utf8').toString('base64');
  const outboundSig = sign(outboundPayload, secret);

  const redirectUrl = new URL(returnSsoUrl);
  redirectUrl.searchParams.set('sso', outboundPayload);
  redirectUrl.searchParams.set('sig', outboundSig);

  return NextResponse.redirect(redirectUrl);
}
