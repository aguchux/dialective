'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

function MagicLinkContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'pending' | 'error'>('pending');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    (async () => {
      const signInResult = await signIn('magic-link', {
        token,
        redirect: false,
      });

      if (signInResult?.error) {
        setStatus('error');
      } else {
        window.location.href = '/';
      }
    })();
  }, [token]);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Dialectiva</p>
        <h1>Signing you in...</h1>
        {status === 'error' && (
          <p className="alert" role="alert">
            This sign-in link is invalid or has expired.
          </p>
        )}
      </section>
    </main>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<main className="auth-page">Loading...</main>}>
      <MagicLinkContent />
    </Suspense>
  );
}
