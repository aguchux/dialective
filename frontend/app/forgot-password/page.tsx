'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { normalizeErrorMessage, useRequestPasswordResetMutation } from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryLinkClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestPasswordReset, { isLoading }] = useRequestPasswordResetMutation();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await requestPasswordReset({ email: email.trim() }).unwrap();
      setSent(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to send a reset email right now.'));
    }
  }

  if (sent) {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ href: '/login', label: 'Login' }, { label: 'Forgot password' }]} />
          <h1 className="text-center text-[1.75rem] leading-tight">Check your email</h1>
          <Notice>
            If an account exists for {email}, we sent a password reset link. The link expires in 1 hour.
          </Notice>
          <div className="grid gap-2">
            <Link className={primaryButtonClass} href="/login">
              Back to login
            </Link>
            <button
              className={secondaryLinkClass}
              onClick={() => {
                setSent(false);
                setError(null);
              }}
              type="button"
            >
              Send another link
            </button>
          </div>
        </AuthPanel>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ href: '/login', label: 'Login' }, { label: 'Forgot password' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Reset your password</h1>
        <Notice>Enter your account email and we will send you a secure reset link.</Notice>
        <form className="grid gap-2.5" onSubmit={handleSubmit}>
          <input
            autoFocus
            autoComplete="email"
            className={inputClass}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            required
            type="email"
            value={email}
          />
          <ActionButton className={primaryButtonClass} pending={isLoading} pendingLabel="Sending" type="submit">
            Send reset link
          </ActionButton>
        </form>
        <Notice>
          Remembered your password? <Link href="/login">Log in</Link>
        </Notice>
        {error && <Alert>{error}</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}
