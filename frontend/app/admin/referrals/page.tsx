'use client';

import { useState } from 'react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageShell, Section } from '@/components/PageShell';
import {
  normalizeErrorMessage,
  useCreateReferralProgramMutation,
  useGetReferralProgramsQuery,
  useGetReferralsQuery,
  useUpdateReferralProgramMutation,
} from '@/store/api';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

export default function AdminReferralsPage() {
  const [name, setName] = useState('');
  const [commissionRate, setCommissionRate] = useState('0.10');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: programs, isLoading: isLoadingPrograms } = useGetReferralProgramsQuery();
  const { data: referrals, isLoading: isLoadingReferrals } = useGetReferralsQuery();
  const [createProgram, { isLoading: isCreating }] = useCreateReferralProgramMutation();
  const [updateProgram] = useUpdateReferralProgramMutation();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createProgram({
        name,
        commissionRate: Number(commissionRate),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      }).unwrap();
      setName('');
      setEndsAt('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create referral program.'));
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await updateProgram({ id, body: { isActive: !isActive } });
  }

  return (
    <PageShell>
      <Section>
        <Breadcrumbs items={[{ label: 'Admin' }, { label: 'Referrals' }]} />
        <h1 className="text-4xl leading-tight md:text-5xl">Referral programs</h1>
        <p className="text-lg leading-relaxed text-muted">
          Manage referral campaign windows and see who is earning commissions.
        </p>
      </Section>

      <Section>
        <h2 className="text-2xl leading-snug">New program</h2>
        <form className="grid gap-2.5 md:max-w-md" onSubmit={handleCreate}>
          <label htmlFor="program-name">Name</label>
          <input
            className={inputClass}
            id="program-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <label htmlFor="program-rate">Commission rate (0-1, e.g. 0.10 = 10%)</label>
          <input
            className={inputClass}
            id="program-rate"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={commissionRate}
            onChange={(e) => setCommissionRate(e.target.value)}
            required
          />
          <label htmlFor="program-ends">Ends at (optional)</label>
          <input
            className={inputClass}
            id="program-ends"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <div>
            <button className={primaryButtonClass} type="submit" disabled={isCreating}>
              Create program
            </button>
          </div>
        </form>
        {error && (
          <p className="leading-relaxed text-danger" role="alert">
            {error}
          </p>
        )}
      </Section>

      <Section>
        <h2 className="text-2xl leading-snug">Programs</h2>
        {isLoadingPrograms && <p className="text-muted">Loading...</p>}
        {programs && programs.length === 0 && <p className="text-muted">No referral programs yet.</p>}
        {programs && programs.length > 0 && (
          <div className="grid gap-2">
            {programs.map((program) => (
              <div
                className="grid gap-2 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={program.id}
              >
                <div className="grid gap-1">
                  <p className="font-extrabold">{program.name}</p>
                  <p className="text-sm text-muted">
                    {(Number(program.commissionRate) * 100).toFixed(0)}% commission &middot; starts{' '}
                    {new Date(program.startsAt).toLocaleString()}
                    {program.endsAt ? ` &middot; ends ${new Date(program.endsAt).toLocaleString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
                      program.isActive ? 'bg-accent-soft text-accent-dark' : 'bg-surface-muted text-muted'
                    }`}
                  >
                    {program.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    className={secondaryButtonClass}
                    onClick={() => toggleActive(program.id, program.isActive)}
                    type="button"
                  >
                    {program.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section>
        <h2 className="text-2xl leading-snug">Referrers</h2>
        {isLoadingReferrals && <p className="text-muted">Loading...</p>}
        {referrals && referrals.length === 0 && <p className="text-muted">No referral commissions yet.</p>}
        {referrals && referrals.length > 0 && (
          <div className="grid gap-2">
            {referrals.map((r) => (
              <div className="grid gap-1 rounded-lg border border-line bg-surface p-4" key={r.referralCode}>
                <p className="font-extrabold">{r.referrerEmail}</p>
                <p className="text-sm text-muted">
                  {r.referredUsers.length} referred &middot; {r.commissionCount} confirmed purchases &middot; earned{' '}
                  {r.totalCommission} tokens
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  );
}
