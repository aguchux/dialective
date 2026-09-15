'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Building2, Eye, EyeOff, Globe, KeyRound, LockKeyhole, Mail } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { leadsApi, LeadsApiError } from '@/lib/leads-api';
import { AuthShell } from '@/components/AuthShell';
import { AuthPrimaryButton } from '@/components/AuthPrimaryButton';
import { Card, ErrorText, FieldLabel, TextInput } from '@/components/ui';

const authInputClassName =
  'min-h-[46px] rounded-[7px] border-catalogue-line bg-catalogue-bg px-3.5 text-[15px] text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:ring-2 focus:ring-catalogue-blue/25 focus-visible:outline-none';

const fieldLabelClassName =
  '!mb-2 !text-[13px] !font-medium !normal-case !tracking-normal !text-catalogue-ink';

/**
 * Branches on PlatformSettings.streamSelfServeSignupEnabled
 * (GET /voice-stream/settings/public): while off (the default), Stream
 * onboarding stays admin-invite-only and this renders the original
 * lead-capture "Request access" form (see RequestAccessForm below -- same
 * DataAccessLead pipeline the trainer site's /data-access page feeds). While
 * on, it renders a real self-serve signup form that creates the account
 * directly via SubscriberAuthService.register(), no invite required.
 */
export default function RegisterPage() {
  const [selfServeEnabled, setSelfServeEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getPublicSettings()
      .then((settings) => {
        if (!cancelled) setSelfServeEnabled(settings.selfServeSignupEnabled);
      })
      .catch(() => {
        if (!cancelled) setSelfServeEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (selfServeEnabled === null) {
    return (
      <AuthShell>
        <Card className="w-full min-w-0 border-catalogue-line bg-catalogue-surface p-6 shadow-catalogue sm:p-7">
          <div aria-hidden="true" className="grid min-w-0 animate-pulse gap-4">
            <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
            <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
            <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
            <div className="h-[46px] rounded-[7px] bg-catalogue-surface-raised" />
          </div>
        </Card>
      </AuthShell>
    );
  }

  return selfServeEnabled ? <SignupForm /> : <RequestAccessForm />;
}

function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [website, setWebsite] = useState('');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await apiClient.register({
        email,
        password,
        firstName,
        lastName,
        organizationName,
        website: website || undefined,
      });
      setTicket(result.ticket);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create your account right now.');
    } finally {
      setPending(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      // Same NextAuth credentials provider login's OTP step uses -- verifies
      // the code server-side and establishes the actual session (cookies),
      // unlike a raw apiClient.verifyOtp() call, which only returns tokens
      // with nowhere to put them.
      const result = await signIn('otp-verify', { ticket, code, redirect: false });
      if (result?.error) {
        setError('Invalid or expired code.');
        return;
      }
      router.push('/dashboard');
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
            Create your account
          </h1>
          <p className="mt-2 text-[15px] text-catalogue-muted">
            {step === 'details'
              ? 'Set up your organization on Dialect Library Voice Stream'
              : `Enter the code we sent to ${email}`}
          </p>
        </div>
        {step === 'details' ? (
          <form className="grid min-w-0 gap-4" onSubmit={submitDetails}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel className={fieldLabelClassName} htmlFor="first-name">
                  First name
                </FieldLabel>
                <TextInput
                  autoComplete="given-name"
                  className={authInputClassName}
                  id="first-name"
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  value={firstName}
                />
              </div>
              <div>
                <FieldLabel className={fieldLabelClassName} htmlFor="last-name">
                  Last name
                </FieldLabel>
                <TextInput
                  autoComplete="family-name"
                  className={authInputClassName}
                  id="last-name"
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  value={lastName}
                />
              </div>
            </div>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="signup-email">
                Work email
              </FieldLabel>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  autoComplete="email"
                  className={`${authInputClassName} pl-11`}
                  id="signup-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@acme.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="organization-name">
                Company / organization
              </FieldLabel>
              <div className="relative">
                <Building2
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  autoComplete="organization"
                  className={`${authInputClassName} pl-11`}
                  id="organization-name"
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Acme AI Ltd"
                  required
                  value={organizationName}
                />
              </div>
            </div>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="organization-website">
                Website
              </FieldLabel>
              <div className="relative">
                <Globe
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  autoComplete="url"
                  className={`${authInputClassName} pl-11`}
                  id="organization-website"
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://acme.com"
                  type="url"
                  value={website}
                />
              </div>
            </div>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="signup-password">
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
                  id="signup-password"
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
              {pending ? 'Creating account...' : 'Create account'}
            </AuthPrimaryButton>
          </form>
        ) : (
          <form className="grid min-w-0 gap-4" onSubmit={submitOtp}>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="signup-otp">
                Verification code
              </FieldLabel>
              <div className="relative">
                <KeyRound
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  autoComplete="one-time-code"
                  className={`${authInputClassName} pl-11 tracking-[0.24em]`}
                  id="signup-otp"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  value={code}
                />
              </div>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <AuthPrimaryButton disabled={pending} type="submit">
              {pending ? 'Verifying...' : 'Verify and continue'}
            </AuthPrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-catalogue-muted">
        Already have an account?{' '}
        <Link
          className="font-semibold text-catalogue-blue-bright hover:text-catalogue-ink hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function RequestAccessForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await leadsApi.createDataAccessLead({
        firstName,
        lastName,
        email,
        organization,
        website,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof LeadsApiError ? err.message : 'Unable to submit your request.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <Card className="w-full min-w-0 border-catalogue-line bg-catalogue-surface p-6 shadow-catalogue sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="text-[30px] font-extrabold tracking-[-0.035em] text-catalogue-ink sm:text-[32px]">
            Request access
          </h1>
          <p className="mt-2 text-[15px] text-catalogue-muted">
            {submitted
              ? "We've received your request"
              : "Tell us about your organization and we'll follow up about coverage and licensing"}
          </p>
        </div>
        {submitted ? (
          <p
            className="rounded-[7px] border border-success/30 bg-success/10 px-3.5 py-3 text-center text-sm font-bold text-success"
            role="status"
          >
            We&apos;ll reach out at the email you provided to discuss your needs and onboarding.
          </p>
        ) : (
          <form className="grid min-w-0 gap-4" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel className={fieldLabelClassName} htmlFor="ra-first-name">
                  First name
                </FieldLabel>
                <TextInput
                  autoComplete="given-name"
                  className={authInputClassName}
                  id="ra-first-name"
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  value={firstName}
                />
              </div>
              <div>
                <FieldLabel className={fieldLabelClassName} htmlFor="ra-last-name">
                  Last name
                </FieldLabel>
                <TextInput
                  autoComplete="family-name"
                  className={authInputClassName}
                  id="ra-last-name"
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  value={lastName}
                />
              </div>
            </div>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="ra-email">
                Work email
              </FieldLabel>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  autoComplete="email"
                  className={`${authInputClassName} pl-11`}
                  id="ra-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@acme.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="ra-organization">
                Company / organization
              </FieldLabel>
              <div className="relative">
                <Building2
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  autoComplete="organization"
                  className={`${authInputClassName} pl-11`}
                  id="ra-organization"
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Acme AI Ltd"
                  required
                  value={organization}
                />
              </div>
            </div>
            <div>
              <FieldLabel className={fieldLabelClassName} htmlFor="ra-website">
                Website
              </FieldLabel>
              <div className="relative">
                <Globe
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
                />
                <TextInput
                  autoComplete="url"
                  className={`${authInputClassName} pl-11`}
                  id="ra-website"
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://acme.com"
                  required
                  type="url"
                  value={website}
                />
              </div>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <AuthPrimaryButton disabled={pending} type="submit">
              {pending ? 'Submitting request...' : 'Request access'}
            </AuthPrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-catalogue-muted">
        Already have an account?{' '}
        <Link
          className="font-semibold text-catalogue-blue-bright hover:text-catalogue-ink hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
