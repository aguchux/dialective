'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVerifyEmailMutation } from '@/store/api';
import { Alert, AuthPage, AuthPanel, Eyebrow, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';

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
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Verify email' }]} />
        <Eyebrow>Dialect Library</Eyebrow>
        <h1 className="text-[1.75rem] leading-tight">Verify email</h1>
        {status === 'pending' && <Notice>Verifying...</Notice>}
        {status === 'success' && <Notice>Your email has been verified. You can close this page.</Notice>}
        {status === 'error' && <Alert>This verification link is invalid or has expired.</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthPage>Loading...</AuthPage>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
