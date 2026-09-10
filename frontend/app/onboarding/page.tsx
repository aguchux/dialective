'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AuthPage, AuthPanel, Notice, Alert } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import {
  normalizeErrorMessage,
  useCreateKycSessionMutation,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useGetDialectVariantsQuery,
  useGetKycStatusQuery,
  useGetPublicClientSettingsQuery,
  useUpdateProfileMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const selectClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink dark:bg-surface-muted';
const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | ''>('');
  const [originCountryId, setOriginCountryId] = useState('');
  const [trainingCountryId, setTrainingCountryId] = useState('');
  const [dialectId, setDialectId] = useState('');
  const [dialectVariantId, setDialectVariantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'form' | 'kyc'>('form');
  const [kycError, setKycError] = useState<string | null>(null);

  const { data: countries, isLoading: isLoadingCountries } = useGetCountriesQuery();
  const { data: dialects, isLoading: isLoadingDialects } = useGetDialectsQuery(trainingCountryId, {
    skip: !trainingCountryId,
  });
  const { data: dialectVariants } = useGetDialectVariantsQuery(dialectId, { skip: !dialectId });
  const { data: publicSettings } = useGetPublicClientSettingsQuery();
  const { data: kycStatusData } = useGetKycStatusQuery();
  const [updateProfile, { isLoading: isSubmitting }] = useUpdateProfileMutation();
  const [createKycSession, { isLoading: isStartingKyc }] = useCreateKycSessionMutation();

  async function startKycVerification() {
    setKycError(null);
    try {
      const session = await createKycSession().unwrap();
      window.location.href = session.url;
    } catch (err) {
      setKycError(normalizeErrorMessage(err, 'Could not start identity verification.'));
    }
  }

  // Magic-link sign-in never collects a name (it's email-only by design),
  // so onboarding is the fallback place to require it before the trainer
  // reaches the dashboard. If a name is already on file (password
  // registration collects it up front), skip re-asking.
  const needsName = !session?.user?.firstName || !session?.user?.lastName;
  // Same "collect once" pattern for gender -- already-onboarded trainers
  // missing this get caught later by GenderGateDialog on the dashboard
  // itself, so this only needs to gate first-time onboarding here.
  const needsGender = !session?.user?.gender;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    } else if (status === 'authenticated' && session?.user?.role === 'ADMIN') {
      router.replace('/admin');
    }
  }, [status, session, router]);

  useEffect(() => {
    setDialectId('');
  }, [trainingCountryId]);

  useEffect(() => {
    setDialectVariantId('');
  }, [dialectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsName && (!firstName.trim() || !lastName.trim())) {
      setError('Enter your first and last name to continue.');
      return;
    }
    if (needsGender && !gender) {
      setError('Select your gender to continue.');
      return;
    }
    if (!originCountryId || !trainingCountryId || !dialectId) {
      setError('Choose your country of origin, training country, and dialect to continue.');
      return;
    }
    if (!dialectVariantId) {
      setError('Choose a subdialect to continue.');
      return;
    }
    try {
      const profile = await updateProfile({
        originCountryId,
        countryId: trainingCountryId,
        dialectId,
        dialectVariantId,
        ...(needsName ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}),
        ...(needsGender && gender ? { gender } : {}),
      }).unwrap();
      await update({
        onboardingComplete: profile.onboardingComplete,
        dialectTag: profile.dialectTag,
        originCountryId: profile.originCountryId,
        countryId: profile.countryId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        gender: profile.gender,
      });
      const kycStatus = kycStatusData?.kycStatus ?? 'NOT_STARTED';
      const kycAlreadyHandled =
        kycStatus === 'APPROVED' || kycStatus === 'IN_PROGRESS' || kycStatus === 'IN_REVIEW';
      if (publicSettings?.isKycRequiredOnboarding && !kycAlreadyHandled) {
        setStage('kyc');
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save your selection.'));
    }
  }

  if (status === 'loading' || status === 'unauthenticated' || session?.user?.role === 'ADMIN') {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Onboarding' }]} />
          <p className="text-muted">Loading...</p>
        </AuthPanel>
      </AuthPage>
    );
  }

  if (stage === 'kyc') {
    return (
      <AuthPage>
        <AuthPanel>
          <Breadcrumbs items={[{ label: 'Onboarding' }, { label: 'Verify identity' }]} />
          <h1 className="text-center text-[1.75rem] leading-tight">Verify your identity</h1>
          <Notice>
            A quick ID scan and selfie, verified by Didit, confirms it&apos;s really you. You can do
            this now or later from your profile -- withdrawals above the platform&apos;s threshold
            will still require it either way.
          </Notice>
          <div className="grid gap-2.5">
            <ActionButton
              className={primaryButtonClass}
              onClick={() => void startKycVerification()}
              pending={isStartingKyc}
              pendingLabel="Starting"
              type="button"
            >
              Verify now
            </ActionButton>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted dark:bg-surface-muted"
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              type="button"
            >
              Do this later
            </button>
          </div>
          {kycError && <Alert>{kycError}</Alert>}
        </AuthPanel>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Onboarding' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Set up your training profile</h1>
        <Notice>
          {session?.user?.email ? `Welcome, ${session.user.email}. ` : ''}
          {needsName
            ? "Tell us your name, country of origin, and the dialect you'd like to train first. You can change your training dialect later."
            : "Choose your country of origin and the dialect you'd like to train first. You can change your training dialect later."}
        </Notice>

        <form className="grid gap-2.5" onSubmit={handleSubmit}>
          {needsName && (
            <>
              <label htmlFor="onboarding-first-name">First name</label>
              <input
                autoComplete="given-name"
                className={inputClass}
                id="onboarding-first-name"
                maxLength={80}
                onChange={(e) => setFirstName(e.target.value)}
                required
                value={firstName}
              />

              <label htmlFor="onboarding-last-name">Last name</label>
              <input
                autoComplete="family-name"
                className={inputClass}
                id="onboarding-last-name"
                maxLength={80}
                onChange={(e) => setLastName(e.target.value)}
                required
                value={lastName}
              />
            </>
          )}

          {needsGender && (
            <>
              <label htmlFor="onboarding-gender">Gender</label>
              <select
                className={selectClass}
                id="onboarding-gender"
                onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | '')}
                required
                value={gender}
              >
                <option value="">Select your gender</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </>
          )}

          <label htmlFor="onboarding-origin-country">Country of origin</label>
          <select
            className={selectClass}
            id="onboarding-origin-country"
            value={originCountryId}
            onChange={(e) => {
              const value = e.target.value;
              setOriginCountryId(value);
              setTrainingCountryId((current) => current || value);
            }}
            disabled={isLoadingCountries}
            required
          >
            <option value="">
              {isLoadingCountries ? 'Loading...' : 'Select your country of origin'}
            </option>
            {countries?.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>

          <label htmlFor="onboarding-training-country">Training country</label>
          <select
            className={selectClass}
            id="onboarding-training-country"
            value={trainingCountryId}
            onChange={(e) => setTrainingCountryId(e.target.value)}
            disabled={isLoadingCountries}
            required
          >
            <option value="">
              {isLoadingCountries ? 'Loading...' : 'Select the dialect country'}
            </option>
            {countries?.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>

          <label htmlFor="onboarding-dialect">Dialect to train</label>
          <select
            className={selectClass}
            id="onboarding-dialect"
            value={dialectId}
            onChange={(e) => setDialectId(e.target.value)}
            disabled={!trainingCountryId || isLoadingDialects}
            required
          >
            <option value="">
              {!trainingCountryId
                ? 'Select a training country first'
                : isLoadingDialects
                  ? 'Loading...'
                  : 'Select a dialect'}
            </option>
            {dialects?.map((dialect) => (
              <option key={dialect.id} value={dialect.id}>
                {dialect.name}
              </option>
            ))}
          </select>

          {dialectId && (
            <>
              <label htmlFor="onboarding-dialect-variant">Subdialect</label>
              <select
                className={selectClass}
                id="onboarding-dialect-variant"
                value={dialectVariantId}
                onChange={(e) => setDialectVariantId(e.target.value)}
                disabled={!dialectVariants || dialectVariants.length === 0}
                required
              >
                <option value="">
                  {!dialectVariants || dialectVariants.length === 0
                    ? 'Loading...'
                    : 'Select a subdialect'}
                </option>
                {dialectVariants?.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <ActionButton
            className={primaryButtonClass}
            type="submit"
            pending={isSubmitting}
            pendingLabel="Saving profile"
          >
            Continue
          </ActionButton>
        </form>

        {error && <Alert>{error}</Alert>}
      </AuthPanel>
    </AuthPage>
  );
}
