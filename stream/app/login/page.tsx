'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
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
    <AuthShell eyebrow={<ShieldEyebrow />}>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          {step === 'credentials'
            ? 'Sign in to access Dialect Library Stream'
            : `Enter the code we sent to ${email}`}
        </p>
      </div>
      <Card className="p-6">
        {step === 'credentials' ? (
          <form className="grid gap-4" onSubmit={submitCredentials}>
            <div>
              <FieldLabel>Work email</FieldLabel>
              <TextInput
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@acme.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <FieldLabel>Password</FieldLabel>
                <Link className="text-xs font-bold text-accent hover:underline" href="/forgot-password">
                  Forgot password?
                </Link>
              </div>
              <TextInput
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <PrimaryButton disabled={pending} type="submit">
              {pending ? 'Signing in...' : 'Sign in'}
            </PrimaryButton>

            <div className="relative my-1 text-center">
              <div className="absolute inset-x-0 top-1/2 border-t border-line" />
              <span className="relative bg-surface px-3 text-xs font-bold uppercase text-muted">or</span>
            </div>

            <SocialAuthButtons />
          </form>
        ) : (
          <form className="grid gap-4" onSubmit={submitOtp}>
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
        Don&apos;t have an account?{' '}
        <Link className="font-bold text-accent hover:underline" href="/register">
          Request access
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted">
        By signing in, you agree to our{' '}
        <a className="text-accent hover:underline" href="/terms">
          Terms of Service
        </a>{' '}
        and{' '}
        <a className="text-accent hover:underline" href="/privacy">
          Privacy Policy
        </a>
        .
      </p>
    </AuthShell>
  );
}

function ShieldEyebrow() {
  return (
    <>
      <ShieldCheck aria-hidden="true" className="size-3.5 text-accent" />
      Secure enterprise access
    </>
  );
}
