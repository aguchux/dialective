'use client';

import Link from 'next/link';
import { useGetOrganizationQuery, useListStreamDecksQuery } from '@/store/api';
import { Card, PageHeading, PrimaryButton } from '@/components/ui';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-black text-ink">{value}</p>
    </Card>
  );
}

export default function OverviewPage() {
  const { data: org } = useGetOrganizationQuery();
  const { data: decks } = useListStreamDecksQuery();

  const totalRecordings = (decks ?? []).reduce((sum, deck) => sum + (deck._count?.items ?? 0), 0);
  const subscription = org?.subscription;

  return (
    <div>
      <PageHeading subtitle={org?.name} title="Overview" />

      {!subscription || subscription.status === 'CANCELED' || subscription.status === 'SUSPENDED' ? (
        <Card className="mb-6 border-warning/30 bg-warning/5 p-5">
          <p className="font-bold text-ink">Activate a subscription to start streaming voice data</p>
          <p className="mt-1 text-sm text-muted">
            Search and preview are always available; creating Stream Decks and previewing
            recordings require an active monthly subscription.
          </p>
          <Link className="mt-3 inline-block" href="/dashboard/billing">
            <PrimaryButton type="button">View plans</PrimaryButton>
          </Link>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active Stream Decks" value={String(decks?.length ?? 0)} />
        <StatCard label="Curated Recordings" value={String(totalRecordings)} />
        <StatCard
          label="Subscription"
          value={subscription ? subscription.status : 'None'}
        />
        <StatCard label="Plan" value={subscription?.plan.name ?? '—'} />
      </div>
    </div>
  );
}
