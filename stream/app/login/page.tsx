'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthShell } from '@/components/AuthShell';
import { AuthPrimaryButton } from '@/components/AuthPrimaryButton';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import { OtpInput } from '@/components/OtpInput';
import { Card, ErrorText, FieldLabel, TextInput } from '@/components/ui';

const authInputClassName =
  'min-h-[46px] rounded-[7px] border-catalogue-line bg-catalogue-bg px-3.5 text-[15px] text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:ring-2 focus:ring-catalogue-blue/25 focus-visible:outline-none';

const otpDigitClassName =
  'min-h-[52px] w-full min-w-0 rounded-[7px] border border-catalogue-line bg-catalogue-bg text-center text-xl font-bold text-catalogue-ink focus:border-catalogue-blue focus:ring-2 focus:ring-catalogue-blue/25 focus-visible:outline-none';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justJoined = searchParams.get('joined') === '1';
  const sessionExpired = searchParams.get('reason') === 'session-expired';
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

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
      // Only follow a same-origin relative path -- middleware.ts sets this
      // to the dashboard route that redirected here. Reject "//evil.com"
      // (browser-parsed as protocol-relative, not a path) alongside any
      // absolute URL, so this can't be used as an open redirect.
      const callbackUrl = searchParams.get('callbackUrl');
      const safeCallbackUrl =
        callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
          ? callbackUrl
          : '/dashboard';
      router.push(safeCallbackUrl);
    } catch {
      setError('Unable to verify this code right now. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <Card className="w-full min-w-0 border-catalogue-line bg-catalogue-surface p-6 shadow-catalogue sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="text-[30px] font-extrabold tracking-[-0.035em] text-catalogue-ink sm:text-[32px]">
            Welcome back
          </h1>
          <p className="mt-2 text-[15px] text-catalogue-muted">
            {step === 'credentials'
              ? 'Sign in to access Dialect Library Stream'
              : `Enter the code we sent to ${email}`}
          </p>
        </div>
        {justJoined && step === 'credentials' && (
          <p
            className="mb-5 rounded-[7px] border border-success/30 bg-success/10 px-3 py-2 text-center text-sm font-bold text-success"
            role="status"
          >
            Your account is ready. Sign in to continue.
          </p>
        )}
        {sessionExpired && step === 'credentials' && (
          <p
            className="mb-5 rounded-[7px] border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-center text-sm font-bold text-amber-700"
            role="status"
          >
            Your session expired. Please sign in again.
          </p>
        )}
        {step === 'credentials' ? (
          <form className="grid min-w-0 gap-4" onSubmit={submitCredentials}>
            <div>
              <FieldLabel
                className="!mb-2 !text-[13px] !font-medium !normal-case !tracking-normal !text-catalogue-ink"
                htmlFor="work-email"
              >
                Work email
              </FieldLabel>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  aria-label="Work email"
                  autoComplete="email"
                  className={`${authInputClassName} pl-11`}
                  id="work-email"
                  name="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@acme.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <FieldLabel
                  className="!mb-0 !text-[13px] !font-medium !normal-case !tracking-normal !text-catalogue-ink"
                  htmlFor="work-password"
                >
                  Password
                </FieldLabel>
                <Link
                  className="shrink-0 text-xs font-semibold text-catalogue-blue-bright transition-colors hover:text-catalogue-ink hover:underline"
                  href="/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  aria-label="Password"
                  autoComplete="current-password"
                  className={`${authInputClassName} pl-11 pr-12`}
                  id="work-password"
                  name="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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
            <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-catalogue-muted">
              <label className="inline-flex min-h-11 items-center gap-2">
                <input
                  className="size-4 rounded border-catalogue-line accent-catalogue-blue"
                  defaultChecked
                  type="checkbox"
                />
                <span>Remember me</span>
              </label>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <AuthPrimaryButton disabled={pending} type="submit">
              {pending ? 'Signing in...' : 'Sign in'}
            </AuthPrimaryButton>

            <div
              aria-label="Other sign-in options"
              className="flex items-center gap-3 text-center"
              role="separator"
            >
              <span aria-hidden="true" className="h-px flex-1 bg-catalogue-line" />
              <span className="shrink-0 text-xs font-medium lowercase text-catalogue-muted">
                or
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-catalogue-line" />
            </div>

            <SocialAuthButtons />
          </form>
        ) : (
          <form className="grid min-w-0 gap-4" onSubmit={submitOtp}>
            <div>
              <FieldLabel
                className="!mb-2 !text-[13px] !font-medium !normal-case !tracking-normal !text-catalogue-ink"
                htmlFor="verification-code"
              >
                Verification code
              </FieldLabel>
              <OtpInput
                className={otpDigitClassName}
                id="verification-code"
                onChange={setCode}
                value={code}
              />
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <AuthPrimaryButton disabled={pending || code.length < 6} type="submit">
              {pending ? 'Verifying...' : 'Sign in'}
            </AuthPrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-catalogue-muted">
        Don&apos;t have an account?{' '}
        <Link
          className="font-semibold text-catalogue-blue-bright hover:text-catalogue-ink hover:underline"
          href="/register"
        >
          Request access
        </Link>
      </p>
      <p className="mt-4 text-center text-xs leading-relaxed text-catalogue-muted">
        By signing in, you agree to our{' '}
        <a
          className="text-catalogue-blue-bright hover:text-catalogue-ink hover:underline"
          href="/terms"
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          className="text-catalogue-blue-bright hover:text-catalogue-ink hover:underline"
          href="/privacy"
        >
          Privacy Policy
        </a>
        .
      </p>
    </AuthShell>
  );
}

function LoginFormSkeleton() {
  return (
    <AuthShell>
      <Card className="w-full min-w-0 border-catalogue-line bg-catalogue-surface p-6 shadow-catalogue sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="text-[30px] font-extrabold tracking-[-0.035em] text-catalogue-ink sm:text-[32px]">
            Welcome back
          </h1>
          <p className="mt-2 text-[15px] text-catalogue-muted">
            Sign in to access Dialect Library Stream
          </p>
        </div>
        <div aria-hidden="true" className="grid min-w-0 animate-pulse gap-4">
          <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
          <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
          <div className="h-4 w-24 rounded bg-catalogue-surface-raised" />
          <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-catalogue-line" />
            <span className="shrink-0 text-xs font-medium lowercase text-catalogue-muted">or</span>
            <span className="h-px flex-1 bg-catalogue-line" />
          </div>
          <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
          <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
        </div>
      </Card>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
