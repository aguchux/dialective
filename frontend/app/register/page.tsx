'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Registration itself isn't a NextAuth concept, so this posts to api's
   * register endpoint directly (via the app's own API route proxy would
   * also work; a direct fetch is fine since this runs client-side against
   * a CORS-allowlisted origin — see api's AGENTS.md "API surface"). Once
   * api confirms the account was created, sign in through NextAuth's
   * Credentials provider so the browser gets a normal NextAuth session.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/auth/register`, {
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
      setError('Account created, but automatic sign-in failed — try logging in.');
    } else {
      window.location.href = '/';
    }
  }

  return (
    <main>
      <h1>Create an account</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
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
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
