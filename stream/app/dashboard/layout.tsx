'use client';

import { ReactNode, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Search, ShieldCheck, Layers, KeyRound, Webhook, Users, CreditCard, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/explore', label: 'Explore Voice Data', icon: Search },
  { href: '/dashboard/validation', label: 'Validation', icon: ShieldCheck },
  { href: '/dashboard/decks', label: 'Stream Decks', icon: Layers },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/dashboard/team', label: 'Team', icon: Users },
  { href: '/dashboard/billing', label: 'Subscription & Billing', icon: CreditCard },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Dialect Library</p>
          <p className="text-lg font-black text-ink">Voice Stream</p>
        </div>
        <nav className="flex-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                className={`mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
                  active ? 'bg-accent-soft text-accent-dark' : 'text-muted hover:bg-surface-muted'
                }`}
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-3 py-4">
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold text-muted transition-colors hover:bg-surface-muted"
            onClick={() => void signOut({ callbackUrl: '/login' })}
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
