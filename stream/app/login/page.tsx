'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, ErrorText, FieldLabel, PrimaryButton, TextInput } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await apiClient.login(email, password);
      setTicket(result.ticket);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now.');
    } finally {
      setPending(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await signIn('otp-verify', { ticket, code, redirect: false });
    setPending(false);
    if (result?.error) {
      setError('Invalid or expired code.');
      return;
    }
    router.push('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-accent">Voice Stream</p>
          <h1 className="mt-1 text-2xl font-black text-ink">Sign in</h1>
        </div>
        <Card className="p-6">
          {step === 'credentials' ? (
            <form className="grid gap-4" onSubmit={submitCredentials}>
              <div>
                <FieldLabel>Email</FieldLabel>
                <TextInput
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div>
                <FieldLabel>Password</FieldLabel>
                <TextInput
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              {error && <ErrorText>{error}</ErrorText>}
              <PrimaryButton disabled={pending} type="submit">
                {pending ? 'Signing in...' : 'Continue'}
              </PrimaryButton>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={submitOtp}>
              <p className="text-sm text-muted">
                Enter the 6-digit code we sent to <strong>{email}</strong>.
              </p>
              <div>
                <FieldLabel>Verification code</FieldLabel>
                <TextInput
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  value={code}
                />
              </div>
              {error && <ErrorText>{error}</ErrorText>}
              <PrimaryButton disabled={pending} type="submit">
                {pending ? 'Verifying...' : 'Sign in'}
              </PrimaryButton>
            </form>
          )}
        </Card>
        <p className="mt-6 text-center text-sm text-muted">
          Need an account?{' '}
          <Link className="font-bold text-accent hover:underline" href="/register">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
