'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      setError('Invalid email or password');
    } else {
      window.location.href = '/';
    }
  }

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // api owns magic-link issuance end-to-end (AGENTS.md "Authentication") --
    // no NextAuth provider involved until the emailed link is clicked.
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/auth/magic-link/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setError('Check your email for a magic link.');
  }

  return (
    <main>
      <h1>Log in</h1>

      <form onSubmit={handleCredentialsSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Log in</button>
      </form>

      <button onClick={handleMagicLinkSubmit}>Email me a magic link instead</button>

      <button onClick={() => signIn('google')}>Continue with Google</button>

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
