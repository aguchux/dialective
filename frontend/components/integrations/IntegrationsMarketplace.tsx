'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, MessageCircle, Plug, Search } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass, EmptyPanel, SectionTitle } from '@/components/dashboard/shared';
import {
  Integration,
  normalizeErrorMessage,
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

const ICONS: Record<string, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>> =
  {
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
  const basePath = pathname?.startsWith('/distributor') ? '/distributor/integrations' : '/dashboard/integrations';
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('sortOrder');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: integrations = [], isFetching } = useListIntegrationsQuery({
    search: debouncedSearch || undefined,
    sortBy,
    sortDir: sortBy === 'name' || sortBy === 'category' ? 'asc' : sortBy === 'createdAt' ? 'desc' : 'asc',
  });
  const [subscribe, { isLoading: subscribing }] = useSubscribeToIntegrationMutation();
  const [error, setError] = useState('');
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

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

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => {
          const Icon = (integration.iconKey && ICONS[integration.iconKey]) || Plug;
          return (
            <div className={`${cardClass} grid gap-3 p-4`} key={integration.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-black">{integration.name}</p>
                    <p className="text-xs font-bold text-muted">{integration.category}</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted">{integration.description}</p>
              {Number(integration.feeTokenAmount) > 0 && (
                <p className="text-sm font-extrabold">
                  Earn {integration.feeTokenAmount} DL per fulfilled request
                </p>
              )}
              {integration.subscribed ? (
                <Link
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-accent px-3 font-extrabold text-white"
                  href={`${basePath}/${integration.slug}`}
                >
                  Open <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : (
                <ActionButton
                  className="min-h-10 rounded-lg border border-line px-3 font-extrabold hover:bg-surface-muted"
                  onClick={() => handleSubscribe(integration)}
                  pending={subscribing && subscribingId === integration.id}
                  pendingLabel="Subscribing"
                  type="button"
                >
                  Subscribe
                </ActionButton>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
