'use client';

import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { normalizeErrorMessage } from '@/store/api';

const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Bulk enable/disable is non-destructive and fully reversible (unlike
 * BulkDeleteDialog's cascade-delete, which loses trainer submission
 * history) -- a plain confirm is enough, no typed-confirmation phrase.
 */
export function BulkSetDisabledDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<{ updated: number }>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ updated: number } | null>(null);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      setResult(await onConfirm());
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to complete this bulk update.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent title="Update complete" description={`Updated ${result.updated}.`}>
          <div className="flex justify-end">
            <button className={secondaryButtonClass} onClick={onClose} type="button">
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description={description}>
        <div className="grid gap-3">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
            <ActionButton
              className={primaryButtonClass}
              onClick={() => void handleConfirm()}
              pending={isSubmitting}
              pendingLabel="Updating"
              type="button"
            >
              {confirmLabel}
            </ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
