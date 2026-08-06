'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { normalizeErrorMessage, useRegisterMutation } from '@/store/api';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [register, { isLoading }] = useRegisterMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await register({ email, password }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Registration failed'));
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
          <button type="submit" disabled={isLoading}>
            Register
          </button>
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
