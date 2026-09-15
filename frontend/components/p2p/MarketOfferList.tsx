'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Landmark, Search } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatCompactNumber } from '@/lib/format';
import { Avatar, cardClass, EmptyPanel, formatDateTime, SectionTitle } from '@/components/dashboard/shared';
import {
  P2POffer,
  P2PMarketSettings,
  useListP2POffersQuery,
} from '@/store/api';

/** Debounces a fast-changing value (e.g. every keystroke) so a search box doesn't fire a request per character. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Pauses polling while the tab/window is hidden, so a backgrounded market view doesn't keep hammering the API. */
function useIsPageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    function handleChange() {
      setVisible(document.visibilityState === 'visible');
    }
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  }, []);
  return visible;
}

const MARKET_LIST_POLL_MS = 7000;

type SortBy = 'createdAt' | 'tokenAmount' | 'fiatAmount' | 'price';
type MarketType = 'SELL' | 'BUY' | 'ALL';

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'createdAt', label: 'Newest' },
  { id: 'price', label: 'Price' },
  { id: 'tokenAmount', label: 'DL amount' },
  { id: 'fiatAmount', label: 'Fiat amount' },
];

const MARKET_TYPE_OPTIONS: { id: MarketType; label: string }[] = [
  { id: 'ALL', label: 'All markets' },
  { id: 'SELL', label: 'Sell offers' },
  { id: 'BUY', label: 'Buy requests' },
];

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Full-width, searchable/sortable/paginated market list -- the SELL/BUY
 * tabs' underlying data in MarketView. Split out from MarketView.tsx (which
 * owns the tabbed shell, create-offer dialog, my-posts, my-trades) so the
 * search/poll/pagination state and the CSS full-bleed treatment stay
 * scoped to just the list, not the whole tabbed view.
 */
export function MarketOfferList({
  settings,
  onAccept,
  onCancel,
  onOpenProfile,
  accepting,
  cancellingOffer,
  cancellingOfferId,
  disabled,
  viewerId,
}: {
  settings: P2PMarketSettings | undefined;
  onAccept: (offer: P2POffer) => void;
  onCancel: (offer: P2POffer) => void;
  onOpenProfile: (userId: string) => void;
  accepting: boolean;
  cancellingOffer: boolean;
  cancellingOfferId: string | undefined;
  disabled: boolean;
  viewerId: string | undefined;
}) {
  const [type, setType] = useState<MarketType>('ALL');
  const [search, setSearch] = useState('');
  const [fiatCurrency, setFiatCurrency] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const debouncedSearch = useDebouncedValue(search, 300);
  const isPageVisible = useIsPageVisible();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, fiatCurrency, paymentMethod, sortBy, sortDir, type]);

  const { data, isFetching } = useListP2POffersQuery(
    {
      type: type === 'ALL' ? undefined : type,
      search: debouncedSearch || undefined,
      fiatCurrency: fiatCurrency || undefined,
      paymentMethod: paymentMethod || undefined,
      sortBy,
      sortDir,
      page,
      pageSize,
    },
    { pollingInterval: isPageVisible ? MARKET_LIST_POLL_MS : 0 },
  );
  const offers = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  const currencyOptions = parseCsv(settings?.allowedFiatCurrencies);
  const paymentMethodOptions = parseCsv(settings?.allowedPaymentMethods);

  return (
    <section className="mx-[calc(50%-50vw)] w-screen px-4 md:px-6">
      <div className="mx-auto max-w-[1600px]">
        <SectionTitle title="Market" subtitle="Active marketplace posts." />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm font-bold dark:bg-surface-muted"
            onChange={(e) => setType(e.target.value as MarketType)}
            value={type}
            aria-label="Filter by market type"
          >
            {MARKET_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink dark:bg-surface-muted"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trader name or email..."
              type="search"
              value={search}
              aria-label="Search trader name or email"
            />
          </div>
          {currencyOptions.length > 1 && (
            <select
              className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm dark:bg-surface-muted"
              onChange={(e) => setFiatCurrency(e.target.value)}
              value={fiatCurrency}
              aria-label="Filter by currency"
            >
              <option value="">All currencies</option>
              {currencyOptions.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          )}
          {paymentMethodOptions.length > 1 && (
            <select
              className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm dark:bg-surface-muted"
              onChange={(e) => setPaymentMethod(e.target.value)}
              value={paymentMethod}
              aria-label="Filter by payment method"
            >
              <option value="">All payment methods</option>
              {paymentMethodOptions.map((method) => (
                <option key={method} value={method}>
                  {method.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {SORT_OPTIONS.map((option) => (
              <button
                className={`inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm font-bold ${
                  sortBy === option.id
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-muted hover:bg-surface-muted'
                }`}
                key={option.id}
                onClick={() => {
                  if (sortBy === option.id) {
                    setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortBy(option.id);
                    setSortDir('desc');
                  }
                }}
                type="button"
              >
                {option.label}
                {sortBy === option.id &&
                  (sortDir === 'asc' ? (
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  ))}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {offers.length === 0 && <EmptyPanel icon={Landmark} title="No active posts" unframed />}
          {offers.map((offer) => (
            <div className={`${cardClass} grid gap-3 p-4`} key={offer.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-muted">
                    {offer.type === 'SELL' ? 'Selling' : 'Buying'}
                  </p>
                  <p className="text-2xl font-black">{formatCompactNumber(offer.tokenAmount)}</p>
                </div>
                <p className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
                  {offer.status}
                </p>
              </div>
              {offer.user && (
                <button
                  className="flex items-center gap-2 justify-self-start rounded-lg text-left hover:opacity-80"
                  onClick={() => onOpenProfile(offer.userId)}
                  type="button"
                >
                  <Avatar email={offer.user.email} />
                  <span className="text-sm font-bold">{traderDisplayName(offer.user)}</span>
                </button>
              )}
              <p className="font-extrabold">
                {Number(offer.fiatAmount).toLocaleString()} {offer.fiatCurrency}
              </p>
              <p className="text-sm text-muted">Expires {formatDateTime(offer.expiresAt)}</p>
              {offer.userId === viewerId ? (
                <div className="grid gap-2">
                  {offer.status === 'ACTIVE' ? (
                    <ActionButton
                      className="min-h-10 rounded-lg border border-line px-3 font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => onCancel(offer)}
                      pending={cancellingOffer && cancellingOfferId === offer.id}
                      pendingLabel="Cancelling"
                      type="button"
                    >
                      Cancel post
                    </ActionButton>
                  ) : (
                    <p className="text-sm font-bold text-muted">
                      This post has been accepted. Manage its protected cancellation in My trades.
                    </p>
                  )}
                </div>
              ) : (
                <button
                  className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white disabled:opacity-50"
                  disabled={accepting || disabled}
                  onClick={() => onAccept(offer)}
                  type="button"
                >
                  {offer.type === 'SELL' ? 'Buy DL' : 'Sell to buyer'}
                </button>
              )}
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Page {page} of {totalPages} {isFetching ? '· refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <button
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function traderDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.email;
}
