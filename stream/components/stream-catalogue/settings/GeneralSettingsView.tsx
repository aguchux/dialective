'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useGetMeQuery, useUpdateProfileMutation } from '@/store/api';
import { Skeleton } from '../primitives';
import {
  SettingsCard,
  SettingsErrorText,
  SettingsField,
  SettingsPrimaryButton,
  SettingsSuccessText,
  settingsInputClassName,
} from './SettingsCard';

/**
 * The signed-in member's own details.
 *
 * This tab used to edit the organization's name and slug -- the same two
 * fields the Organization tab already owns, as the first card of a form
 * that also carries website, industry, description and support email. So
 * the General tab was a strict subset of another tab, there was nowhere to
 * edit your own name, and an org admin had two places to rename the org
 * that could disagree about which had saved last.
 *
 * Email is shown read-only: it is the account's unique identifier and
 * emailVerifiedAt hangs off it, so changing it is a re-verification flow
 * rather than a profile edit. The role is read-only for a different reason
 * -- a member must not be able to promote themselves; that lives in Team,
 * guarded server-side.
 */
export function GeneralSettingsView() {
  const { data: session } = useSession();
  const { data: me, isLoading } = useGetMeQuery();
  const [updateProfile, { isLoading: saving }] = useUpdateProfileMutation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!me) return;
    setFirstName(me.firstName ?? '');
    setLastName(me.lastName ?? '');
  }, [me]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await updateProfile({ firstName, lastName }).unwrap();
      setSuccess(true);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to save changes.');
    }
  }

  if (isLoading) {
    return (
      <SettingsCard title="Your Profile">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </SettingsCard>
    );
  }

  const role = session?.user.orgRole;

  return (
    <SettingsCard
      description="Your personal details. Your organization is managed on the Organization tab."
      title="Your Profile"
    >
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField htmlFor="profile-first-name" label="First Name">
            <input
              className={settingsInputClassName}
              id="profile-first-name"
              onChange={(e) => setFirstName(e.target.value)}
              required
              value={firstName}
            />
          </SettingsField>
          <SettingsField htmlFor="profile-last-name" label="Last Name">
            <input
              className={settingsInputClassName}
              id="profile-last-name"
              onChange={(e) => setLastName(e.target.value)}
              required
              value={lastName}
            />
          </SettingsField>
        </div>

        <SettingsField
          hint="Contact support to change the address you sign in with."
          htmlFor="profile-email"
          label="Email"
        >
          <input
            className={`${settingsInputClassName} cursor-not-allowed text-catalogue-dim`}
            disabled
            id="profile-email"
            readOnly
            value={me?.email ?? ''}
          />
        </SettingsField>

        {role && (
          <SettingsField
            hint="Your role is set by an organization owner or admin, on the Team page."
            htmlFor="profile-role"
            label="Role"
          >
            <input
              className={`${settingsInputClassName} cursor-not-allowed text-catalogue-dim`}
              disabled
              id="profile-role"
              readOnly
              value={role.replace(/_/g, ' ').toLowerCase()}
            />
          </SettingsField>
        )}

        {error && <SettingsErrorText>{error}</SettingsErrorText>}
        {success && <SettingsSuccessText>Saved.</SettingsSuccessText>}
        <SettingsPrimaryButton disabled={saving} type="submit">
          {saving ? 'Saving...' : 'Save Changes'}
        </SettingsPrimaryButton>
      </form>
    </SettingsCard>
  );
}
