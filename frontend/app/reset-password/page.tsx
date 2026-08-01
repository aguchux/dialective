'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing reset token.');
      return;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/auth/password-reset/confirm`, {
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
      <main>
        <h1>Password reset</h1>
        <p>Your password has been reset. All existing sessions have been signed out — log in again below.</p>
        <a href="/login">Go to login</a>
      </main>
    );
  }

  return (
    <main>
      <h1>Reset your password</h1>
      <form onSubmit={handleSubmit}>
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
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main>Loading…</main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
