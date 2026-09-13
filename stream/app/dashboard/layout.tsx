'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Search,
  ShieldCheck,
  Layers,
  KeyRound,
  Webhook,
  Users,
  CreditCard,
  LogOut,
  BarChart3,
  FileText,
  Fingerprint,
  Store,
  Bell,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { useGetOrganizationQuery } from '@/store/api';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/explore', label: 'Search', icon: Search },
  { href: '/dashboard/decks', label: 'Stream Decks', icon: Layers },
  { href: '/dashboard/validation', label: 'Validation', icon: ShieldCheck },
  { href: '/dashboard/analytics', label: 'API Usage', icon: BarChart3 },
  { href: '/dashboard/reports', label: 'Reports', icon: FileText },
  { href: '/dashboard/marketplace', label: 'Data Marketplace', icon: Store },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/dashboard/oauth-clients', label: 'OAuth Clients', icon: Fingerprint },
  { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/dashboard/team', label: 'Team', icon: Users },
  { href: '/dashboard/billing', label: 'Settings & Billing', icon: CreditCard },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { data: org } = useGetOrganizationQuery(undefined, { skip: status !== 'authenticated' });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname]);

  if (status !== 'authenticated') {
    return (
      <div className="stream-console flex min-h-screen items-center justify-center bg-bg">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  const displayName = session?.user?.name || session?.user?.email || 'Account';
  const initial = displayName.trim()[0]?.toUpperCase() ?? 'A';

  return (
    <div className="stream-console flex min-h-screen bg-bg text-ink">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-5 py-5">
          <BrandLogo size={28} textClassName="text-sm font-black" />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold no-underline transition-colors ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-muted hover:bg-surface-muted hover:text-ink'
                }`}
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line px-3 py-3">
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"
            onClick={() => setAccountMenuOpen((open) => !open)}
            type="button"
            aria-expanded={accountMenuOpen}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-black text-white">
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">
                {org?.name ?? 'Loading...'}
              </span>
              <span className="block truncate text-xs font-semibold uppercase tracking-wide text-muted">
                {org?.subscription?.plan.name ?? 'No plan'}
              </span>
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" />
          </button>
          {accountMenuOpen && (
            <button
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              onClick={() => void signOut({ callbackUrl: '/login' })}
              type="button"
            >
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b border-line bg-surface px-6 py-3">
          <button
            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            type="button"
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" className="size-4" />
          </button>
          <button
            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            type="button"
            aria-label="Help"
          >
            <HelpCircle aria-hidden="true" className="size-4" />
          </button>
          <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-black text-white">
            {initial}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
