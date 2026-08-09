'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { normalizeErrorMessage, useRequestMagicLinkMutation } from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

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
      const session = await getSession();
      window.location.href = session?.user?.role === 'ADMIN' ? '/admin' : '/dashboard';
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
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Login' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Log in</h1>

        <form className="grid gap-2.5" onSubmit={handleCredentialsSubmit}>
          <input
            className={inputClass}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className={primaryButtonClass} type="submit">
            Log in
          </button>
        </form>

        <div className="grid gap-2">
          <button
            className={secondaryButtonClass}
            onClick={handleMagicLinkSubmit}
            disabled={!email || isRequestingMagicLink}
          >
            Email me a magic link
          </button>
        </div>

        <Notice>
          New to Dialect Library? <Link href="/register">Create an account</Link>
        </Notice>

        {message && <Alert>{message}</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}
