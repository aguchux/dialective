'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { BrandLogo } from '@/components/BrandLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: HomeIcon },
  { href: '/admin/users', label: 'Users', icon: UsersIcon },
  { href: '/admin/geo', label: 'Countries & Dialects', icon: GeoIcon },
  { href: '/admin/referrals', label: 'Referrals', icon: ReferralIcon },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const email = session?.user?.email ?? '';
  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="grid min-h-screen bg-surface-muted text-ink md:grid-cols-[240px_1fr]">
      <aside className="hidden flex-col gap-1 border-r border-line bg-[#151726] p-4 text-white md:flex">
        <div className="mb-4 px-1">
          <BrandLogo className="text-white" textClassName="text-base" size={32} />
        </div>
        <nav className="grid gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold no-underline transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          onClick={() => signOut({ callbackUrl: '/' })}
          type="button"
        >
          <SignOutIcon />
          Sign out
        </button>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <BrandLogo size={28} textClassName="text-sm" />
          </div>
          <span className="hidden text-lg font-black md:inline">Admin Panel</span>
          <div className="flex items-center gap-3">
            <button
              className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-surface-muted"
              type="button"
              aria-label="Notifications"
            >
              <BellIcon />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-muted">
                <span className="grid size-7 place-items-center rounded-full bg-accent text-sm font-black text-white">{initial}</span>
                <span className="hidden max-w-40 truncate text-sm font-bold sm:inline">{email}</span>
                <ChevronIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/')}>
                  <HomeIcon />
                  Back to site
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => signOut({ callbackUrl: '/' })}>
                  <SignOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-4 py-2 md:hidden">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold no-underline ${
                  active ? 'bg-accent text-white' : 'bg-surface-muted text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
      <path d="M15.5 5.5a3.25 3.25 0 0 1 0 6.4" strokeLinecap="round" />
      <path d="M17 14.2a6.5 6.5 0 0 1 4.5 5.8" strokeLinecap="round" />
    </svg>
  );
}

function GeoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.25" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReferralIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19V9l8-5 8 5v10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 19v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
