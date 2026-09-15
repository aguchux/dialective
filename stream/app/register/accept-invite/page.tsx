'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { AuthPrimaryButton } from '@/components/AuthPrimaryButton';
import { Card, ErrorText, FieldLabel, TextInput } from '@/components/ui';

const authInputClassName =
  'min-h-[46px] rounded-[7px] border-catalogue-line bg-catalogue-bg px-3.5 text-[15px] text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:ring-2 focus:ring-catalogue-blue/25 focus-visible:outline-none';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
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
    <form className="grid min-w-0 gap-4" onSubmit={submit}>
      <div>
        <FieldLabel
          className="!mb-2 !text-[13px] !font-medium !normal-case !tracking-normal !text-catalogue-ink"
          htmlFor="invite-password"
        >
          Password
        </FieldLabel>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
          />
          <TextInput
            autoComplete="new-password"
            className={`${authInputClassName} pl-11 pr-12`}
            id="invite-password"
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            type={passwordVisible ? 'text' : 'password'}
            value={password}
          />
          <button
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-r-[7px] text-catalogue-muted transition-colors hover:text-catalogue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/35"
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
        {pending ? 'Joining...' : 'Accept invite'}
      </AuthPrimaryButton>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <AuthShell>
      <Card className="w-full min-w-0 border-catalogue-line bg-catalogue-surface p-6 shadow-catalogue sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="text-[30px] font-extrabold tracking-[-0.035em] text-catalogue-ink sm:text-[32px]">
            Join your team
          </h1>
          <p className="mt-2 text-[15px] text-catalogue-muted">Set a password to accept your invite</p>
        </div>
        <Suspense
          fallback={
            <div aria-hidden="true" className="grid min-w-0 animate-pulse gap-4">
              <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
              <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
            </div>
          }
        >
          <AcceptInviteForm />
        </Suspense>
      </Card>
    </AuthShell>
  );
}
