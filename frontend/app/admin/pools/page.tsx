'use client';

import { FormEvent, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  normalizeErrorMessage,
  useCloseSubscriptionPoolMutation,
  useCreateSubscriptionPoolMutation,
  useGetPoolsSummaryQuery,
  useListSubscriptionPoolsQuery,
} from '@/store/api';

const summaryIconBg: Record<string, string> = {
  available: 'bg-[#e6f7ef] text-[#1AAE5C]',
  availableUsd: 'bg-[#e8f0fe] text-[#3B6DF0]',
  activePools: 'bg-[#efe8fe] text-[#7B3BF0]',
  settled: 'bg-[#fff3e0] text-[#D98A0D]',
};

export default function AdminPoolsPage() {
  const { data: summary, isLoading: isLoadingSummary } = useGetPoolsSummaryQuery();
  const { data: pools, isLoading: isLoadingPools } = useListSubscriptionPoolsQuery();
  const [closePool] = useCloseSubscriptionPoolMutation();

  const availableTokens = summary ? Number(summary.totalAvailableTokens) : null;

  const cards = [
    {
      key: 'available',
      label: 'Reward Pool Available',
      value: availableTokens !== null ? `${availableTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens` : '-',
      negative: availableTokens !== null && availableTokens < 0,
    },
    {
      key: 'availableUsd',
      label: 'Total Subscriber Funding',
      value: summary ? `$${Number(summary.totalAvailableUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-',
    },
    {
      key: 'activePools',
      label: 'Active Subscription Pools',
      value: summary ? summary.activePoolCount.toLocaleString() : '-',
    },
    {
      key: 'settled',
      label: 'Total Settled Payouts',
      value: summary ? `${Number(summary.totalSettledTokens).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens` : '-',
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Reward Pool</h1>
          <p className="leading-relaxed text-muted">
            The Reward Pool is funded by data subscribers, not trainers. Every active subscription pool sums into
            the total available balance, which funds scored training-payout bonuses. This is never shown to
            trainers directly.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Reward pool stats">
          {cards.map((card) => (
            <div className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]" key={card.key}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-muted">{card.label}</p>
                <span className={`grid size-9 place-items-center rounded-full ${summaryIconBg[card.key]}`}>
                  <PoolStatIcon />
                </span>
              </div>
              <p className={`text-3xl font-black ${card.negative ? 'text-danger' : ''}`}>
                {isLoadingSummary ? '...' : card.value}
              </p>
              {card.negative && (
                <p className="text-sm font-bold text-danger">Pool is running negative -- open more subscriptions.</p>
              )}
            </div>
          ))}
        </section>

        <CreatePoolForm />

        <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <h2 className="text-2xl leading-snug">Subscription pools</h2>
          {isLoadingPools && <p className="text-muted">Loading...</p>}
          {pools && pools.items.length === 0 && <p className="text-muted">No subscription pools opened yet.</p>}
          {pools && pools.items.length > 0 && (
            <div className="grid gap-2">
              {pools.items.map((pool) => (
                <div
                  className="grid gap-1 rounded-lg border border-line bg-surface p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
                  key={pool.id}
                >
                  <div className="min-w-0">
                    <p className="font-extrabold">
                      {pool.subscriberName}
                      {pool.organization && <span className="font-medium text-muted"> &middot; {pool.organization}</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {pool.subscriberEmail} &middot; ${Number(pool.usdAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {pool.note && <> &middot; {pool.note}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${
                        pool.status === 'ACTIVE' ? 'bg-accent-soft text-accent-dark' : 'bg-surface-muted text-muted'
                      }`}
                    >
                      {pool.status === 'ACTIVE' ? 'Active' : 'Closed'}
                    </span>
                    {pool.status === 'ACTIVE' && (
                      <button
                        className="rounded-md border border-line px-3 py-1.5 text-sm font-bold hover:bg-surface-muted"
                        onClick={() => closePool(pool.id)}
                        type="button"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function CreatePoolForm() {
  const [subscriberName, setSubscriberName] = useState('');
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createPool, { isLoading }] = useCreateSubscriptionPoolMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await createPool({
        subscriberName,
        subscriberEmail,
        organization: organization || undefined,
        usdAmount: Number(usdAmount),
        note: note || undefined,
      }).unwrap();
      setMessage('Subscription pool opened.');
      setSubscriberName('');
      setSubscriberEmail('');
      setOrganization('');
      setUsdAmount('');
      setNote('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to open this subscription pool.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Open a subscription pool</h2>
        <p className="leading-relaxed text-muted">
          Record a data-buying subscriber's payment. The amount is added to the total reward pool available.
        </p>
      </div>
      <form className="grid gap-4 md:max-w-2xl" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold">
            Subscriber name
            <input
              className="min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-ink"
              onChange={(e) => setSubscriberName(e.target.value)}
              required
              value={subscriberName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Subscriber email
            <input
              className="min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-ink"
              onChange={(e) => setSubscriberEmail(e.target.value)}
              required
              type="email"
              value={subscriberEmail}
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold">
            Organization
            <input
              className="min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-ink"
              onChange={(e) => setOrganization(e.target.value)}
              value={organization}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Amount (USD)
            <input
              className="min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-ink"
              min="0.01"
              onChange={(e) => setUsdAmount(e.target.value)}
              required
              step="0.01"
              type="number"
              value={usdAmount}
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-bold">
          Note
          <textarea
            className="min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-ink"
            onChange={(e) => setNote(e.target.value)}
            value={note}
          />
        </label>
        {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
        {error && (
          <p className="leading-relaxed text-danger" role="alert">
            {error}
          </p>
        )}
        <div>
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-4 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? 'Opening...' : 'Open pool'}
          </button>
        </div>
      </form>
    </section>
  );
}

function PoolStatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.2-1 1.8-3 2.3-3 1.1-3 2.3 1.3 2.2 3 2.2 3-1.1 3-2.5" strokeLinecap="round" />
    </svg>
  );
}
