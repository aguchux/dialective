'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    fetch(`${PUBLIC_API_V1_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => setStatus(res.ok ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Dialectiva</p>
        <h1>Verify email</h1>
        {status === 'pending' && <p className="notice">Verifying...</p>}
        {status === 'success' && <p className="notice">Your email has been verified. You can close this page.</p>}
        {status === 'error' && (
          <p className="alert" role="alert">
            This verification link is invalid or has expired.
          </p>
        )}
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="auth-page">Loading...</main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
