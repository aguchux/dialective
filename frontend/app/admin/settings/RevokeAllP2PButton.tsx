'use client';

import { useState } from 'react';
import { AlertTriangle, KeyRound, Trash2 } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useRequestRevokeAllP2POtpMutation,
  useRevokeAllP2PMutation,
  type P2PRevokeAllPreview,
  type P2PRevokeAllResult,
} from '@/store/api';

const fieldClass =
  'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent';

function formatTokens(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value;
}

/**
 * Clearing the market so new settings apply to everything.
 *
 * Trade limits, currencies and payment methods are validated at post time,
 * so listings placed under the old rules keep sitting there under the new
 * ones. This cancels them and returns the escrow.
 *
 * Two-step on purpose, like every other action here that moves escrow: the
 * admin reads a concrete scope, then confirms it with a code bound to that
 * scope. The button that does the thing does not exist until the code has
 * been issued, so a stray click is harmless rather than merely discouraged.
 */
export function RevokeAllP2PButton() {
  const [requestOtp, { isLoading: isRequesting }] = useRequestRevokeAllP2POtpMutation();
  const [revokeAll, { isLoading: isRevoking }] = useRevokeAllP2PMutation();

  const [preview, setPreview] = useState<P2PRevokeAllPreview | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<P2PRevokeAllResult | null>(null);
  const [error, setError] = useState('');

  function reset() {
    setPreview(null);
    setOtpRequestId(null);
    setCode('');
    setError('');
  }

  async function handleStart() {
    setError('');
    setResult(null);
    try {
      const issued = await requestOtp().unwrap();
      setPreview(issued.preview);
      setOtpRequestId(issued.otpRequestId);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not start a revoke.'));
    }
  }

  async function handleConfirm() {
    setError('');
    try {
      const outcome = await revokeAll({
        otpRequestId: otpRequestId ?? undefined,
        code: code.trim() || undefined,
      }).unwrap();
      setResult(outcome);
      reset();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not revoke the market.'));
    }
  }

  return (
    <div className="grid justify-items-end gap-2">
      {!preview ? (
        <ActionButton
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-300 px-4 font-extrabold text-red-700 hover:bg-red-50"
          onClick={handleStart}
          pending={isRequesting}
          type="button"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Revoke All P2P
        </ActionButton>
      ) : (
        <div className="w-full max-w-md rounded-lg border border-red-300 bg-red-50 p-4 text-left">
          <p className="flex items-start gap-2 font-extrabold text-red-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            This will clear the market
          </p>

          <ul className="mt-3 grid gap-1.5 text-sm text-red-900">
            <li>
              Cancel <strong>{preview.sellOfferCount.toLocaleString()}</strong> sell offers and{' '}
              <strong>{preview.buyOfferCount.toLocaleString()}</strong> buy requests
            </li>
            {preview.staleTradeCount > 0 ? (
              <li>
                Refund <strong>{preview.staleTradeCount.toLocaleString()}</strong> abandoned trades
                (marked paid over {Math.round(preview.disputeWindowMinutes / 60)}h ago, no dispute)
              </li>
            ) : null}
            <li>
              Return <strong>{formatTokens(preview.tokensToRefund)} DL</strong> to the sellers who
              posted it
            </li>
          </ul>

          {preview.skippedTradeCount > 0 ? (
            <p className="mt-3 border-t border-red-200 pt-3 text-sm leading-relaxed text-red-900">
              <strong>{preview.skippedTradeCount.toLocaleString()} trades</strong> holding{' '}
              {formatTokens(preview.skippedTradeTokens)} DL will be left alone
              {preview.disputedTradeCount > 0
                ? ` (${preview.disputedTradeCount} under dispute)`
                : ''}
              . Their buyers can still raise a dispute, and cancelling would take that away.
              Resolve those individually from the trades table.
            </p>
          ) : null}

          <label className="mt-4 grid gap-1.5">
            <span className="text-sm font-bold text-red-900">Confirmation code</span>
            <input
              autoComplete="one-time-code"
              className={fieldClass}
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code sent to your email"
              value={code}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
              disabled={code.trim().length === 0}
              onClick={handleConfirm}
              pending={isRevoking}
              type="button"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Confirm revoke
            </ActionButton>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 font-extrabold hover:border-accent"
              onClick={reset}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result ? (
        <p className="w-full max-w-md rounded-lg bg-green-50 p-3 text-left text-sm font-bold text-green-700">
          Cancelled {result.cancelledSellOffers} sell offers and {result.cancelledBuyOffers} buy
          requests
          {result.refundedTradeCount > 0
            ? `, refunded ${result.refundedTradeCount} abandoned trades`
            : ''}
          . Returned {formatTokens(result.tokensRefunded)} DL.
          {result.skippedTradeCount > 0
            ? ` Left ${result.skippedTradeCount} in-flight trades untouched.`
            : ''}
          {result.failedCount > 0 ? ` ${result.failedCount} failed — see the API logs.` : ''}
        </p>
      ) : null}

      {error ? (
        <p className="w-full max-w-md rounded-lg bg-red-50 p-3 text-left text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
