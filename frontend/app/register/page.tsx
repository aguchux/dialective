'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { normalizeErrorMessage, useRegisterMutation } from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

function RegisterContent() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get('ref') ?? undefined;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [register, { isLoading }] = useRegisterMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await register({ email, password, referralCode }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Registration failed'));
      return;
    }

    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      setError('Account created, but automatic sign-in failed. Try logging in.');
    } else {
      window.location.href = '/dashboard';
    }
  }

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Register' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Create an account</h1>

        <form className="grid gap-2.5" onSubmit={handleSubmit}>
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
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className={primaryButtonClass} type="submit" disabled={isLoading}>
            Register
          </button>
        </form>

        <Notice>
          Already have an account? <Link href="/login">Log in</Link>
        </Notice>

        {error && <Alert>{error}</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPage>Loading...</AuthPage>}>
      <RegisterContent />
    </Suspense>
  );
}
