'use client';

import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { usePortalContainer } from './PortalContainer';

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;

export function DropdownMenuContent({
  children,
  align = 'end',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'start' | 'end' | 'center';
  className?: string;
}) {
  const container = usePortalContainer();
  return (
    <RadixDropdown.Portal container={container}>
      <RadixDropdown.Content
        align={align}
        sideOffset={8}
        className={`z-50 grid min-w-48 gap-0.5 rounded-lg border border-line bg-white p-1.5 shadow-[0_16px_40px_rgba(27,31,27,0.18)] focus:outline-none data-[state=open]:animate-[scaleIn_120ms_ease-out] dark:bg-surface ${className}`}
      >
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  onMouseEnter,
  className = '',
  danger,
}: {
  children: React.ReactNode;
  onSelect?: (event: Event) => void;
  onMouseEnter?: () => void;
  className?: string;
  danger?: boolean;
}) {
  return (
    <RadixDropdown.Item
      onMouseEnter={onMouseEnter}
      onSelect={onSelect}
      className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-bold outline-none transition-colors data-[highlighted]:bg-surface-muted ${
        danger ? 'text-danger' : 'text-ink'
      } ${className}`}
    >
      {children}
    </RadixDropdown.Item>
  );
}

export function DropdownMenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <RadixDropdown.Label className={className ?? 'px-2.5 py-1.5 text-xs font-bold uppercase text-muted'}>
      {children}
    </RadixDropdown.Label>
  );
}

export function DropdownMenuSeparator() {
  return <RadixDropdown.Separator className="my-1 h-px bg-line" />;
}
