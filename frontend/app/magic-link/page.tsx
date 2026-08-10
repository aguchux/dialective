'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { Alert, AuthPage, AuthPanel } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { roleHomePath } from '@/lib/role-home';

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
        const session = await getSession();
        window.location.href = roleHomePath(session?.user?.role, session?.user?.onboardingComplete);
      }
    })();
  }, [token]);

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ href: '/login', label: 'Login' }, { label: 'Magic link' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Signing you in...</h1>
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
