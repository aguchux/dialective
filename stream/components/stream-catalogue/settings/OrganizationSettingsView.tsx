'use client';

import { Copy } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useGetOrganizationQuery, useListMembersQuery, useUpdateOrganizationMutation } from '@/store/api';
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

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-catalogue-ink transition-colors hover:text-catalogue-blue-bright"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      type="button"
    >
      <code>{value}</code>
      <Copy aria-hidden="true" className="size-3.5 text-catalogue-dim" />
      {copied && <span className="text-xs text-catalogue-green">Copied</span>}
    </button>
  );
}

function Row({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-catalogue-line py-2.5 last:border-0">
      <p className="text-sm text-catalogue-muted">{label}</p>
      {children}
    </div>
  );
}

function OrganizationProfileForm() {
  const { data: session } = useSession();
  const canManage = session?.user.orgRole ? CAN_MANAGE.includes(session.user.orgRole) : false;

  const { data: org, isLoading } = useGetOrganizationQuery();
  const [updateOrganization, { isLoading: saving }] = useUpdateOrganizationMutation();

  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setWebsite(org.website ?? '');
    setIndustry(org.industry ?? '');
    setDescription(org.description ?? '');
    setSupportEmail(org.supportEmail ?? '');
    setCompanySize(org.companySize ?? '');
  }, [org]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await updateOrganization({
        name,
        website: website || undefined,
        industry: industry || undefined,
        description: description || undefined,
        supportEmail: supportEmail || undefined,
        companySize: companySize || undefined,
      }).unwrap();
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
        <Skeleton className="h-9 w-full" />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard description="Manage your organization's public profile and contact details." title="Organization Profile">
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
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
            hint="Used in your organization's URL. Can't be changed here."
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField hint="Your organization's official website." htmlFor="org-website" label="Website">
            <input
              className={settingsInputClassName}
              disabled={!canManage}
              id="org-website"
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              type="url"
              value={website}
            />
          </SettingsField>
          <SettingsField
            hint="Select the industry that best describes your organization."
            htmlFor="org-industry"
            label="Industry"
          >
            <input
              className={settingsInputClassName}
              disabled={!canManage}
              id="org-industry"
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Artificial Intelligence"
              value={industry}
            />
          </SettingsField>
        </div>

        <SettingsField
          hint={`${description.length}/280 characters`}
          htmlFor="org-description"
          label="Description"
        >
          <textarea
            className={`${settingsInputClassName} min-h-20 py-2`}
            disabled={!canManage}
            id="org-description"
            maxLength={280}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of your organization."
            value={description}
          />
        </SettingsField>

        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField
            hint="Primary email for support inquiries."
            htmlFor="org-support-email"
            label="Support Email"
          >
            <input
              className={settingsInputClassName}
              disabled={!canManage}
              id="org-support-email"
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@example.com"
              type="email"
              value={supportEmail}
            />
          </SettingsField>
          <SettingsField hint="Helps us tailor your experience." htmlFor="org-company-size" label="Company Size">
            <select
              className={settingsInputClassName}
              disabled={!canManage}
              id="org-company-size"
              onChange={(e) => setCompanySize(e.target.value)}
              value={companySize}
            >
              <option value="">Select...</option>
              {COMPANY_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} employees
                </option>
              ))}
            </select>
          </SettingsField>
        </div>

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

export function OrganizationSettingsView() {
  const { data: org, isLoading: orgLoading } = useGetOrganizationQuery();
  const { data: members, isLoading: membersLoading } = useListMembersQuery();

  const plan = org?.subscription?.plan;
  const seatCap = plan?.maxTeamMembers;
  const usedSeats = members?.length ?? 0;

  return (
    <div className="grid gap-5">
      <OrganizationProfileForm />

      {orgLoading ? (
        <SettingsCard title="Workspace Details">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </SettingsCard>
      ) : (
        <SettingsCard description="Overview of your organization and workspace." title="Workspace Details">
          <Row label="Organization ID">
            {org ? <CopyableId value={org.id} /> : <Skeleton className="h-5 w-24" />}
          </Row>
          <Row label="Organization Slug">
            <code className="text-sm font-semibold text-catalogue-ink">{org?.slug}</code>
          </Row>
          <Row label="Plan">
            <span className="text-sm font-semibold text-catalogue-ink">{plan?.name ?? 'No active plan'}</span>
          </Row>
          <Row label="Subscription Status">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold ${
                org?.subscription?.status === 'ACTIVE'
                  ? 'bg-catalogue-green/15 text-catalogue-green'
                  : 'bg-catalogue-surface-hover text-catalogue-muted'
              }`}
            >
              {org?.subscription?.status ?? 'None'}
            </span>
          </Row>
        </SettingsCard>
      )}

      <SettingsCard
        description="Team seat usage against your plan's limit."
        title="Team & Seats"
      >
        <Row label="Members used">
          {membersLoading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <span className="text-sm font-semibold text-catalogue-ink">
              {usedSeats} / {seatCap ?? 'Unlimited'}
            </span>
          )}
        </Row>
      </SettingsCard>
    </div>
  );
}
