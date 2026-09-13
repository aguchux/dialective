'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, KeyRound, Lock, LockKeyhole, Mail, X } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';

const inputClassName =
  'min-h-11 w-full rounded-[9px] border border-catalogue-line bg-catalogue-bg px-3.5 text-[14px] text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:ring-2 focus:ring-catalogue-blue/25 focus-visible:outline-none';

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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

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

  return createPortal(
    <div
      aria-labelledby="auth-gate-title"
      aria-modal="true"
      className="stream-catalogue fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 py-8"
      role="dialog"
    >
      <button
        aria-label="Close sign-in dialog"
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div
        className="stream-catalogue-auth-gate relative z-10 w-full max-w-[420px] animate-[auth-gate-in_0.18s_ease-out] rounded-2xl border border-catalogue-line bg-catalogue-surface p-6 shadow-[0_24px_64px_rgba(0,0,0,0.45)] sm:p-7"
        ref={dialogRef}
      >
        <button
          aria-label="Close"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-catalogue-muted transition-colors hover:bg-catalogue-surface-hover hover:text-catalogue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-[18px]" />
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-catalogue-blue/20 text-catalogue-blue-bright ring-1 ring-inset ring-catalogue-blue/40">
            <Lock aria-hidden="true" className="size-5" />
          </div>
          <h2 className="text-lg font-bold text-catalogue-ink sm:text-xl" id="auth-gate-title">
            Sign in required
          </h2>
          <p className="mt-1.5 text-sm text-catalogue-muted">
            {step === 'credentials'
              ? 'This section is only available to signed-in members.'
              : `Enter the code we sent to ${email}`}
          </p>
        </div>

        {step === 'credentials' ? (
          <form className="grid gap-3.5" onSubmit={submitCredentials}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-catalogue-muted" htmlFor="auth-gate-email">
                Work email
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-catalogue-dim"
                />
                <input
                  autoComplete="email"
                  className={`${inputClassName} pl-11`}
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
              <label
                className="mb-1.5 block text-xs font-semibold text-catalogue-muted"
                htmlFor="auth-gate-password"
              >
                Password
              </label>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-catalogue-dim"
                />
                <input
                  autoComplete="current-password"
                  className={`${inputClassName} pl-11 pr-11`}
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
                  className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-catalogue-dim transition-colors hover:text-catalogue-ink"
                  onClick={() => setPasswordVisible((v) => !v)}
                  type="button"
                >
                  {passwordVisible ? (
                    <EyeOff aria-hidden="true" className="size-[17px]" />
                  ) : (
                    <Eye aria-hidden="true" className="size-[17px]" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm font-semibold text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-[9px] bg-catalogue-blue text-sm font-semibold text-white shadow-[0_1px_2px_rgba(13,99,243,0.3)] transition-colors hover:bg-catalogue-blue-bright disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="grid gap-3.5" onSubmit={submitOtp}>
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold text-catalogue-muted"
                htmlFor="auth-gate-code"
              >
                Verification code
              </label>
              <div className="relative">
                <KeyRound
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-catalogue-dim"
                />
                <input
                  autoComplete="one-time-code"
                  className={`${inputClassName} pl-11 tracking-[0.24em]`}
                  id="auth-gate-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value)}
                  ref={firstFieldRef}
                  required
                  value={code}
                />
              </div>
            </div>
            {error && (
              <p className="text-sm font-semibold text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-[9px] bg-catalogue-blue text-sm font-semibold text-white shadow-[0_1px_2px_rgba(13,99,243,0.3)] transition-colors hover:bg-catalogue-blue-bright disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? 'Verifying...' : 'Verify and continue'}
            </button>
            <button
              className="text-center text-xs font-medium text-catalogue-muted transition-colors hover:text-catalogue-ink"
              onClick={() => setStep('credentials')}
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
