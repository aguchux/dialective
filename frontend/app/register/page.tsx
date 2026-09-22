'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession, signIn, useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api-client';
import {
  normalizeErrorMessage,
  useGetPublicClientSettingsQuery,
  useRegisterMutation,
} from '@/store/api';
import { Alert, AuthPage, AuthPanel, Notice } from '@/components/AuthShell';
import { AuthMaintenanceNotice } from '@/components/AuthMaintenanceNotice';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { postAuthPath } from '@/lib/role-home';
import { ActionButton } from '@/components/ui/ActionButton';
import { PasswordRequirementsList } from '@/components/ui/PasswordRequirementsList';
import { isStrongPassword } from '@/lib/password-strength';
import {
  clearReferralCookie,
  clearMarketingCampaignCookie,
  DEFAULT_REFERRAL_COOKIE_MAX_AGE_SECONDS,
  normalizeMarketingCampaignId,
  normalizeReferralCode,
  readMarketingCampaignCookie,
  readReferralCookie,
  writeMarketingCampaignCookie,
  writeReferralCookie,
} from '@/lib/referral-cookie';

const inputClass =
  'min-h-10 min-w-0 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

function RegisterContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = normalizeReferralCode(searchParams.get('ref'));
  const campaignShareId = normalizeMarketingCampaignId(searchParams.get('campaign'));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [register] = useRegisterMutation();

  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const { data: publicClientSettings } = useGetPublicClientSettingsQuery();

  const referralCookieMaxAgeSeconds =
    publicClientSettings?.referralCookiePersistSeconds &&
    publicClientSettings.referralCookiePersistSeconds > 0
      ? publicClientSettings.referralCookiePersistSeconds
      : DEFAULT_REFERRAL_COOKIE_MAX_AGE_SECONDS;

  useEffect(() => {
    if (status === 'authenticated') {
      // postAuthPath may return an absolute URL (community.dialectlibrary
      // .com sends people here to sign up and expects them back), and
      // router.replace cannot leave this origin -- so hand those to the
      // browser instead.
      const destination = postAuthPath(
        session.user?.role,
        session.user?.onboardingComplete,
        searchParams.get('callbackUrl'),
      );
      if (/^https?:\/\//i.test(destination)) {
        window.location.href = destination;
      } else {
        router.replace(destination);
      }
    }
  }, [status, session, router, searchParams]);

  useEffect(() => {
    if (!referralCode) return;
    // Re-fires once more when publicClientSettings resolves after this
    // page's first paint (max-age jumps from the client default to the
    // admin-configured value) -- writing again with the real value is
    // cheap and correct (Max-Age always wins over whatever was set
    // before), so no ref-guard needed to suppress the second write.
    writeReferralCookie(referralCode, referralCookieMaxAgeSeconds);
  }, [referralCode, referralCookieMaxAgeSeconds]);

  useEffect(() => {
    if (!campaignShareId) return;
    writeMarketingCampaignCookie(campaignShareId, referralCookieMaxAgeSeconds);
  }, [campaignShareId, referralCookieMaxAgeSeconds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const effectiveReferralCode = referralCode ?? readReferralCookie();
      const effectiveCampaignShareId = campaignShareId ?? readMarketingCampaignCookie();
      const pending = await register({
        firstName,
        lastName,
        email,
        password,
        referralCode: effectiveReferralCode,
        campaignShareId: effectiveCampaignShareId,
      }).unwrap();
      setTicket(pending.ticket);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 503) {
        setError('Signup just went into scheduled maintenance. Please refresh the page.');
      } else {
        setError(normalizeErrorMessage(err, 'Registration failed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    setError(null);
    setIsVerifying(true);
    try {
      const result = await signIn('otp-verify', { ticket, code, redirect: false });
      if (result?.error) {
        setError('Invalid or expired code.');
      } else {
        clearReferralCookie();
        clearMarketingCampaignCookie();
        const freshSession = await getSession();
        window.location.href = postAuthPath(
          freshSession?.user?.role,
          freshSession?.user?.onboardingComplete,
          searchParams.get('callbackUrl'),
        );
      }
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (!ticket) return;
    setError(null);
    setIsResending(true);
    try {
      await apiClient.resendOtp(ticket);
      setError('A new code has been sent.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to resend the code.'));
    } finally {
      setIsResending(false);
    }
  }

  if (status === 'loading' || status === 'authenticated') {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Register' }]} />
          <p className="text-center text-muted">Loading...</p>
        </AuthPanel>
      </AuthPage>
    );
  }

  if (publicClientSettings?.authMaintenanceBlocksSignup) {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Register' }]} />
          <AuthMaintenanceNotice
            until={publicClientSettings.authMaintenanceUntil}
            note={publicClientSettings.authMaintenanceMessage}
          />
        </AuthPanel>
      </AuthPage>
    );
  }

  if (ticket) {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Register' }]} />
          <h1 className="text-center text-[1.75rem] leading-tight">Verify your email</h1>
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

          <ActionButton
            className={secondaryButtonClass}
            onClick={handleResend}
            pending={isResending}
            pendingLabel="Sending"
          >
            Resend code
          </ActionButton>

          {error && <Alert>{error}</Alert>}
        </AuthPanel>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Register' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Create an account</h1>

        <form className="grid gap-2.5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              aria-label="First name"
              autoComplete="given-name"
              className={inputClass}
              maxLength={80}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              required
              type="text"
              value={firstName}
            />
            <input
              aria-label="Last name"
              autoComplete="family-name"
              className={inputClass}
              maxLength={80}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              required
              type="text"
              value={lastName}
            />
          </div>
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
            autoComplete="new-password"
            className={inputClass}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {password && <PasswordRequirementsList password={password} />}
          <ActionButton
            className={primaryButtonClass}
            disabled={!isStrongPassword(password)}
            type="submit"
            pending={isSubmitting}
            pendingLabel="Creating account"
          >
            Register
          </ActionButton>
        </form>

        <Notice>
          Already have an account? <Link href="/login">Log in</Link>
        </Notice>

        {error && <Alert>{error}</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPage>Loading...</AuthPage>}>
      <RegisterContent />
    </Suspense>
  );
}
