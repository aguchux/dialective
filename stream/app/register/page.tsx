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

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await apiClient.register(
        firstName,
        lastName,
        email,
        password,
        organizationName,
      );
      setTicket(result.ticket);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register right now.');
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
    <AuthShell
      eyebrow={
        <>
          <ShieldCheck aria-hidden="true" className="size-3.5 text-accent" />
          Secure enterprise access
        </>
      }
    >
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">
          {step === 'details' ? 'Create your organization' : 'Verify your email'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {step === 'details'
            ? 'Get started with Dialect Library Stream'
            : `Enter the code we sent to ${email}`}
        </p>
      </div>
      <Card className="p-6">
        {step === 'details' ? (
          <form className="grid gap-4" onSubmit={submitDetails}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>First name</FieldLabel>
                <TextInput onChange={(e) => setFirstName(e.target.value)} required value={firstName} />
              </div>
              <div>
                <FieldLabel>Last name</FieldLabel>
                <TextInput onChange={(e) => setLastName(e.target.value)} required value={lastName} />
              </div>
            </div>
            <div>
              <FieldLabel>Organization name</FieldLabel>
              <TextInput
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Acme AI Ltd"
                required
                value={organizationName}
              />
            </div>
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
              <FieldLabel>Password</FieldLabel>
              <TextInput
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
              />
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <PrimaryButton disabled={pending} type="submit">
              {pending ? 'Creating account...' : 'Create account'}
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
              {pending ? 'Verifying...' : 'Verify and continue'}
            </PrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link className="font-bold text-accent hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
