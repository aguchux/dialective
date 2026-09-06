'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { usePortalContainer } from './PortalContainer';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

export function DialogContent({
  title,
  description,
  children,
  preventClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /**
   * Disables Escape, outside-click, and the X button -- for a step where the
   * user has been shown something (e.g. a one-time code) they must act on
   * before this dialog may close, so there's no way to dismiss it into a
   * silent dead end. Use sparingly: the flow must offer its own explicit
   * cancel affordance when this is set.
   */
  preventClose?: boolean;
}) {
  const container = usePortalContainer();
  return (
    <RadixDialog.Portal container={container}>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
      <RadixDialog.Content
        className="fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_20px_50px_rgba(27,31,27,0.25)] focus:outline-none data-[state=open]:animate-[scaleIn_150ms_ease-out] dark:bg-surface"
        onEscapeKeyDown={preventClose ? (e) => e.preventDefault() : undefined}
        onInteractOutside={preventClose ? (e) => e.preventDefault() : undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="grid gap-1">
          <RadixDialog.Title className="text-xl font-black">{title}</RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="text-sm text-muted">
              {description}
            </RadixDialog.Description>
          )}
        </div>

        {children}

        {!preventClose && (
          <RadixDialog.Close
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon />
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export const DialogClose = RadixDialog.Close;

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
