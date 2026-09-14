'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Lock } from 'lucide-react';
import { useGetSecurityPolicyQuery, useUpsertSecurityPolicyMutation } from '@/store/api';
import type { SubscriberOrgRole } from '@/lib/api-client';
import { Skeleton } from '../primitives';
import { SettingsCard, SettingsErrorText, SettingsPrimaryButton, SettingsSuccessText } from './SettingsCard';

const CAN_MANAGE: SubscriberOrgRole[] = ['OWNER', 'ADMIN'];

function Toggle({
  checked,
  description,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 border-b border-catalogue-line py-3 last:border-0">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-catalogue-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-catalogue-muted">{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
        <input
          checked={checked}
          className="peer sr-only"
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          type="checkbox"
        />
        <span className="absolute inset-0 rounded-full bg-catalogue-line-strong transition-colors peer-checked:bg-catalogue-blue peer-disabled:opacity-50" />
        <span className="absolute left-0.5 size-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function SecuritySettingsView() {
  const { data: session } = useSession();
  const canManage = session?.user.orgRole ? CAN_MANAGE.includes(session.user.orgRole) : false;

  const { data: policy, isLoading } = useGetSecurityPolicyQuery();
  const [upsertPolicy, { isLoading: saving }] = useUpsertSecurityPolicyMutation();

  const [requireSso, setRequireSso] = useState(false);
  const [requireIpAllowlist, setRequireIpAllowlist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (policy) {
      setRequireSso(policy.requireSso);
      setRequireIpAllowlist(policy.requireIpAllowlist);
    }
  }, [policy]);

  async function save(nextRequireSso: boolean, nextRequireIpAllowlist: boolean) {
    setError(null);
    setSuccess(false);
    try {
      await upsertPolicy({
        requireSso: nextRequireSso,
        requireIpAllowlist: nextRequireIpAllowlist,
      }).unwrap();
      setSuccess(true);
    } catch (err: any) {
      setError(
        err?.data?.message ??
          'Unable to save this policy. Security policies require an Enterprise plan.',
      );
    }
  }

  if (isLoading) {
    return (
      <SettingsCard title="Security Policy">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      description="Organization-wide sign-in and access requirements."
      title="Security Policy"
    >
      <Toggle
        checked={requireSso}
        description="Blocks password sign-in for every role except Owner."
        disabled={!canManage || saving}
        label="Require SSO for all members"
        onChange={(value) => {
          setRequireSso(value);
          void save(value, requireIpAllowlist);
        }}
      />
      <Toggle
        checked={requireIpAllowlist}
        description="Stream keys and OAuth clients must specify an allowed IP range."
        disabled={!canManage || saving}
        label="Require IP allowlist for API credentials"
        onChange={(value) => {
          setRequireIpAllowlist(value);
          void save(requireSso, value);
        }}
      />
      {error && <SettingsErrorText>{error}</SettingsErrorText>}
      {success && <SettingsSuccessText>Saved.</SettingsSuccessText>}
      {!policy && !error && (
        <p className="flex items-center gap-1.5 text-xs text-catalogue-dim">
          <Lock aria-hidden="true" className="size-3.5" />
          No custom security policy is set -- platform defaults apply.
        </p>
      )}
    </SettingsCard>
  );
}
