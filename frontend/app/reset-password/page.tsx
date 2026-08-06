'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { normalizeErrorMessage, useResetPasswordMutation } from '@/store/api';

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
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Dialectiva</p>
          <h1>Password reset</h1>
          <p className="notice">Your password has been reset. All existing sessions have been signed out.</p>
          <Link className="button" href="/login">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Dialectiva</p>
          <h1>Reset your password</h1>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button type="submit" disabled={isLoading}>
            Reset password
          </button>
        </form>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-page">Loading...</main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
