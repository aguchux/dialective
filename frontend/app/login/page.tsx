'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, signIn, useSession } from 'next-auth/react';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  normalizeErrorMessage,
  useGetPublicClientSettingsQuery,
  useRequestMagicLinkMutation,
} from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { AuthMaintenanceNotice } from '@/components/AuthMaintenanceNotice';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { postAuthPath } from '@/lib/role-home';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

function authDestination(role: string | undefined, onboardingComplete: boolean | undefined) {
  const callbackUrl =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('callbackUrl');
  return postAuthPath(role, onboardingComplete, callbackUrl);
}

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: publicSettings } = useGetPublicClientSettingsQuery();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [requestMagicLink, { isLoading: isRequestingMagicLink }] = useRequestMagicLinkMutation();

  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Set by AuthMaintenanceSessionHandler (app/providers.tsx) redirecting
  // here after a forced sign-out mid-session -- lets this page show the
  // same countdown notice a fresh visitor sees, even in the moment before
  // publicSettings has refetched with authMaintenanceBlocksLogin=true (a
  // session-only block can be on while login itself stays open).
  const [forcedMaintenance, setForcedMaintenance] = useState<{
    until: string | null;
    message: string | null;
  } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'maintenance') {
      setForcedMaintenance({ until: params.get('until'), message: params.get('message') });
    }
    // Set by proxy.ts when the JWT's idle timeout or absolute session
    // ceiling is exceeded (PlatformSettings.sessionIdleTimeoutMinutes/
    // sessionMaxHours) -- distinct from a plain expired-refresh-token
    // sign-out, which redirects here with no reason at all.
    if (params.get('reason') === 'idle') {
      setMessage('You were signed out after a period of inactivity. Please log in again.');
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(authDestination(session.user?.role, session.user?.onboardingComplete));
    }
  }, [status, session, router]);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsLoggingIn(true);
    try {
      const pending = await apiClient.login(email, password);
      setTicket(pending.ticket);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setMessage('Login just went into scheduled maintenance. Please refresh the page.');
      } else {
        setMessage(
          err instanceof ApiError
            ? err.status === 401
              ? 'Invalid email or password.'
              : err.message
            : normalizeErrorMessage(err, 'Unable to log in.'),
        );
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    setMessage(null);
    setIsVerifying(true);
    try {
      const result = await signIn('otp-verify', { ticket, code, redirect: false });
      if (result?.error) {
        setMessage('Invalid or expired code.');
      } else {
        const freshSession = await getSession();
        window.location.href = authDestination(
          freshSession?.user?.role,
          freshSession?.user?.onboardingComplete,
        );
      }
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (!ticket) return;
    setMessage(null);
    setIsResending(true);
    try {
      await apiClient.resendOtp(ticket);
      setMessage('A new code has been sent.');
    } catch (err) {
      setMessage(normalizeErrorMessage(err, 'Unable to resend the code.'));
    } finally {
      setIsResending(false);
    }
  }

  async function handleMagicLinkSubmit() {
    setMessage(null);
    try {
      await requestMagicLink({ email }).unwrap();
      setMessage('Check your email for a magic link.');
    } catch (err) {
      setMessage(normalizeErrorMessage(err, 'Unable to send a magic link.'));
    }
  }

  if (status === 'loading' || status === 'authenticated') {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Login' }]} />
          <p className="text-center text-muted">Loading...</p>
        </AuthPanel>
      </AuthPage>
    );
  }

  if (publicSettings?.authMaintenanceBlocksLogin || forcedMaintenance) {
    const until = forcedMaintenance?.until ?? publicSettings?.authMaintenanceUntil ?? null;
    const note = forcedMaintenance?.message ?? publicSettings?.authMaintenanceMessage ?? null;
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Login' }]} />
          <AuthMaintenanceNotice until={until} note={note} />
        </AuthPanel>
      </AuthPage>
    );
  }

  if (ticket) {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Login' }]} />
          <h1 className="text-center text-[1.75rem] leading-tight">Enter your code</h1>
          <p className="text-center text-sm text-muted">
            We sent a 6-digit code to {email}. It expires in 10 minutes.
          </p>

          <form className="grid gap-2.5" onSubmit={handleOtpSubmit}>
            <input
              autoFocus
              className={`${inputClass} text-center text-lg font-bold tracking-[0.3em]`}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              pattern="\d{6}"
              placeholder="000000"
              required
              value={code}
            />
            <ActionButton
              className={primaryButtonClass}
              disabled={code.length !== 6}
              pending={isVerifying}
              pendingLabel="Verifying"
              type="submit"
            >
              Verify
            </ActionButton>
          </form>

          <div className="grid gap-2">
            <ActionButton
              className={secondaryButtonClass}
              onClick={handleResend}
              pending={isResending}
              pendingLabel="Sending"
            >
              Resend code
            </ActionButton>
            <button
              className="text-sm font-bold text-muted underline"
              onClick={() => {
                setTicket(null);
                setCode('');
                setMessage(null);
              }}
              type="button"
            >
              Use a different account
            </button>
          </div>

          {message && <Alert>{message}</Alert>}
        </AuthPanel>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Login' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Log in</h1>

        <form className="grid gap-2.5" onSubmit={handleCredentialsSubmit}>
          <input
            autoComplete="email"
            className={inputClass}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            autoComplete="current-password"
            className={inputClass}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Link
            className="justify-self-end text-sm font-bold text-accent hover:text-accent-dark"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
          <ActionButton
            className={primaryButtonClass}
            type="submit"
            pending={isLoggingIn}
            pendingLabel="Logging in"
          >
            Log in
          </ActionButton>
        </form>

        <div className="grid gap-2">
          <ActionButton
            className={secondaryButtonClass}
            onClick={handleMagicLinkSubmit}
            disabled={!email || isRequestingMagicLink}
            pending={isRequestingMagicLink}
            pendingLabel="Sending link"
          >
            Email me a magic link
          </ActionButton>
        </div>

        <Notice>
          New to Dialect Library? <Link href="/register">Create an account</Link>
        </Notice>

        {message && <Alert>{message}</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}
