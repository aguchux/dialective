'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
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
    const result = await signIn('invite-accept', { token, password, redirect: false });
    setPending(false);
    if (result?.error) {
      setError('This invite is invalid or has expired.');
      return;
    }
    router.push('/dashboard');
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
