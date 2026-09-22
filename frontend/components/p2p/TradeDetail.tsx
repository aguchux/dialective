'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Clock, Copy } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass, formatDateTime } from '@/components/dashboard/shared';
import { WhatsAppContactLink } from '@/components/WhatsAppContactLink';
import { PaymentCountdown } from '@/components/p2p/PaymentCountdown';
import { statusBadgeClass, statusLabelForViewer } from '@/components/p2p/tradeStatus';
import { formatCompactNumber } from '@/lib/format';
import { P2PTrade, normalizeErrorMessage } from '@/store/api';

/**
 * Everything about one trade: counterparty, payment details, countdown,
 * status history, and the act/cancel/release controls.
 *
 * Previously this was the body of a card in the My-trades list, which meant
 * the whole list rendered every trade's full payment detail at once. The
 * list is now a table of rows with a View CTA, and this is what that CTA
 * opens -- so the detail lives in exactly one place and the list stays
 * scannable.
 */

const OPEN_TRADE_STATUSES = new Set(['AWAITING_PAYMENT', 'PAID_MARKED', 'CANCEL_PENDING']);

export function buildP2PWhatsAppMessage({
  trade,
  senderRole,
  recipientName,
}: {
  trade: P2PTrade;
  senderRole: 'buyer' | 'seller';
  recipientName: string;
}): string {
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const otherRole = senderRole === 'buyer' ? 'seller' : 'buyer';

  return [
    greeting,
    `I am the ${senderRole} contacting you about our Dialect Library P2P trade ${trade.id}.`,
    `Trade: ${trade.tokenAmount} DL for ${trade.fiatAmount} ${trade.fiatCurrency}.`,
    `You are the ${otherRole}. Please keep payment confirmation, DL release, cancellation, and disputes inside Dialect Library. Do not share passwords or OTP codes.`,
  ].join('\n');
}

export function TradeDetail({
  trade,
  viewerId,
  markingPaid,
  releasing,
  cancelling,
  onMarkPaid,
  onRelease,
  onCancel,
  onRaiseDispute,
}: {
  trade: P2PTrade;
  viewerId: string | undefined;
  markingPaid: boolean;
  releasing: boolean;
  cancelling: boolean;
  onMarkPaid: (id: string) => Promise<unknown>;
  onRelease: (id: string) => Promise<unknown>;
  onCancel: (id: string) => Promise<unknown>;
  onRaiseDispute: () => void;
}) {
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const isBuyer = trade.buyerId === viewerId;
  const isSeller = trade.sellerId === viewerId;
  const isOpen = OPEN_TRADE_STATUSES.has(trade.status);

  const canMarkPaid =
    isBuyer && (trade.status === 'AWAITING_PAYMENT' || trade.status === 'CANCEL_PENDING');
  const canRelease = isSeller && trade.status === 'PAID_MARKED';
  const canRequestCancel = isOpen && trade.status !== 'PAID_MARKED';
  // Once paid, a dispute is the ONLY way out -- request-cancel is rejected
  // server-side from PAID_MARKED (see P2PService.requestCancel).
  const canDispute = isOpen && trade.status !== 'DISPUTED';

  async function run(action: (id: string) => Promise<unknown>) {
    setActionError('');
    try {
      await action(trade.id);
    } catch (err) {
      setActionError(normalizeErrorMessage(err, 'Action failed'));
    }
  }

  const otherParty = isBuyer ? trade.seller : trade.buyer;
  const otherPartyName = [otherParty.firstName, otherParty.lastName].filter(Boolean).join(' ');
  const whatsAppMessage = buildP2PWhatsAppMessage({
    trade,
    senderRole: isBuyer ? 'buyer' : 'seller',
    recipientName: otherPartyName,
  });

  return (
    <div className={`${cardClass} grid gap-4 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-muted">
            {trade.offerType === 'SELL' ? 'Sell offer trade' : 'Buy request trade'} · You are the{' '}
            {isBuyer ? 'buyer' : 'seller'}
          </p>
          <p className="text-2xl font-black">
            {formatCompactNumber(trade.tokenAmount)} · {Number(trade.fiatAmount).toLocaleString()}{' '}
            {trade.fiatCurrency}
          </p>
        </div>
        <div className="grid justify-items-end gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-black ${statusBadgeClass(trade.status)}`}
          >
            {statusLabelForViewer(trade, viewerId)}
          </span>
          {/* The live clock belongs in the header, not buried below the
              payment details: on an unpaid trade it is the single most
              time-critical thing on the page. */}
          {trade.status === 'AWAITING_PAYMENT' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-muted px-2.5 py-1.5">
              <Clock className="size-4 text-muted" aria-hidden="true" />
              <PaymentCountdown compact deadline={trade.paymentDeadlineAt} isSeller={isSeller} />
            </span>
          )}
        </div>
      </div>

      {otherParty.phoneNumber ? (
        <WhatsAppContactLink
          className="text-sm font-bold"
          firstName={otherParty.firstName}
          lastName={otherParty.lastName}
          phoneNumber={otherParty.phoneNumber}
          prefilledMessage={whatsAppMessage}
        />
      ) : (
        <p className="text-sm text-muted">
          {isBuyer ? 'Seller' : 'Buyer'} hasn&rsquo;t added a phone number yet.
        </p>
      )}

      {trade.sellerPaymentMethod &&
        (() => {
          const method = trade.sellerPaymentMethod;
          const isBank = method.type === 'BANK';
          // Real number when decryption succeeded (the normal case); falls
          // back to the masked column only if it didn't -- see
          // P2PSellerPaymentMethod's doc comment.
          const number = isBank
            ? (method.accountNumber ?? method.accountNumberMasked)
            : (method.mobileMoneyNumber ?? method.mobileMoneyNumberMasked);

          function handleCopy() {
            if (!number) return;
            void navigator.clipboard.writeText(number).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }

          return (
            <div className="rounded-lg border border-line bg-bg p-3 text-sm">
              <p className="font-black">Seller payment details -- pay this account</p>
              <p className="mt-1">
                {isBank ? (method.bankName ?? method.bankCode) : method.mobileMoneyNetwork}
                {method.accountName && <> · {method.accountName}</>}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-base font-black tracking-wide">{number}</span>
                {number && (
                  <button
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-bold text-ink hover:bg-surface-muted"
                    onClick={handleCopy}
                    type="button"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-emerald-600" aria-hidden="true" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" aria-hidden="true" /> Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              {trade.sellerPaymentInstructions && (
                <p className="mt-1 text-muted">{trade.sellerPaymentInstructions}</p>
              )}
            </div>
          );
        })()}

      {trade.status === 'AWAITING_PAYMENT' && (
        <div className="grid gap-0.5">
          <PaymentCountdown deadline={trade.paymentDeadlineAt} isSeller={isSeller} />
          <p className="text-xs text-muted">Target: {formatDateTime(trade.paymentDeadlineAt)}</p>
        </div>
      )}
      {trade.status === 'PAID_MARKED' && trade.paidAt && (
        <p className="text-sm text-muted">
          Buyer marked paid {formatDateTime(trade.paidAt)}
          {isSeller
            ? ' — confirm and release when you have received payment.'
            : ' — waiting for the seller to release.'}
        </p>
      )}
      {trade.status === 'RELEASED' && trade.releasedAt && (
        <p className="text-sm text-muted">Released {formatDateTime(trade.releasedAt)}.</p>
      )}
      {trade.status === 'CANCELLED' && trade.cancelledAt && (
        <p className="text-sm text-muted">Cancelled {formatDateTime(trade.cancelledAt)}.</p>
      )}
      {trade.status === 'CANCEL_PENDING' && trade.cancelAvailableAt && (
        <p className="text-sm text-muted">
          {trade.cancelRequestedByUserId === viewerId
            ? 'You requested'
            : 'The other party requested'}{' '}
          cancellation — finalizes {formatDateTime(trade.cancelAvailableAt)} unless the buyer pays
          first.
        </p>
      )}
      {trade.status === 'DISPUTED' && (
        <p className="text-sm text-muted">An admin is reviewing this trade.</p>
      )}

      {actionError && <p className="text-sm font-bold text-danger">{actionError}</p>}

      <div className="flex flex-wrap gap-2">
        {canMarkPaid && (
          <ActionButton
            className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(onMarkPaid)}
            pending={markingPaid}
            pendingLabel="Marking paid"
            type="button"
          >
            I have paid
          </ActionButton>
        )}
        {canRelease && (
          <ActionButton
            className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(onRelease)}
            pending={releasing}
            pendingLabel="Releasing"
            type="button"
          >
            Release DL
          </ActionButton>
        )}
        {canRequestCancel && (
          <ActionButton
            className="min-h-10 rounded-lg border border-line px-3 font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(onCancel)}
            pending={cancelling}
            pendingLabel="Requesting"
            type="button"
          >
            Request cancel
          </ActionButton>
        )}
        {/* The conversation is the page body now, so this replaces the old
            "Conversation" CTA. It only opens a confirmation -- raising a
            dispute is never one click. */}
        {canDispute && (
          <button
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-extrabold text-red-700 hover:bg-red-50"
            onClick={onRaiseDispute}
            type="button"
          >
            <AlertTriangle className="size-4" aria-hidden="true" /> Raise a dispute
          </button>
        )}
      </div>
    </div>
  );
}
