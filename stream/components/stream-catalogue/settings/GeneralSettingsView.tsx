'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useGetOrganizationQuery, useUpdateOrganizationMutation } from '@/store/api';
import type { SubscriberOrgRole } from '@/lib/api-client';
import { Skeleton } from '../primitives';
import {
  SettingsCard,
  SettingsErrorText,
  SettingsField,
  SettingsPrimaryButton,
  SettingsSuccessText,
  settingsInputClassName,
} from './SettingsCard';

const CAN_MANAGE: SubscriberOrgRole[] = ['OWNER', 'ADMIN'];

export function GeneralSettingsView() {
  const { data: session } = useSession();
  const canManage = session?.user.orgRole ? CAN_MANAGE.includes(session.user.orgRole) : false;

  const { data: org, isLoading } = useGetOrganizationQuery();
  const [updateOrganization, { isLoading: saving }] = useUpdateOrganizationMutation();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (org) setName(org.name);
  }, [org]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await updateOrganization({ name }).unwrap();
      setSuccess(true);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to save changes.');
    }
  }

  if (isLoading) {
    return (
      <SettingsCard title="Organization Profile">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      description="Update your organization's name. Other profile fields aren't configurable yet."
      title="Organization Profile"
    >
      <form className="grid gap-4" onSubmit={submit}>
        <SettingsField htmlFor="org-name" label="Organization Name">
          <input
            className={settingsInputClassName}
            disabled={!canManage}
            id="org-name"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </SettingsField>
        <SettingsField
          hint="This is used in your organization's URL and can't be changed here."
          htmlFor="org-slug"
          label="Organization Slug"
        >
          <input
            className={`${settingsInputClassName} cursor-not-allowed text-catalogue-dim`}
            disabled
            id="org-slug"
            readOnly
            value={org?.slug ?? ''}
          />
        </SettingsField>
        {error && <SettingsErrorText>{error}</SettingsErrorText>}
        {success && <SettingsSuccessText>Saved.</SettingsSuccessText>}
        {canManage && (
          <SettingsPrimaryButton disabled={saving} type="submit">
            {saving ? 'Saving...' : 'Save Changes'}
          </SettingsPrimaryButton>
        )}
      </form>
    </SettingsCard>
  );
}
