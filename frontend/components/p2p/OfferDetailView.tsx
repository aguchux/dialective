'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, CreditCard, Eye, LoaderCircle } from 'lucide-react';
import { Avatar, cardClass, formatDateTime } from '@/components/dashboard/shared';
import { countryFlagEmoji, formatCompactNumber } from '@/lib/format';
import {
  normalizeErrorMessage,
  useGetMeQuery,
  useGetP2POfferQuery,
  useGetP2PSettingsQuery,
} from '@/store/api';

/**
 * One offer's page -- the step a trader passes through before committing.
 *
 * Two reasons it exists, both from the market table: a Buy/Sell button on a
 * scrolling row is one mistap away from a real trade, and an accept straight
 * from the row left no record of the interest that did not convert. Merely
 * loading this page records the view (see P2PService.getOfferDetail).
 *
 * The commit button hands off to the market view via ?accept=<id> rather
 * than accepting here: the OTP challenge, multi-account picker and
 * phone-verification gate all live there, and a second implementation is
 * how the two would drift apart.
 */
export function OfferDetailView({ offerId }: { offerId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  // The two roles reach the market differently: the distributor has a real
  // /distributor/market route, while for a trainer it is a view inside the
  // dashboard (/dashboard?view=market), not a route of its own.
  const isDistributor = pathname?.startsWith('/distributor');
  const marketHref = isDistributor ? '/distributor/market' : '/dashboard?view=market';

  const { data: offer, isLoading, error } = useGetP2POfferQuery(offerId);
  const { data: me } = useGetMeQuery();
  const { data: settings } = useGetP2PSettingsQuery();

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
                          <span aria-hidden="true">
                            {countryFlagEmoji(offer.user.country.code) ?? '🌐'}
                          </span>{' '}
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
              {offer.status === 'ACTIVE' && <p>Expires {formatDateTime(offer.expiresAt)}.</p>}
            </div>

            <div className="border-t border-line pt-4">
              {isOwnOffer ? (
                <p className="text-sm font-bold text-muted">
                  This is your own post. Manage it from your market activity.
                </p>
              ) : !isTradeable ? (
                <p className="text-sm font-bold text-muted">
                  This post is no longer available to trade.
                </p>
              ) : (
                <>
                  <button
                    className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 font-extrabold text-white hover:bg-accent-dark"
                    onClick={() =>
                      router.push(
                        `${marketHref}${marketHref.includes('?') ? '&' : '?'}accept=${offer.id}`,
                      )
                    }
                    type="button"
                  >
                    {offer.type === 'SELL' ? 'Buy this DL' : 'Sell DL to this trader'}
                  </button>
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
    </div>
  );
}
