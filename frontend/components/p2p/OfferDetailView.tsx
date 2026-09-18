'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CreditCard, Eye, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { Avatar, cardClass, formatDateTime } from '@/components/dashboard/shared';
import { formatCompactNumber } from '@/lib/format';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { ActionButton } from '@/components/ui/ActionButton';
import { AcceptOfferDialogs } from '@/components/p2p/AcceptOfferDialogs';
import { useAcceptOffer } from '@/components/p2p/useAcceptOffer';
import {
  P2POffer,
  normalizeErrorMessage,
  useDeleteP2POfferMutation,
  useGetMeQuery,
  useGetP2POfferQuery,
  useGetP2PSettingsQuery,
  useUpdateP2POfferMutation,
} from '@/store/api';

/**
 * One offer's page -- the step a trader passes through before committing.
 *
 * Two reasons it exists, both from the market table: a Buy/Sell button on a
 * scrolling row is one mistap away from a real trade, and an accept straight
 * from the row left no record of the interest that did not convert. Merely
 * loading this page records the view (see P2PService.getOfferDetail).
 *
 * Committing happens here, on this page, and lands the trader on the
 * resulting trade so they can chat or manage it straight away. It shares
 * the market table's accept logic via useAcceptOffer rather than
 * reimplementing the OTP challenge, multi-account picker and
 * phone-verification gate, so the two paths cannot drift.
 *
 * This replaced a ?accept=<id> hand-off to the market view, which was
 * broken: the effect that consumed the param stripped it from the URL
 * before its offer fetch resolved, flipping its own dependency and firing
 * the cleanup that cancelled the accept. The button did nothing at all.
 */
export function OfferDetailView({ offerId }: { offerId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  // Both roles now have a real market route, so "back" and the ?accept=
  // hand-off are plain URLs rather than a query-param mode of another page.
  const marketHref = pathname?.startsWith('/distributor')
    ? '/distributor/market'
    : '/dashboard/markets';

  const { data: offer, isLoading, error } = useGetP2POfferQuery(offerId);
  const { data: me } = useGetMeQuery();
  const { data: settings } = useGetP2PSettingsQuery();
  const tradesBase = pathname?.startsWith('/distributor') ? '/distributor' : '/dashboard';
  // Straight to the new trade: that page is where payment, chat and dispute
  // live, so it is the only useful destination after committing.
  const flow = useAcceptOffer({
    onAccepted: (trade) => router.push(`${tradesBase}/trades/${trade.id}`),
  });

  const isOwnOffer = offer?.userId === me?.id;
  const isTradeable = offer?.status === 'ACTIVE';
  const priceEach =
    offer && Number(offer.tokenAmount) > 0
      ? Number(offer.fiatAmount) / Number(offer.tokenAmount)
      : 0;

  return (
    <div>
      <Link
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-extrabold text-muted hover:text-ink"
        href={marketHref}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to the market
      </Link>

      {isLoading && (
        <div className="grid place-items-center gap-3 py-16 text-center">
          <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
          <p className="font-bold text-muted">Loading this offer...</p>
        </div>
      )}

      {!isLoading && Boolean(error) && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {normalizeErrorMessage(error, 'This offer could not be loaded.')}
        </div>
      )}

      {offer && (
        <>
          <h1 className="mt-3 mb-5 text-2xl font-black tracking-normal md:text-3xl">
            {offer.type === 'SELL' ? 'Sell offer' : 'Buy request'}
          </h1>

          <div className={`${cardClass} grid gap-5 p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-3xl font-black">
                  {formatCompactNumber(offer.tokenAmount)} DL
                </p>
                <p className="mt-1 text-lg font-extrabold text-ink">
                  {Number(offer.fiatAmount).toLocaleString()} {offer.fiatCurrency}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {priceEach.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                  {offer.fiatCurrency} each
                </p>
              </div>
              <div className="grid justify-items-end gap-2">
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
                  {offer.status.toLowerCase()}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
                  <Eye className="size-3.5" aria-hidden="true" />
                  {offer.viewCount} view{offer.viewCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {offer.user && (
              <div className="grid gap-2 border-t border-line pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Trader</p>
                <div className="flex items-center gap-3">
                  <Avatar email={offer.user.email} />
                  <div>
                    <p className="font-bold text-ink">
                      {[offer.user.firstName, offer.user.lastName].filter(Boolean).join(' ') ||
                        offer.user.email}
                    </p>
                    <p className="text-xs text-muted">
                      {offer.completedSaleCount ?? 0} completed trade
                      {offer.completedSaleCount === 1 ? '' : 's'}
                      {offer.user.country && (
                        <>
                          {' · '}
                          <CountryFlag
                            code={offer.user.country.code}
                            name={offer.user.country.name}
                          />{' '}
                          {offer.user.country.name}
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-muted">
                      {offer.user.phoneVerified ? 'Phone verified' : 'Phone not verified'}
                      {' · '}
                      {offer.user.kycVerified ? 'KYC verified' : 'KYC not verified'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-2 border-t border-line pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Payment</p>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-bold text-ink">
                <CreditCard className="size-3.5 text-muted" aria-hidden="true" />
                {offer.paymentMethod.replace(/_/g, ' ')}
              </span>
              {offer.paymentMethods.length > 1 && (
                <p className="text-sm text-muted">
                  This trader accepts {offer.paymentMethods.length} accounts — you&rsquo;ll pick one
                  when you continue.
                </p>
              )}
            </div>

            <div className="grid gap-1 border-t border-line pt-4 text-sm text-muted">
              <p>Posted {formatDateTime(offer.createdAt)}.</p>
              {/* expiresAt is null for a standing post -- they no longer
                  expire, so there is nothing to count down to. */}
              {offer.status === 'ACTIVE' &&
                (offer.expiresAt ? (
                  <p>Expires {formatDateTime(offer.expiresAt)}.</p>
                ) : (
                  <p>Stays listed until you take it down.</p>
                ))}
            </div>

            <div className="border-t border-line pt-4">
              {isOwnOffer ? (
                <OwnerActions offer={offer} onDeleted={() => router.push(marketHref)} />
              ) : !isTradeable ? (
                <p className="text-sm font-bold text-muted">
                  This post is no longer available to trade.
                </p>
              ) : (
                <>
                  {flow.error && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                      {flow.error}
                    </div>
                  )}
                  <ActionButton
                    className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void flow.accept(offer)}
                    pending={flow.accepting}
                    pendingLabel="Starting trade"
                    type="button"
                  >
                    {offer.type === 'SELL' ? 'Buy this DL' : 'Sell DL to this trader'}
                  </ActionButton>
                  <p className="mt-2 text-xs text-muted">
                    You&rsquo;ll confirm before anything is committed
                    {settings?.paymentWindowMinutes
                      ? `, then aim to pay within ${settings.paymentWindowMinutes} minutes`
                      : ''}
                    .
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <AcceptOfferDialogs flow={flow} />
    </div>
  );
}

/**
 * Edit and delete, for the poster looking at their own post.
 *
 * Only shown while the post is still clean -- the server rejects an edit
 * once any trade has attached to it (see P2PService.loadEditableOffer), so
 * this hides the controls for the same cases rather than offering a button
 * that is going to fail. A post mid-trade is managed from the trade, not
 * from here.
 */
function OwnerActions({ offer, onDeleted }: { offer: P2POffer; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [tokenAmount, setTokenAmount] = useState(String(offer.tokenAmount));
  const [error, setError] = useState('');
  const [updateOffer, { isLoading: saving }] = useUpdateP2POfferMutation();
  const [deleteOffer, { isLoading: deleting }] = useDeleteP2POfferMutation();

  if (offer.status !== 'ACTIVE') {
    return (
      <p className="text-sm font-bold text-muted">
        This is your own post. It is in a trade now — manage it from My trades.
      </p>
    );
  }

  async function save() {
    setError('');
    const amount = Number(tokenAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    try {
      await updateOffer({ id: offer.id, tokenAmount: amount }).unwrap();
      setEditing(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not update this post'));
    }
  }

  async function remove() {
    if (!window.confirm('Delete this post? Any DL held for it is returned to your wallet.')) return;
    setError('');
    try {
      await deleteOffer(offer.id).unwrap();
      onDeleted();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not delete this post'));
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-bold text-muted">This is your own post.</p>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}
      {editing ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-bold">
            Amount (DL)
            <input
              autoFocus
              className="min-h-11 rounded-lg border border-line bg-bg px-3"
              inputMode="decimal"
              onChange={(e) => setTokenAmount(e.target.value)}
              value={tokenAmount}
            />
          </label>
          <p className="text-xs text-muted">
            The price is re-quoted at the current rate when you save.
          </p>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void save()}
              pending={saving}
              pendingLabel="Saving"
              type="button"
            >
              Save changes
            </ActionButton>
            <button
              className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted"
              onClick={() => {
                setEditing(false);
                setTokenAmount(String(offer.tokenAmount));
                setError('');
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted"
            onClick={() => setEditing(true)}
            type="button"
          >
            <Pencil className="size-4" aria-hidden="true" /> Edit post
          </button>
          <ActionButton
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 px-5 font-extrabold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void remove()}
            pending={deleting}
            pendingLabel="Deleting"
            type="button"
          >
            <Trash2 className="size-4" aria-hidden="true" /> Delete post
          </ActionButton>
        </div>
      )}
    </div>
  );
}
