'use client';

import { type FormEvent, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useReleaseAuditHoldMutation,
  useRequestAuditHoldReleaseOtpMutation,
} from '@/store/api';

const inputClass =
  'min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

/**
 * Shared OTP-gated (when PlatformSettings.adminPayoutOtpEnabled is on)
 * confirm dialog for AuthService.releaseAuditHold -- originally inline in
 * app/admin/users/[id]/page.tsx, extracted so the new audit-hold queue page
 * (app/admin/audit-hold/page.tsx) can trigger the same release flow
 * per-row without duplicating it.
 */
export function ReleaseAuditHoldDialog({
  user,
  onClose,
}: {
  user: { id: string };
  onClose: () => void;
}) {
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const otpRequired = platformSettings?.adminPayoutOtpEnabled ?? false;

  const [code, setCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestAuditHoldReleaseOtpMutation();
  const [releaseHold, { isLoading: isSubmitting }] = useReleaseAuditHoldMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (otpRequired && !otpRequestId) {
        const result = await requestOtp(user.id).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await releaseHold({ id: user.id, ...(otpRequestId ? { otpRequestId, code } : {}) }).unwrap();
      onClose();
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          otpRequestId ? 'Unable to verify this code.' : 'Unable to release this audit hold.',
        ),
      );
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          title="Enter your code"
          description="We emailed a 6-digit code to confirm this release."
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
              <p className="leading-relaxed text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
                Cancel
              </DialogClose>
              <ActionButton
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                disabled={code.length !== 6}
                pending={isSubmitting}
                pendingLabel="Confirming"
                type="submit"
              >
                Confirm
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
        title="Release this audit hold"
        description="The trainer will be able to start new training tasks again immediately, and will get an email letting them know."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              pending={isRequestingOtp || isSubmitting}
              pendingLabel={otpRequired ? 'Sending code' : 'Releasing'}
              type="submit"
            >
              {otpRequired ? 'Send confirmation code' : 'Release hold'}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
