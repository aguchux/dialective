'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { ArrowRight, BookOpenCheck, MessagesSquare, ShieldCheck, X } from 'lucide-react';
import { usePortalContainer } from '@/components/ui/PortalContainer';

/**
 * First screen a trainer sees when starting a task -- extracted out of
 * WordTrainingDialog's old `step === 'select'` block so it can route to
 * either WordTrainingDialog or DomainConversationDialog, both of which now
 * open already past selection. Add a new card here for any future task
 * type.
 */
export function TaskPickerDialog({
  open,
  onOpenChange,
  onSelectWordTraining,
  onSelectDomainConversation,
  onSelectDialectValidation,
  domainConversationEnabled,
  dialectValidationEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectWordTraining: () => void;
  onSelectDomainConversation: () => void;
  onSelectDialectValidation: () => void;
  domainConversationEnabled: boolean;
  dialectValidationEnabled: boolean;
}) {
  const portalContainer = usePortalContainer();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={portalContainer}>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/65 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <RadixDialog.Content
          aria-describedby="task-picker-description"
          className="fixed inset-0 z-50 overflow-y-auto bg-bg text-ink focus:outline-none data-[state=open]:animate-[fadeIn_150ms_ease-out]"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
            <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 md:px-6">
              <div className="min-w-0">
                <RadixDialog.Title className="truncate text-lg font-black">
                  Choose a task
                </RadixDialog.Title>
                <RadixDialog.Description
                  className="truncate text-xs font-semibold text-muted"
                  id="task-picker-description"
                >
                  Voice contribution session
                </RadixDialog.Description>
              </div>
              <button
                aria-label="Close"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-surface-muted"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-5xl content-center px-4 py-8 md:px-6">
            <section className="mx-auto grid w-full max-w-xl gap-6">
              <div>
                <p className="text-sm font-extrabold text-accent">Select task</p>
                <h2 className="mt-1 text-3xl font-black">Choose your training task</h2>
              </div>
              <button
                className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border-2 border-accent bg-surface p-5 text-left shadow-[0_12px_32px_rgba(88,28,135,0.10)]"
                onClick={onSelectWordTraining}
                type="button"
              >
                <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent">
                  <BookOpenCheck className="size-6" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-lg font-black">Word training</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">
                    Translation, pronunciation, and reverse validation.
                  </span>
                </span>
                <ArrowRight className="size-5 text-accent" aria-hidden="true" />
              </button>
              {domainConversationEnabled && (
                <button
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border-2 border-accent bg-surface p-5 text-left shadow-[0_12px_32px_rgba(88,28,135,0.10)]"
                  onClick={onSelectDomainConversation}
                  type="button"
                >
                  <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent">
                    <MessagesSquare className="size-6" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-lg font-black">Domain Conversation</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">
                      Record a short conversation in an everyday scenario, in your own dialect.
                    </span>
                  </span>
                  <ArrowRight className="size-5 text-accent" aria-hidden="true" />
                </button>
              )}
              {dialectValidationEnabled && (
                <button
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border-2 border-accent bg-surface p-5 text-left shadow-[0_12px_32px_rgba(88,28,135,0.10)]"
                  onClick={onSelectDialectValidation}
                  type="button"
                >
                  <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent">
                    <ShieldCheck className="size-6" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-lg font-black">Dialect Validation</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">
                      Listen to a peer&apos;s recording in your dialect and confirm the word.
                    </span>
                  </span>
                  <ArrowRight className="size-5 text-accent" aria-hidden="true" />
                </button>
              )}
            </section>
          </main>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
