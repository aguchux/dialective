'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ChevronDown,
  ClipboardCheck,
  CircleDollarSign,
  Layers,
  LogOut,
  ShieldCheck,
  User as UserIcon,
  WalletCards,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Avatar } from '@/components/dashboard/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

/**
 * The validator dashboard's tab views, rendered inline by
 * ValidatorDashboard.tsx via `?view=`. Mirrors DashboardShell's DashboardView
 * pattern for the trainer dashboard.
 */
export type ValidatorView = 'decks' | 'tokens' | 'earnings' | 'validations' | 'audit' | 'profile';

export const validatorViews: { id: ValidatorView; label: string; icon: typeof WalletCards }[] = [
  { id: 'decks', label: 'Stream Decks', icon: Layers },
  { id: 'tokens', label: 'Tokens', icon: WalletCards },
  { id: 'earnings', label: 'Earnings', icon: CircleDollarSign },
  { id: 'validations', label: 'Validations', icon: ClipboardCheck },
  { id: 'audit', label: 'Audit', icon: ShieldCheck },
];

export function ValidatorHeader({
  activeView,
  displayName,
  email,
  image,
}: {
  activeView: ValidatorView | null;
  displayName: string;
  email: string;
  image?: string | null;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <BrandLogo
          href="/validator"
          size={34}
          className="text-base"
          textClassName="hidden font-black sm:inline"
        />
        <nav className="hidden h-full items-stretch lg:flex" aria-label="Validator dashboard">
          {validatorViews.map((view) => (
            <ValidatorNavLink active={activeView === view.id} key={view.id} view={view} />
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-1.5 pr-2 text-left hover:bg-surface-muted"
                type="button"
              >
                <Avatar email={email} image={image} />
                <span className="hidden max-w-32 truncate text-sm font-bold text-ink sm:inline">
                  {displayName}
                </span>
                <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden="true" />
                <span className="sr-only">Open account menu</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="px-2.5 py-1.5">
                <p className="truncate text-sm font-extrabold text-ink">{displayName}</p>
                <p className="truncate text-xs font-medium text-muted">{email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/validator?view=profile')}>
                <UserIcon className="size-4" aria-hidden="true" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem danger onSelect={() => signOut({ callbackUrl: '/' })}>
                <LogOut className="size-4" aria-hidden="true" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function ValidatorNavLink({
  active,
  view,
}: {
  active: boolean;
  view: (typeof validatorViews)[number];
}) {
  const Icon = view.icon;
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-w-24 items-center justify-center gap-2 px-3 text-sm font-bold transition-colors ${
        active ? 'text-accent' : 'text-muted hover:text-ink'
      }`}
      href={`/validator?view=${view.id}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {view.label}
      {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent" />}
    </Link>
  );
}

export function ValidatorMobileNavigation({ activeView }: { activeView: ValidatorView | null }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Validator dashboard"
    >
      {validatorViews.map((view) => {
        const Icon = view.icon;
        const active = view.id === activeView;
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold ${active ? 'text-accent' : 'text-muted'}`}
            href={`/validator?view=${view.id}`}
            key={view.id}
          >
            <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
            <span className="max-w-full truncate">{view.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
