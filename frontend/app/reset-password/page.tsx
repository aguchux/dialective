'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { normalizeErrorMessage, useResetPasswordMutation } from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resetPassword, { isLoading }] = useResetPasswordMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing reset token.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      await resetPassword({ token, newPassword: password }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'This reset link is invalid or has expired.'));
      return;
    }

    setStatus('success');
  }

  if (status === 'success') {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ href: '/login', label: 'Login' }, { label: 'Password reset' }]} />
          <h1 className="text-center text-[1.75rem] leading-tight">Password reset</h1>
          <Notice>Your password has been reset. All existing sessions have been signed out.</Notice>
          <Link className={primaryButtonClass} href="/login">
            Go to login
          </Link>
        </AuthPanel>
      </AuthPage>
    );
  }

  if (!token) {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ href: '/login', label: 'Login' }, { label: 'Reset password' }]} />
          <h1 className="text-center text-[1.75rem] leading-tight">Reset link missing</h1>
          <Alert>This password reset link is missing its token. Request a new reset link to continue.</Alert>
          <Link className={primaryButtonClass} href="/forgot-password">
            Request reset link
          </Link>
        </AuthPanel>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ href: '/login', label: 'Login' }, { label: 'Reset password' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Reset your password</h1>
        <form className="grid gap-2.5" onSubmit={handleSubmit}>
          <input
            autoComplete="new-password"
            className={inputClass}
            type="password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <input
            autoComplete="new-password"
            className={inputClass}
            minLength={8}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            required
            type="password"
            value={confirmPassword}
          />
          <ActionButton className={primaryButtonClass} type="submit" pending={isLoading} pendingLabel="Resetting">
            Reset password
          </ActionButton>
        </form>
        {error && <Alert>{error}</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPage>Loading...</AuthPage>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
