'use client';

import { useGetOrgContributionQuery, useListMyValidationsQuery } from '@/store/api';
import { Card, PageHeading } from '@/components/ui';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-black text-ink">{value}</p>
    </Card>
  );
}

export default function ValidationPage() {
  const { data: contribution } = useGetOrgContributionQuery();
  const { data: validations, isLoading } = useListMyValidationsQuery();

  return (
    <div>
      <PageHeading
        subtitle="Your organization's contribution to the Independent Subscriber Validation Programme (ISVP)."
        title="Validation"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Recordings Validated" value={String(contribution?.recordingsValidated ?? 0)} />
        <StatCard label="Total Validations" value={String(contribution?.totalValidations ?? 0)} />
      </div>

      <Card>
        {isLoading ? (
          <p className="p-5 text-sm text-muted">Loading...</p>
        ) : validations && validations.length > 0 ? (
          <div className="divide-y divide-line">
            {validations.map((v) => (
              <div className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center" key={v.id}>
                <div>
                  <p className="font-mono text-sm text-ink">{v.recordingId}</p>
                  <p className="text-xs text-muted">
                    {v.user ? `${v.user.firstName} ${v.user.lastName}` : 'You'} ·{' '}
                    {new Date(v.createdAt).toLocaleDateString()}
                  </p>
                  {v.notes && <p className="mt-1 text-xs text-muted">&ldquo;{v.notes}&rdquo;</p>}
                </div>
                <p className="text-sm font-bold text-ink">Overall: {v.overallScore}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">
            No validations submitted yet. Validate recordings from Explore Voice Data.
          </p>
        )}
      </Card>
    </div>
  );
}
