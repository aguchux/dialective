'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVerifyEmailMutation } from '@/store/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [verifyEmail] = useVerifyEmailMutation();

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    verifyEmail({ token })
      .unwrap()
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token, verifyEmail]);

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
