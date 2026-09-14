'use client';

import { Copy } from 'lucide-react';
import { useState } from 'react';
import { useGetOrganizationQuery, useListMembersQuery } from '@/store/api';
import { Skeleton } from '../primitives';
import { SettingsCard } from './SettingsCard';

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

export function OrganizationSettingsView() {
  const { data: org, isLoading: orgLoading } = useGetOrganizationQuery();
  const { data: members, isLoading: membersLoading } = useListMembersQuery();

  if (orgLoading) {
    return (
      <SettingsCard title="Workspace Details">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </SettingsCard>
    );
  }

  const plan = org?.subscription?.plan;
  const seatCap = plan?.maxTeamMembers;
  const usedSeats = members?.length ?? 0;

  return (
    <div className="grid gap-5">
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
