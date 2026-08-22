'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AuthPage, AuthPanel, Notice, Alert } from '@/components/AuthShell';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import {
  normalizeErrorMessage,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useGetDialectVariantsQuery,
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
  const [countryId, setCountryId] = useState('');
  const [dialectId, setDialectId] = useState('');
  const [dialectVariantId, setDialectVariantId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: countries, isLoading: isLoadingCountries } = useGetCountriesQuery();
  const { data: dialects, isLoading: isLoadingDialects } = useGetDialectsQuery(countryId, {
    skip: !countryId,
  });
  const { data: dialectVariants } = useGetDialectVariantsQuery(dialectId, { skip: !dialectId });
  const [updateProfile, { isLoading: isSubmitting }] = useUpdateProfileMutation();

  // Magic-link sign-in never collects a name (it's email-only by design),
  // so onboarding is the fallback place to require it before the trainer
  // reaches the dashboard. If a name is already on file (password
  // registration collects it up front), skip re-asking.
  const needsName = !session?.user?.firstName || !session?.user?.lastName;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    } else if (status === 'authenticated' && session?.user?.role === 'ADMIN') {
      router.replace('/admin');
    }
  }, [status, session, router]);

  useEffect(() => {
    setDialectId('');
  }, [countryId]);

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
    if (!countryId || !dialectId) {
      setError('Choose a country and a dialect to continue.');
      return;
    }
    try {
      const profile = await updateProfile({
        countryId,
        dialectId,
        ...(dialectVariantId ? { dialectVariantId } : {}),
        ...(needsName ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}),
      }).unwrap();
      await update({
        onboardingComplete: profile.onboardingComplete,
        dialectTag: profile.dialectTag,
        countryId: profile.countryId,
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
      window.location.href = '/dashboard';
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

  return (
    <AuthPage>
      <AuthPanel>
        <Breadcrumbs items={[{ label: 'Onboarding' }]} />
        <h1 className="text-center text-[1.75rem] leading-tight">Set up your training profile</h1>
        <Notice>
          {session?.user?.email ? `Welcome, ${session.user.email}. ` : ''}
          {needsName
            ? "Tell us your name, then choose your country and the dialect you'd like to train first. You can change this later."
            : "Choose your country and the dialect you'd like to train first. You can change this later."}
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

          <label htmlFor="onboarding-country">Country</label>
          <select
            className={selectClass}
            id="onboarding-country"
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            disabled={isLoadingCountries}
            required
          >
            <option value="">{isLoadingCountries ? 'Loading...' : 'Select a country'}</option>
            {countries?.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>

          <label htmlFor="onboarding-dialect">Dialect</label>
          <select
            className={selectClass}
            id="onboarding-dialect"
            value={dialectId}
            onChange={(e) => setDialectId(e.target.value)}
            disabled={!countryId || isLoadingDialects}
            required
          >
            <option value="">
              {!countryId
                ? 'Select a country first'
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

          {dialectVariants && dialectVariants.length > 0 && (
            <>
              <label htmlFor="onboarding-dialect-variant">Specific variety (optional)</label>
              <select
                className={selectClass}
                id="onboarding-dialect-variant"
                value={dialectVariantId}
                onChange={(e) => setDialectVariantId(e.target.value)}
              >
                <option value="">Not sure / general</option>
                {dialectVariants.map((variant) => (
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
