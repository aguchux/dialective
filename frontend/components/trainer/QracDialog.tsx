'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { usePortalContainer } from '@/components/ui/PortalContainer';
import { QRAC_CHECKLIST } from '@/lib/qrac-checklist';
import { normalizeErrorMessage, useSignQracMutation } from '@/store/api';

/**
 * The periodic Quality Recordings Affirmation Check (QRAC). Deliberately NOT
 * built on the shared Dialog/DialogContent (see components/ui/Dialog.tsx) --
 * this one must not be dismissable via backdrop click, Escape, or a close
 * button, since it's blocking an already-open, actively-recording session
 * that must be resolved (signed or explicitly ended), not casually closed.
 */
export function QracDialog({
  open,
  sessionId,
  onSigned,
  onEndSession,
}: {
  open: boolean;
  sessionId: string | null;
  /** Fires after a successful sign -- the parent reopens WordTrainingDialog, which resumes the same session. */
  onSigned: () => void;
  /** Trainer opted to stop instead of continuing -- parent ends the session and closes everything. */
  onEndSession: () => void;
}) {
  const portalContainer = usePortalContainer();
  const [checked, setChecked] = useState<boolean[]>(() => QRAC_CHECKLIST.map(() => false));
  const [error, setError] = useState<string | null>(null);
  const [signQrac, { isLoading }] = useSignQracMutation();

  useEffect(() => {
    if (!open) return;
    setChecked(QRAC_CHECKLIST.map(() => false));
    setError(null);
  }, [open]);

  const allChecked = checked.every(Boolean);

  async function handleSubmit() {
    if (!sessionId || !allChecked) return;
    setError(null);
    try {
      await signQrac(sessionId).unwrap();
      onSigned();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to record your affirmation. Try again.'));
    }
  }

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal container={portalContainer}>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <RadixDialog.Content
          className="fixed left-1/2 top-1/2 z-50 grid max-h-[85vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-[0_20px_50px_rgba(27,31,27,0.25)] focus:outline-none data-[state=open]:animate-[scaleIn_150ms_ease-out] dark:bg-surface"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="grid gap-1">
            <RadixDialog.Title className="text-xl font-black">
              Quality recording check-in
            </RadixDialog.Title>
            <RadixDialog.Description className="text-sm text-muted">
              Confirm each statement below to continue this training session.
            </RadixDialog.Description>
          </div>

          <div className="grid gap-2">
            {QRAC_CHECKLIST.map((item, index) => (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-3.5"
                key={item}
              >
                <input
                  checked={checked[index]}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                  onChange={(e) =>
                    setChecked((prev) => prev.map((v, i) => (i === index ? e.target.checked : v)))
                  }
                  type="checkbox"
                />
                <span className="leading-relaxed text-ink">{item}</span>
              </label>
            ))}
          </div>

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-lg px-3.5 py-2.5 font-bold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              onClick={onEndSession}
              type="button"
            >
              End session instead
            </button>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!allChecked}
              onClick={handleSubmit}
              pending={isLoading}
              pendingLabel="Confirming"
              type="button"
            >
              Confirm and continue
            </ActionButton>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
