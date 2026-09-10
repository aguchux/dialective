'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { leadsApi, LeadsApiError } from '@/lib/leads-api';
import { AuthShell } from '@/components/AuthShell';
import { Card, ErrorText, FieldLabel, PrimaryButton, TextInput } from '@/components/ui';

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
        <Card className="p-6">
          <p className="text-sm text-muted">Loading...</p>
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
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          {step === 'details'
            ? 'Set up your organization on Dialect Library Voice Stream.'
            : `Enter the code we sent to ${email}`}
        </p>
      </div>
      <Card className="p-6">
        {step === 'details' ? (
          <form className="grid gap-3" onSubmit={submitDetails}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>First name</FieldLabel>
                <TextInput
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  value={firstName}
                />
              </div>
              <div>
                <FieldLabel>Last name</FieldLabel>
                <TextInput onChange={(e) => setLastName(e.target.value)} required value={lastName} />
              </div>
            </div>
            <div>
              <FieldLabel>Work email</FieldLabel>
              <TextInput
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@acme.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div>
              <FieldLabel>Company / organization</FieldLabel>
              <TextInput
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Acme AI Ltd"
                required
                value={organizationName}
              />
            </div>
            <div>
              <FieldLabel>Website</FieldLabel>
              <TextInput
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://acme.com"
                type="url"
                value={website}
              />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <div className="relative">
                <TextInput
                  className="pr-11"
                  minLength={8}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 grid h-10 w-11 place-items-center text-muted transition-colors hover:text-ink"
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
            <PrimaryButton disabled={pending} type="submit">
              {pending ? 'Creating account...' : 'Create account'}
            </PrimaryButton>
          </form>
        ) : (
          <form className="grid gap-4" onSubmit={submitOtp}>
            <div>
              <FieldLabel>Verification code</FieldLabel>
              <TextInput
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value)}
                required
                value={code}
              />
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <PrimaryButton disabled={pending} type="submit">
              {pending ? 'Verifying...' : 'Verify and continue'}
            </PrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link className="font-bold text-accent hover:underline" href="/login">
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
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">Request access</h1>
        <p className="mt-1 text-sm text-muted">
          Tell us about your organization and we&apos;ll follow up about coverage and licensing.
        </p>
      </div>
      <Card className="p-6">
        {submitted ? (
          <div className="grid gap-2 text-center">
            <p className="text-sm font-bold text-ink">Thanks — request received</p>
            <p className="text-sm text-muted">
              We&apos;ll reach out at the email you provided to discuss your needs and onboarding.
            </p>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>First name</FieldLabel>
                <TextInput
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  value={firstName}
                />
              </div>
              <div>
                <FieldLabel>Last name</FieldLabel>
                <TextInput
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  value={lastName}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Work email</FieldLabel>
              <TextInput
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@acme.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div>
              <FieldLabel>Company / organization</FieldLabel>
              <TextInput
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Acme AI Ltd"
                required
                value={organization}
              />
            </div>
            <div>
              <FieldLabel>Website</FieldLabel>
              <TextInput
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://acme.com"
                required
                type="url"
                value={website}
              />
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <PrimaryButton disabled={pending} type="submit">
              {pending ? 'Submitting request...' : 'Request access'}
            </PrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link className="font-bold text-accent hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
