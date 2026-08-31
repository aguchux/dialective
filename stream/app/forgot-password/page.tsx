'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { Card, ErrorText, FieldLabel, PrimaryButton, TextInput } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiClient.requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send a reset link right now.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your work email and we&apos;ll send you a reset link.
        </p>
      </div>
      <Card className="p-6">
        {submitted ? (
          <p className="text-sm text-ink">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </p>
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
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
            {error && <ErrorText>{error}</ErrorText>}
            <PrimaryButton disabled={pending} type="submit">
              {pending ? 'Sending...' : 'Send reset link'}
            </PrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        <Link className="font-bold text-accent hover:underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
