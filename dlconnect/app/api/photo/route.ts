import { NextRequest, NextResponse } from 'next/server';

const apiBase = process.env.CONNECT_API_URL ?? 'http://localhost:3000/api/v1';

/** Details for the upload page: who the link belongs to and when it lapses. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ message: 'Missing link token.' }, { status: 400 });
  try {
    const response = await fetch(`${apiBase}/leads/connect-2026/photo/${token}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ message: 'Temporarily unavailable.' }, { status: 503 });
  }
}

/**
 * Two steps behind one route: `?step=sign` swaps the link token for a
 * short-lived presigned PUT, `?step=complete` records the finished upload.
 * The browser PUTs to Spaces directly in between, so the image never
 * passes through this app.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const step = request.nextUrl.searchParams.get('step');
  if (!token) return NextResponse.json({ message: 'Missing link token.' }, { status: 400 });
  const path =
    step === 'complete'
      ? `${apiBase}/leads/connect-2026/photo/${token}/complete`
      : `${apiBase}/leads/connect-2026/photo/${token}`;
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await request.json()),
      cache: 'no-store',
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ message: 'Temporarily unavailable.' }, { status: 503 });
  }
}
