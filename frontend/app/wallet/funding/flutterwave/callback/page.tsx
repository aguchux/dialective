'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useLazyVerifyFlutterwaveDepositQuery,
  useCheckFlutterwaveDepositStatusMutation,
} from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';

function FlutterwaveFundingCallbackContent() {
  const searchParams = useSearchParams();
  // v3: tx_ref was set to `deposit-${Deposit.id}` when the checkout was
  // created (wallet.controller.ts's createFlutterwaveDeposit) -- Flutterwave
  // echoes it back as a redirect query param, from which the deposit id is
  // recovered to call the verify endpoint. v4: the deposit id and provider
  // are embedded directly in our own redirect_url (createFlutterwaveDeposit's
  // v4 branch), since Flutterwave's own echoed-back param name for the
  // auth_redirect mobile-money scenario isn't confirmed -- no guessing
  // needed, read it straight from our own query string instead.
  const txRef = searchParams.get('tx_ref');
  const isV4 = searchParams.get('provider') === 'flutterwave-v4';
  const depositId = isV4
    ? searchParams.get('depositId')
    : txRef?.startsWith('deposit-')
      ? txRef.slice('deposit-'.length)
      : null;
  const [status, setStatus] = useState<'pending' | 'success' | 'failed' | 'error'>('pending');
  const [verify] = useLazyVerifyFlutterwaveDepositQuery();
  const [checkStatus] = useCheckFlutterwaveDepositStatusMutation();

  useEffect(() => {
    if (!depositId) {
      setStatus('error');
      return;
    }
    const request = isV4 ? checkStatus(depositId).unwrap() : verify(depositId).unwrap();
    request
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
  }, [depositId, isV4, verify, checkStatus]);

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
