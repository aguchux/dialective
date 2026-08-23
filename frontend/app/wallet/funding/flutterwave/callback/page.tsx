'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLazyVerifyFlutterwaveDepositQuery } from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';

function FlutterwaveFundingCallbackContent() {
  const searchParams = useSearchParams();
  // tx_ref was set to `deposit-${Deposit.id}` when the checkout was created
  // (wallet.controller.ts's createFlutterwaveDeposit) -- Flutterwave echoes
  // it back as a redirect query param, from which the deposit id is
  // recovered to call the verify endpoint.
  const txRef = searchParams.get('tx_ref');
  const depositId = txRef?.startsWith('deposit-') ? txRef.slice('deposit-'.length) : null;
  const [status, setStatus] = useState<'pending' | 'success' | 'failed' | 'error'>('pending');
  const [verify] = useLazyVerifyFlutterwaveDepositQuery();

  useEffect(() => {
    if (!depositId) {
      setStatus('error');
      return;
    }
    verify(depositId)
      .unwrap()
      .then((result) => {
        if (result.credited) {
          setStatus('success');
        } else if (result.status === 'failed') {
          setStatus('failed');
        } else {
          setStatus('pending');
        }
      })
      .catch(() => setStatus('error'));
  }, [depositId, verify]);

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Fund DL' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Fund DL</h1>
        {status === 'pending' && <Notice>Confirming your payment...</Notice>}
        {status === 'success' && (
          <Notice>Payment confirmed. Your DL balance has been updated.</Notice>
        )}
        {status === 'failed' && (
          <Alert>This payment was not successful. No DL were added to your balance.</Alert>
        )}
        {status === 'error' && (
          <Alert>We could not confirm this payment. Contact support if you were charged.</Alert>
        )}
        <p className="text-center text-sm">
          <Link className="font-bold text-accent" href="/dashboard">
            Back to dashboard
          </Link>
        </p>
      </AuthPanel>
    </AuthPage>
  );
}

export default function FlutterwaveFundingCallbackPage() {
  return (
    <Suspense fallback={<AuthPage>Loading...</AuthPage>}>
      <FlutterwaveFundingCallbackContent />
    </Suspense>
  );
}
