'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  CreditCard,
  Eye,
  IdCard,
  Landmark,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { countryFlagEmoji, formatCompactNumber } from '@/lib/format';
import { Avatar, EmptyPanel, SectionTitle } from '@/components/dashboard/shared';
import { P2POffer, P2PMarketSettings, useListP2POffersQuery } from '@/store/api';

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
  const pathname = usePathname();
  // Offer detail lives under each role's own market route:
  // /dashboard/markets/offers/[id] and /distributor/market/offers/[id].
  const offersBase = pathname?.startsWith('/distributor')
    ? '/distributor/market/offers'
    : '/dashboard/markets/offers';
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
    <section className="mx-[calc(50%-50vw)] w-screen overflow-x-hidden px-4 md:px-6">
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

        {offers.length === 0 ? (
          <EmptyPanel icon={Landmark} title="No active posts" unframed />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-215 border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-bold" scope="col">
                    Trader
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Amount
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Payment method
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Country
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => {
                  const flag = countryFlagEmoji(offer.user?.country?.code);
                  const priceEach =
                    Number(offer.tokenAmount) > 0
                      ? Number(offer.fiatAmount) / Number(offer.tokenAmount)
                      : 0;
                  return (
                    <tr
                      className="border-b border-line last:border-0 hover:bg-surface-muted"
                      key={offer.id}
                    >
                      <td className="px-4 py-3 align-top">
                        {offer.user ? (
                          <button
                            className="flex items-start gap-2.5 text-left hover:opacity-80"
                            onClick={() => onOpenProfile(offer.userId)}
                            type="button"
                          >
                            <Avatar email={offer.user.email} />
                            <span className="grid gap-0.5">
                              <span className="flex items-center gap-1.5 font-bold text-ink">
                                {traderDisplayName(offer.user)}
                                <TrustBadges
                                  kycVerified={offer.user.kycVerified}
                                  phoneVerified={offer.user.phoneVerified}
                                />
                              </span>
                              <span className="text-xs text-muted">
                                {offer.completedSaleCount ?? 0} trade
                                {offer.completedSaleCount === 1 ? '' : 's'}
                              </span>
                            </span>
                          </button>
                        ) : (
                          <span className="text-muted">Unknown trader</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-black text-ink">
                          {formatCompactNumber(offer.tokenAmount)} DL
                        </p>
                        <p className="text-xs text-muted">
                          {priceEach.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                          {offer.fiatCurrency} each
                        </p>
                        {offer.viewCount > 0 && (
                          <span
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted"
                            title={`${offer.viewCount} trader${offer.viewCount === 1 ? ' has' : 's have'} viewed this post`}
                          >
                            <Eye className="size-3" aria-hidden="true" />
                            {offer.viewCount}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-bold text-ink">
                          <CreditCard className="size-3.5 text-muted" aria-hidden="true" />
                          {offer.paymentMethod.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {offer.user?.country ? (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <span aria-hidden="true">{flag ?? '🌐'}</span>
                            {offer.user.country.name}
                          </span>
                        ) : (
                          <span className="text-sm text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        {offer.userId === viewerId ? (
                          offer.status === 'ACTIVE' ? (
                            <ActionButton
                              className="min-h-9 rounded-lg border border-line px-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => onCancel(offer)}
                              pending={cancellingOffer && cancellingOfferId === offer.id}
                              pendingLabel="Cancelling"
                              type="button"
                            >
                              Cancel post
                            </ActionButton>
                          ) : (
                            <span className="text-xs font-bold text-muted">Accepted</span>
                          )
                        ) : (
                          // Names the side of the trade this row would put
                          // you on, so the path through the market stays
                          // legible -- but it opens the offer's detail page
                          // rather than trading, so a mistap in a scrolling
                          // table still cannot commit real escrow. "now"
                          // marks it as the start of that action without
                          // promising an immediate commit.
                          <Link
                            className="inline-flex min-h-9 items-center rounded-lg bg-accent px-4 text-sm font-extrabold text-white hover:bg-accent-dark"
                            href={`${offersBase}/${offer.id}`}
                          >
                            {offer.type === 'SELL' ? 'Buy now' : 'Sell now'}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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

/**
 * Three independent trust signals next to a trader's name: a phone icon
 * (phoneVerifiedAt set), a KYC icon (kycStatus=APPROVED), and a combined
 * shield summarizing both -- orange when exactly one is true, green when
 * both are, hidden entirely when neither is (an unverified trader gets no
 * shield rather than a red/negative one, since "unverified" is the default
 * state for most trainers, not a red flag on its own).
 */
function TrustBadges({
  phoneVerified,
  kycVerified,
}: {
  phoneVerified: boolean;
  kycVerified: boolean;
}) {
  if (!phoneVerified && !kycVerified) return null;
  const bothVerified = phoneVerified && kycVerified;
  return (
    <span className="inline-flex items-center gap-1">
      {bothVerified ? (
        <ShieldCheck
          className="size-4 shrink-0 text-emerald-600"
          aria-label="Phone and KYC verified"
        />
      ) : (
        <Shield
          className="size-4 shrink-0 text-amber-500"
          aria-label={phoneVerified ? 'Phone verified' : 'KYC verified'}
        />
      )}
      {phoneVerified && (
        <Smartphone className="size-3.5 shrink-0 text-muted" aria-label="Phone verified" />
      )}
      {kycVerified && <IdCard className="size-3.5 shrink-0 text-muted" aria-label="KYC verified" />}
    </span>
  );
}
