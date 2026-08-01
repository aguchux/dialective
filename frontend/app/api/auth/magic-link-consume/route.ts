import { NextRequest, NextResponse } from 'next/server';
import { apiClient } from '@/lib/api-client';

/**
 * Server-side only: exchanges an api-issued magic-link token for an
 * AuthResult (calling api's OAUTH_CALLBACK_SECRET-guarded endpoint, which a
 * browser can't call directly) and returns it so the client page can hand
 * it to NextAuth's 'magic-link' Credentials provider. See
 * app/magic-link/page.tsx and lib/auth-options.ts.
 */
export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) {
    return NextResponse.json({ message: 'token is required' }, { status: 400 });
  }

  try {
    const result = await apiClient.consumeMagicLink(token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ message: 'Invalid or expired magic link' }, { status: 401 });
  }
}
