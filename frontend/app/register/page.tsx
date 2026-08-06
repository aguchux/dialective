'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: 'Registration failed' }));
      setError(body.message ?? 'Registration failed');
      return;
    }

    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      setError('Account created, but automatic sign-in failed. Try logging in.');
    } else {
      window.location.href = '/';
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Dialectiva</p>
          <h1>Create an account</h1>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button type="submit">Register</button>
        </form>

        <p className="notice">
          Already have an account? <Link href="/login">Log in</Link>
        </p>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
