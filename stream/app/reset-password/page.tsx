'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { AuthPrimaryButton } from '@/components/AuthPrimaryButton';
import { Card, ErrorText, FieldLabel, TextInput } from '@/components/ui';

const authInputClassName =
  'min-h-[46px] rounded-[7px] border-auth-line bg-auth-card px-3.5 text-[15px] text-auth-ink placeholder:text-auth-muted/70 focus:border-auth-accent focus:ring-2 focus:ring-auth-accent/15 focus-visible:outline-none';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiClient.resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to reset your password right now.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return <ErrorText>This reset link is missing its token.</ErrorText>;
  }

  if (done) {
    return (
      <p
        className="rounded-[7px] border border-success/30 bg-success/10 px-3.5 py-3 text-center text-sm font-bold text-success"
        role="status"
      >
        Your password has been reset. Redirecting to sign in...
      </p>
    );
  }

  return (
    <form className="grid min-w-0 gap-4" onSubmit={submit}>
      <div>
        <FieldLabel
          className="!mb-2 !text-[13px] !font-medium !normal-case !tracking-normal !text-auth-ink"
          htmlFor="new-password"
        >
          New password
        </FieldLabel>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-auth-muted"
          />
          <TextInput
            autoComplete="new-password"
            className={`${authInputClassName} pl-11 pr-12`}
            id="new-password"
            minLength={8}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            type={passwordVisible ? 'text' : 'password'}
            value={newPassword}
          />
          <button
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-r-[7px] text-auth-muted transition-colors hover:text-auth-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-accent/35"
            onClick={() => setPasswordVisible((visible) => !visible)}
            type="button"
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" className="size-[18px]" />
            ) : (
              <Eye aria-hidden="true" className="size-[18px]" />
            )}
          </button>
        </div>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <AuthPrimaryButton disabled={pending} type="submit">
        {pending ? 'Resetting...' : 'Reset password'}
      </AuthPrimaryButton>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Card className="w-full min-w-0 border-auth-line bg-auth-card p-6 shadow-auth-card sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="text-[30px] font-extrabold tracking-[-0.035em] text-auth-ink sm:text-[32px]">
            Set a new password
          </h1>
          <p className="mt-2 text-[15px] text-auth-muted">
            Choose a new password for your account
          </p>
        </div>
        <Suspense
          fallback={
            <div aria-hidden="true" className="grid min-w-0 animate-pulse gap-4">
              <div className="h-[46px] rounded-[7px] bg-auth-panel" />
              <div className="h-[46px] rounded-[7px] bg-auth-panel" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
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
