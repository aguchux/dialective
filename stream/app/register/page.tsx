'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShellHeader } from '@/components/AuthShellHeader';
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
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md">
        <AuthShellHeader title="Create your organization" />
        <Card className="p-6">
          {step === 'details' ? (
            <form className="grid gap-4" onSubmit={submitDetails}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>First name</FieldLabel>
                  <TextInput
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    value={firstName}
                  />
                </div>
                <div>
                  <FieldLabel>Last name</FieldLabel>
                  <TextInput
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    value={lastName}
                  />
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
                  required
                  type="password"
                  value={password}
                />
              </div>
              {error && <ErrorText>{error}</ErrorText>}
              <PrimaryButton disabled={pending} type="submit">
                {pending ? 'Creating account...' : 'Create account'}
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
      </div>
    </main>
  );
}
