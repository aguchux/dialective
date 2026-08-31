'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Download,
  FileBarChart,
  FileText as FileTextIcon,
  GraduationCap,
  Landmark,
  LogOut,
  Megaphone,
  MessageSquareQuote,
  Mic2,
  Shield as ShieldIcon,
  Star,
  User as UserIcon,
  Users,
  WalletCards,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { requestPwaInstall } from '@/components/PwaInstallPrompt';
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
 * The trainer dashboard's tab views, rendered inline by TrainerDashboard.tsx
 * via `?view=`. A page reached by full navigation instead (e.g. /dashboard/
 * reports, /dashboard/payout-accounts) has no matching view id -- pass
 * `activeView={null}` in that case so no tab is highlighted.
 */
export type DashboardView =
  | 'home'
  | 'tokens'
  | 'earnings'
  | 'training'
  | 'market'
  | 'referrals'
  | 'campaigns'
  | 'testimonials'
  | 'scores'
  | 'profile'
  | 'notifications';

export const dashboardViews: { id: DashboardView; label: string; icon: typeof WalletCards }[] = [
  { id: 'tokens', label: 'Tokens', icon: WalletCards },
  { id: 'earnings', label: 'Earnings', icon: CircleDollarSign },
  { id: 'training', label: 'Training', icon: Mic2 },
  { id: 'market', label: 'Market', icon: Landmark },
  { id: 'scores', label: 'My Scores', icon: Star },
];

export function DashboardHeader({
  activeView,
  displayName,
  email,
  image,
}: {
  activeView: DashboardView | null;
  displayName: string;
  email: string;
  image?: string | null;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <BrandLogo
          href="/dashboard"
          size={34}
          className="text-base"
          textClassName="hidden font-black sm:inline"
        />
        <nav className="hidden h-full items-stretch lg:flex" aria-label="Trainer dashboard">
          {dashboardViews.map((view) => (
            <DashboardNavLink active={activeView === view.id} key={view.id} view={view} />
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {activeView !== 'home' && (
            <Link
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-sm font-bold text-accent transition-colors hover:bg-surface-muted"
              href="/dashboard"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
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
              <DropdownMenuItem onSelect={() => router.push('/dashboard?view=profile')}>
                <UserIcon className="size-4" aria-hidden="true" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/dashboard/reports')}>
                <FileBarChart className="size-4" aria-hidden="true" /> Reports
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/dashboard?view=referrals')}>
                <Users className="size-4" aria-hidden="true" /> Referrals
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/dashboard?view=campaigns')}>
                <Megaphone className="size-4" aria-hidden="true" /> Campaigns
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/dashboard?view=testimonials')}>
                <MessageSquareQuote className="size-4" aria-hidden="true" /> Testimonials
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/learn')}>
                <GraduationCap className="size-4" aria-hidden="true" /> Learning Center
              </DropdownMenuItem>
              <DropdownMenuItem danger onSelect={() => signOut({ callbackUrl: '/' })}>
                <LogOut className="size-4" aria-hidden="true" /> Logout
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => requestPwaInstall()}>
                <Download className="size-4" aria-hidden="true" /> Install app
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/privacy')}>
                <ShieldIcon className="size-4" aria-hidden="true" /> Privacy Policy
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/terms')}>
                <FileTextIcon className="size-4" aria-hidden="true" /> Terms of Use
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function DashboardNavLink({
  active,
  view,
}: {
  active: boolean;
  view: (typeof dashboardViews)[number];
}) {
  const Icon = view.icon;
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-w-24 items-center justify-center gap-2 px-3 text-sm font-bold transition-colors ${
        active ? 'text-accent' : 'text-muted hover:text-ink'
      }`}
      href={`/dashboard?view=${view.id}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {view.label}
      {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent" />}
    </Link>
  );
}

export function emailName(email?: string | null) {
  if (!email) return 'Trainer';
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function MobileNavigation({ activeView }: { activeView: DashboardView | null }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Trainer dashboard"
    >
      {dashboardViews.map((view) => {
        const Icon = view.icon;
        const active = view.id === activeView;
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold ${active ? 'text-accent' : 'text-muted'}`}
            href={`/dashboard?view=${view.id}`}
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
