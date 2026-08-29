'use client';

import { type FormEvent, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  normalizeErrorMessage,
  useDeletePayoutAccountMutation,
  useRequestPayoutAccountDeleteOtpMutation,
} from '@/store/api';

const inputClass =
  'min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Deleting a payout account always requires email OTP confirmation (see
 * PayoutAccountsController.remove) -- shared between the standalone
 * /dashboard/payout-accounts page and the trainer dashboard's inline
 * profile-view payout list so both delete entry points go through the same
 * two-step confirm flow rather than deleting immediately.
 */
export function DeletePayoutAccountDialog({
  account,
  onClose,
}: {
  account: { id: string; label: string };
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestPayoutAccountDeleteOtpMutation();
  const [deleteAccount, { isLoading: isDeleting }] = useDeletePayoutAccountMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!otpRequestId) {
        const result = await requestOtp(account.id).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await deleteAccount({ id: account.id, otpRequestId, code }).unwrap();
      onClose();
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          otpRequestId ? 'Unable to verify this code.' : 'Unable to delete this payout account.',
        ),
      );
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          title="Enter your code"
          description={`We emailed a 6-digit code to confirm deleting ${account.label}.`}
        >
          <form className="grid gap-3" onSubmit={handleSubmit}>
            <input
              autoFocus
              className={`${inputClass} text-center text-lg font-bold tracking-[0.3em]`}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              value={code}
            />
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
              <ActionButton
                className={dangerButtonClass}
                disabled={code.length !== 6}
                pending={isDeleting}
                pendingLabel="Deleting"
                type="submit"
              >
                Confirm delete
              </ActionButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Delete this payout method?"
        description={`We'll email you a confirmation code before ${account.label} is permanently removed.`}
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
            <ActionButton
              className={dangerButtonClass}
              pending={isRequestingOtp}
              pendingLabel="Sending code"
              type="submit"
            >
              Send confirmation code
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
