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
      const res = await fetch('/api/auth/magic-link-consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        setStatus('error');
        return;
      }

      const authResult = await res.json();
      const signInResult = await signIn('magic-link', {
        authResult: JSON.stringify(authResult),
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
    <main>
      <h1>Signing you in…</h1>
      {status === 'error' && <p role="alert">This sign-in link is invalid or has expired.</p>}
    </main>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<main>Loading…</main>}>
      <MagicLinkContent />
    </Suspense>
  );
}
