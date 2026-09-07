'use client';

import * as RadixPopover from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { usePortalContainer } from './PortalContainer';

/**
 * Small (i) affordance that opens a short explanatory popover on click/tap --
 * built on @radix-ui/react-popover (already a dependency, see
 * WordTrainingDialog's suggestions popover) rather than a hover-only
 * tooltip, since hover has no equivalent on touch devices and this app is
 * used heavily on mobile.
 */
export function InfoTooltip({ label, text }: { label: string; text: string }) {
  const portalContainer = usePortalContainer();

  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger
        aria-label={`What is ${label}?`}
        className="grid size-4 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        onClick={(e) => e.stopPropagation()}
        type="button"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </RadixPopover.Trigger>
      <RadixPopover.Portal container={portalContainer}>
        <RadixPopover.Content
          align="start"
          className="z-60 w-[min(240px,80vw)] rounded-lg border border-line bg-surface p-3 text-xs font-medium leading-relaxed text-ink shadow-[0_12px_32px_rgba(27,31,27,0.15)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
          sideOffset={6}
        >
          {text}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
