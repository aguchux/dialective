'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { AuthPrimaryButton } from '@/components/AuthPrimaryButton';
import { Card, ErrorText, FieldLabel, TextInput } from '@/components/ui';

const authInputClassName =
  'min-h-[46px] rounded-[7px] border-auth-line bg-auth-card px-3.5 text-[15px] text-auth-ink placeholder:text-auth-muted/70 focus:border-auth-accent focus:ring-2 focus:ring-auth-accent/15 focus-visible:outline-none';

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
      <Card className="w-full min-w-0 border-auth-line bg-auth-card p-6 shadow-auth-card sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="text-[30px] font-extrabold tracking-[-0.035em] text-auth-ink sm:text-[32px]">
            Reset your password
          </h1>
          <p className="mt-2 text-[15px] text-auth-muted">
            {submitted
              ? "We've sent a reset link to your inbox"
              : "Enter your work email and we'll send you a reset link"}
          </p>
        </div>
        {submitted ? (
          <p
            className="rounded-[7px] border border-success/30 bg-success/10 px-3.5 py-3 text-center text-sm font-bold text-success"
            role="status"
          >
            If an account exists for <span className="font-extrabold">{email}</span>, a reset
            link is on its way.
          </p>
        ) : (
          <form className="grid min-w-0 gap-4" onSubmit={submit}>
            <div>
              <FieldLabel
                className="!mb-2 !text-[13px] !font-medium !normal-case !tracking-normal !text-auth-ink"
                htmlFor="reset-email"
              >
                Work email
              </FieldLabel>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-auth-muted"
                />
                <TextInput
                  aria-label="Work email"
                  autoComplete="email"
                  autoFocus
                  className={`${authInputClassName} pl-11`}
                  id="reset-email"
                  name="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@acme.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <AuthPrimaryButton disabled={pending} type="submit">
              {pending ? 'Sending...' : 'Send reset link'}
            </AuthPrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-auth-muted">
        <Link
          className="font-semibold text-auth-accent hover:text-auth-accent-dark hover:underline"
          href="/login"
        >
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
