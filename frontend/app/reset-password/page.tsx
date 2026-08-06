'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { normalizeErrorMessage, useResetPasswordMutation } from '@/store/api';
import { Alert, AuthPage, AuthPanel, Eyebrow, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
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
          <Eyebrow>Dialect Library</Eyebrow>
          <h1 className="text-[1.75rem] leading-tight">Password reset</h1>
          <Notice>Your password has been reset. All existing sessions have been signed out.</Notice>
          <Link className={primaryButtonClass} href="/login">
            Go to login
          </Link>
        </AuthPanel>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ href: '/login', label: 'Login' }, { label: 'Reset password' }]} />
        <div>
          <Eyebrow>Dialect Library</Eyebrow>
          <h1 className="text-[1.75rem] leading-tight">Reset your password</h1>
        </div>
        <form className="grid gap-2.5" onSubmit={handleSubmit}>
          <input
            className={inputClass}
            type="password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className={primaryButtonClass} type="submit" disabled={isLoading}>
            Reset password
          </button>
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
