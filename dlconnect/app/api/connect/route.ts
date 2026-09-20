import { NextRequest, NextResponse } from 'next/server';

const apiBase = process.env.CONNECT_API_URL ?? 'http://localhost:3000/api/v1';

export async function GET() {
  try {
    const [statsResponse, countriesResponse] = await Promise.all([
      fetch(`${apiBase}/leads/connect-2026/stats`, { cache: 'no-store' }),
      fetch(`${apiBase}/geo/countries`, { cache: 'no-store' }),
    ]);
    if (!statsResponse.ok || !countriesResponse.ok) throw new Error('API unavailable');
    const [stats, countries] = await Promise.all([statsResponse.json(), countriesResponse.json()]);
    return NextResponse.json({ stats, countries }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ message: 'Event information is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${apiBase}/leads/connect-2026`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: 'Registration is temporarily unavailable. Please try again shortly.' },
      { status: 503 },
    );
  }
}
