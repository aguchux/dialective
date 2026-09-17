'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, Lock, LockKeyhole, Mail, X } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { OtpInput } from '@/components/OtpInput';

const inputClassName =
  'min-h-9 w-full border border-catalogue-line bg-catalogue-bg px-3 text-[13px] text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:ring-2 focus:ring-catalogue-blue/25 focus-visible:outline-none';

const socialButtonClassName =
  'inline-flex min-h-9 w-full items-center justify-center gap-2 border border-catalogue-line bg-catalogue-bg text-[13px] font-medium text-catalogue-ink transition-colors hover:bg-catalogue-surface-hover disabled:cursor-not-allowed disabled:opacity-100';

export function AuthGateDialog({
  onClose,
  onSuccess,
  open,
}: {
  onClose: () => void;
  onSuccess: () => void;
  open: boolean;
}) {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep('credentials');
    setEmail('');
    setPassword('');
    setTicket('');
    setCode('');
    setError(null);
    setPending(false);
    setPasswordVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    // Deliberately no Escape-key or outside-click handler here: this dialog
    // gates protected routes, and closing it any way other than the
    // explicit close button makes it too easy to dismiss by accident and
    // land on a page the user isn't signed in to see.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await apiClient.login(email, password);
      setTicket(result.ticket);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now.');
    } finally {
      setPending(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signIn('otp-verify', { ticket, code, redirect: false });
      if (result?.error) {
        setError('Invalid or expired code.');
        return;
      }
      onSuccess();
    } catch {
      setError('Unable to verify this code right now. Please try again.');
    } finally {
      setPending(false);
    }
  }

  // Clears the credentials/ticket from the completed login attempt, not
  // just the visible step -- otherwise "Use a different account" reopens
  // the credentials form pre-filled with the same email/password (and an
  // orphaned ticket), so submitting again requests a fresh OTP for the
  // *same* account instead of actually letting someone switch accounts.
  function useDifferentAccount() {
    setStep('credentials');
    setEmail('');
    setPassword('');
    setTicket('');
    setCode('');
    setError(null);
    setPasswordVisible(false);
  }

  return createPortal(
    <div
      aria-labelledby="auth-gate-title"
      aria-modal="true"
      className="stream-catalogue fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 py-8"
      role="dialog"
    >
      <div aria-hidden="true" className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="stream-catalogue-auth-gate relative z-10 w-full max-w-[360px] animate-[auth-gate-in_0.18s_ease-out] border border-catalogue-line bg-catalogue-surface p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
        ref={dialogRef}
      >
        <button
          aria-label="Close"
          className="absolute right-3 top-3 grid size-7 place-items-center text-catalogue-muted transition-colors hover:bg-catalogue-surface-hover hover:text-catalogue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>

        <div className="mb-4 text-center">
          <div className="mx-auto mb-2.5 grid size-9 place-items-center bg-catalogue-blue/20 text-catalogue-blue-bright ring-1 ring-inset ring-catalogue-blue/40">
            <Lock aria-hidden="true" className="size-4" />
          </div>
          <h2 className="text-base font-bold text-catalogue-ink" id="auth-gate-title">
            Sign in required
          </h2>
          <p className="mt-1 text-xs text-catalogue-muted">
            {step === 'credentials'
              ? 'This section is only available to signed-in members.'
              : `Enter the code we sent to ${email}`}
          </p>
        </div>

        {step === 'credentials' ? (
          <form className="grid gap-2.5" onSubmit={submitCredentials}>
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold text-catalogue-muted"
                htmlFor="auth-gate-email"
              >
                Work email
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-catalogue-dim"
                />
                <input
                  autoComplete="email"
                  className={`${inputClassName} pl-9`}
                  id="auth-gate-email"
                  name="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@acme.com"
                  ref={firstFieldRef}
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  className="block text-[11px] font-semibold text-catalogue-muted"
                  htmlFor="auth-gate-password"
                >
                  Password
                </label>
                <Link
                  className="shrink-0 text-[11px] font-semibold text-catalogue-blue-bright transition-colors hover:text-catalogue-ink"
                  href="/forgot-password"
                  onClick={onClose}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-catalogue-dim"
                />
                <input
                  autoComplete="current-password"
                  className={`${inputClassName} pl-9 pr-9`}
                  id="auth-gate-password"
                  name="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-catalogue-dim transition-colors hover:text-catalogue-ink"
                  onClick={() => setPasswordVisible((v) => !v)}
                  type="button"
                >
                  {passwordVisible ? (
                    <EyeOff aria-hidden="true" className="size-[15px]" />
                  ) : (
                    <Eye aria-hidden="true" className="size-[15px]" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-xs font-semibold text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              className="mt-0.5 inline-flex min-h-9 w-full items-center justify-center bg-catalogue-blue text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(13,99,243,0.3)] transition-colors hover:bg-catalogue-blue-bright disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? 'Signing in...' : 'Sign in'}
            </button>

            <div aria-hidden="true" className="my-0.5 flex items-center gap-2.5">
              <span className="h-px flex-1 bg-catalogue-line" />
              <span className="shrink-0 text-[10px] font-medium lowercase text-catalogue-dim">
                or
              </span>
              <span className="h-px flex-1 bg-catalogue-line" />
            </div>

            <div className="grid gap-1.5">
              <button
                aria-describedby="auth-gate-social-note"
                className={socialButtonClassName}
                disabled
                title="Coming soon"
                type="button"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <button
                aria-describedby="auth-gate-social-note"
                className={socialButtonClassName}
                disabled
                title="Coming soon"
                type="button"
              >
                <GithubIcon />
                Continue with GitHub
              </button>
              <span className="sr-only" id="auth-gate-social-note">
                Social sign-in is coming soon.
              </span>
            </div>

            <p className="mt-1 text-center text-[11px] text-catalogue-muted">
              Don&apos;t have an account?{' '}
              <Link
                className="font-semibold text-catalogue-blue-bright hover:text-catalogue-ink"
                href="/register"
                onClick={onClose}
              >
                Request access
              </Link>
            </p>
          </form>
        ) : (
          <form className="grid gap-2.5" onSubmit={submitOtp}>
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold text-catalogue-muted"
                htmlFor="auth-gate-code"
              >
                Verification code
              </label>
              <OtpInput
                autoFocus={step === 'otp'}
                className={`${inputClassName} min-h-9 text-center text-base font-bold`}
                id="auth-gate-code"
                onChange={setCode}
                value={code}
              />
            </div>
            {error && (
              <p className="text-xs font-semibold text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              className="mt-0.5 inline-flex min-h-9 w-full items-center justify-center bg-catalogue-blue text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(13,99,243,0.3)] transition-colors hover:bg-catalogue-blue-bright disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending || code.length < 6}
              type="submit"
            >
              {pending ? 'Verifying...' : 'Verify and continue'}
            </button>
            <button
              className="text-center text-[11px] font-medium text-catalogue-muted transition-colors hover:text-catalogue-ink"
              onClick={useDifferentAccount}
              type="button"
            >
              Use a different account
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.85Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.85C6.71 7.3 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
