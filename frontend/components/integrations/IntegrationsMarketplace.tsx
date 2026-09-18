'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Clock, MessageCircle, Plug, Search } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass, EmptyPanel, SectionTitle } from '@/components/dashboard/shared';
import {
  Integration,
  normalizeErrorMessage,
  useGetWhatsAppValidationPendingCountQuery,
  useListIntegrationsQuery,
  useSubscribeToIntegrationMutation,
} from '@/store/api';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type SortBy = 'sortOrder' | 'name' | 'category' | 'createdAt';

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'sortOrder', label: 'Featured' },
  { id: 'name', label: 'Name' },
  { id: 'category', label: 'Category' },
  { id: 'createdAt', label: 'Newest' },
];

const ICONS: Record<
  string,
  React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
> = {
  MessageCircle,
};

/**
 * "P2P & Integrations" marketplace -- the search/sort card grid a member
 * lands on from the avatar dropdown. Subscribing here is what unlocks a
 * member to claim/fulfill requests on that integration's own product page
 * (e.g. /dashboard/integrations/whatsapp-validator); browsing itself needs
 * no subscription. Shared between the trainer and distributor routes, same
 * pattern as MarketActivity.
 */
export function IntegrationsMarketplace() {
  const pathname = usePathname();
  const basePath = pathname?.startsWith('/distributor')
    ? '/distributor/integrations'
    : '/dashboard/integrations';
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('sortOrder');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: integrations = [], isFetching } = useListIntegrationsQuery({
    search: debouncedSearch || undefined,
    sortBy,
    sortDir:
      sortBy === 'name' || sortBy === 'category' ? 'asc' : sortBy === 'createdAt' ? 'desc' : 'asc',
  });
  const [subscribe, { isLoading: subscribing }] = useSubscribeToIntegrationMutation();
  const [error, setError] = useState('');
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  // Unclaimed-request count for the WhatsApp Validator card specifically --
  // 0 (never an error) when the current member isn't subscribed to it.
  const { data: whatsAppPendingData } = useGetWhatsAppValidationPendingCountQuery();
  const whatsAppPendingCount = whatsAppPendingData?.count ?? 0;

  async function handleSubscribe(integration: Integration) {
    setError('');
    setSubscribingId(integration.id);
    try {
      await subscribe(integration.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to subscribe to this integration.'));
    } finally {
      setSubscribingId(null);
    }
  }

  return (
    <div>
      <SectionTitle
        title="P2P & Integrations"
        subtitle="Peer-fulfilled products you can subscribe to and earn from."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink dark:bg-surface-muted"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
            type="search"
            value={search}
            aria-label="Search integrations"
          />
        </div>
        <select
          className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm font-bold dark:bg-surface-muted"
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          value={sortBy}
          aria-label="Sort integrations"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
          {error}
        </p>
      )}

      {!isFetching && integrations.length === 0 && (
        <EmptyPanel icon={Plug} title="No integrations match your search" unframed />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => {
          const Icon = (integration.iconKey && ICONS[integration.iconKey]) || Plug;
          const pendingCount = integration.slug === 'whatsapp-validator' ? whatsAppPendingCount : 0;
          return (
            <div className={`${cardClass} grid gap-3 p-4`} key={integration.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="relative grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
                    <Icon className="size-5" aria-hidden="true" />
                    {pendingCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-black leading-5 text-white">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </span>
                  <div>
                    <p className="font-black">{integration.name}</p>
                    <p className="text-xs font-bold text-muted">{integration.category}</p>
                  </div>
                </div>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-danger/10 px-2 py-1 text-xs font-extrabold text-danger">
                    {pendingCount} unclaimed
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">{integration.description}</p>
              {Number(integration.feeTokenAmount) > 0 && (
                <p className="text-sm font-extrabold">
                  Earn {integration.feeTokenAmount} DL per fulfilled request
                </p>
              )}
              {/* Requesting access and having it are different things now:
                  an admin approves before a member can fulfil requests. */}
              {integration.subscribed ? (
                <Link
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-accent px-3 font-extrabold text-white"
                  href={`${basePath}/${integration.slug}`}
                >
                  Open <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : integration.subscriptionStatus === 'PENDING' ? (
                <p className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface-muted px-3 text-sm font-extrabold text-muted">
                  <Clock className="size-4" aria-hidden="true" /> Awaiting admin approval
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {integration.subscriptionStatus === 'REJECTED' && (
                    <p className="text-sm font-bold text-red-700">
                      Your request was declined. You can request again.
                    </p>
                  )}
                  <ActionButton
                    className="min-h-10 rounded-lg border border-line px-3 font-extrabold hover:bg-surface-muted"
                    onClick={() => handleSubscribe(integration)}
                    pending={subscribing && subscribingId === integration.id}
                    pendingLabel="Requesting"
                    type="button"
                  >
                    {integration.subscriptionStatus === 'REJECTED'
                      ? 'Request again'
                      : 'Request access'}
                  </ActionButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
