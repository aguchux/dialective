'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Alert, AuthPage, AuthPanel, Eyebrow } from '@/components/AuthShell';

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
    <AuthPage>
      <AuthPanel>
        <Eyebrow>Dialectiva</Eyebrow>
        <h1 className="text-[1.75rem] leading-tight">Signing you in...</h1>
        {status === 'error' && <Alert>This sign-in link is invalid or has expired.</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<AuthPage>Loading...</AuthPage>}>
      <MagicLinkContent />
    </Suspense>
  );
}
