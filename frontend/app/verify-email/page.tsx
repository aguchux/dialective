'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => setStatus(res.ok ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <main>
      <h1>Verify email</h1>
      {status === 'pending' && <p>Verifying…</p>}
      {status === 'success' && <p>Your email has been verified. You can close this page.</p>}
      {status === 'error' && <p role="alert">This verification link is invalid or has expired.</p>}
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main>Loading…</main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
