'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { Card, ErrorText, FieldLabel, PrimaryButton, TextInput } from '@/components/ui';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
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
    return <p className="text-sm text-ink">Your password has been reset. Redirecting to sign in...</p>;
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div>
        <FieldLabel>New password</FieldLabel>
        <TextInput
          minLength={8}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
          type="password"
          value={newPassword}
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <PrimaryButton disabled={pending} type="submit">
        {pending ? 'Resetting...' : 'Reset password'}
      </PrimaryButton>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">Choose a new password for your account.</p>
      </div>
      <Card className="p-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        <Link className="font-bold text-accent hover:underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
