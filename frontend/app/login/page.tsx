'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { normalizeErrorMessage, useRequestMagicLinkMutation } from '@/store/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [requestMagicLink, { isLoading: isRequestingMagicLink }] = useRequestMagicLinkMutation();

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      setMessage('Invalid email or password.');
    } else {
      window.location.href = '/';
    }
  }

  async function handleMagicLinkSubmit() {
    setMessage(null);
    try {
      await requestMagicLink({ email }).unwrap();
      setMessage('Check your email for a magic link.');
    } catch (err) {
      setMessage(normalizeErrorMessage(err, 'Unable to send a magic link.'));
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Dialectiva</p>
          <h1>Log in</h1>
        </div>

        <form className="auth-form" onSubmit={handleCredentialsSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Log in</button>
        </form>

        <div className="auth-actions">
          <button className="secondary" onClick={handleMagicLinkSubmit} disabled={!email || isRequestingMagicLink}>
            Email me a magic link
          </button>
          <button className="secondary" onClick={() => signIn('google')}>
            Continue with Google
          </button>
        </div>

        <p className="notice">
          New to Dialectiva? <Link href="/register">Create an account</Link>
        </p>

        {message && (
          <p className="alert" role="alert">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
