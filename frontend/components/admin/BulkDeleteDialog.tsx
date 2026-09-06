'use client';

import { type FormEvent, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { normalizeErrorMessage } from '@/store/api';

const inputClass =
  'min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60';

const CONFIRM_PHRASE = 'DELETE';

/**
 * Shared typed-confirmation dialog for any destructive bulk action whose
 * blast radius isn't obvious from a single click -- e.g. deleting a Word or
 * Sentence cascades and takes its WordRecordings/WordTrainingAssignments
 * (real trainer submission/settlement history) with it, so a misclick on
 * "Clear All" is materially worse than a misclick on a single row's Delete.
 */
export function BulkDeleteDialog({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<{ deleted: number; skipped: number }>;
  onClose: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to complete this bulk delete.'));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description={description}>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-bold" htmlFor="bulk-delete-confirm">
            Type {CONFIRM_PHRASE} to confirm
          </label>
          <input
            autoComplete="off"
            autoFocus
            className={inputClass}
            id="bulk-delete-confirm"
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            value={phrase}
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
              disabled={phrase !== CONFIRM_PHRASE}
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
