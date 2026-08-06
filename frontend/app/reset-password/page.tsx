'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing reset token.');
      return;
    }

    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: 'Reset failed' }));
      setError(body.message ?? 'This reset link is invalid or has expired.');
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
          <button type="submit">Reset password</button>
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
