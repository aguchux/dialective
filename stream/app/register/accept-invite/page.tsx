'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { Card, ErrorText, FieldLabel, PrimaryButton, TextInput } from '@/components/ui';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      // Sets the account's password but does NOT sign in -- the subscriber
      // is meant to land on /login next, not skip straight to /dashboard,
      // so onboarding/verification steps have a consistent single entry
      // point regardless of whether someone arrived via invite or a normal
      // return visit.
      await apiClient.acceptInvite(token, password);
      router.push('/login?joined=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'This invite is invalid or has expired.');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return <ErrorText>This invite link is missing its token.</ErrorText>;
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
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
        {pending ? 'Joining...' : 'Accept invite'}
      </PrimaryButton>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">Join your team</h1>
        <p className="mt-1 text-sm text-muted">Set a password to accept your invite.</p>
      </div>
      <Card className="p-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
          <AcceptInviteForm />
        </Suspense>
      </Card>
    </AuthShell>
  );
}
