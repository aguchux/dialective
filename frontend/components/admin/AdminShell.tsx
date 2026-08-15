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
  { href: '/admin/data-access', label: 'Data Access Leads', icon: LeadsIcon },
  { href: '/admin/geo', label: 'Coverage', icon: GeoIcon },
  { href: '/admin/words', label: 'Words', icon: WordsIcon },
  { href: '/admin/referrals', label: 'Referrals', icon: ReferralIcon },
  { href: '/admin/p2p', label: 'P2P Market', icon: P2PIcon },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: WithdrawalsIcon },
  { href: '/admin/pools', label: 'Reward Pool', icon: PoolIcon },
  { href: '/admin/blog', label: 'Blog', icon: BlogIcon },
  { href: '/admin/courses', label: 'Courses', icon: CoursesIcon },
  { href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const email = session?.user?.email ?? '';
  const displayName = [session?.user?.firstName, session?.user?.lastName].filter(Boolean).join(' ') || email;
  const initial = displayName ? displayName[0].toUpperCase() : '?';

  return (
    <div className="admin-shell min-h-screen bg-[#f8f5ff] p-0 text-[#05083d] md:p-3">
      <div className="grid min-h-screen overflow-hidden border-[#e7dcff] bg-white/80 shadow-[0_18px_60px_rgba(72,31,152,0.12)] md:min-h-[calc(100vh-24px)] md:grid-cols-[292px_minmax(0,1fr)] md:rounded-[28px] md:border">
        <aside className="hidden min-h-0 flex-col border-r border-[#e7dcff] bg-white/82 px-6 py-7 backdrop-blur md:flex">
          <div className="mb-9 px-2">
            <BrandLogo className="text-[#06083e]" textClassName="text-lg font-black" size={36} />
          </div>
          <nav className="grid gap-3">
            {navItems.map((item) => {
              const active = item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-4 font-extrabold no-underline transition-colors ${
                    active
                      ? 'bg-[linear-gradient(135deg,#7a19e6,#5e00d5)] text-white shadow-[0_12px_24px_rgba(111,25,218,0.24)]'
                      : 'text-[#0a0d45] hover:bg-[#f3edff] hover:text-[#5e00d5]'
                  }`}
                >
                  <item.icon />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto grid gap-4 rounded-2xl border border-[#e7dcff] bg-[#fbf8ff] p-5 shadow-[0_10px_28px_rgba(72,31,152,0.08)]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#f0e6ff] text-[#6e12d8]">
                <SparkIcon />
              </span>
              <p className="text-sm font-black leading-snug">Dialect Library Admin</p>
            </div>
            <p className="text-sm leading-relaxed text-[#4d4a72]">Manage platform operations, users, content, and DL economy.</p>
            <button
              className="inline-flex min-h-10 items-center justify-between rounded-lg border border-[#cdb5ff] px-3 text-sm font-extrabold text-[#5e00d5] hover:bg-[#f2eaff]"
              onClick={() => router.push('/')}
              type="button"
            >
              Back to site
              <span aria-hidden="true">-&gt;</span>
            </button>
          </div>

          <button
            className="mt-5 flex min-h-11 items-center gap-3 rounded-xl px-4 font-extrabold text-[#4d4a72] transition-colors hover:bg-[#f3edff] hover:text-[#5e00d5]"
            onClick={() => signOut({ callbackUrl: '/' })}
            type="button"
          >
            <SignOutIcon />
            Sign out
          </button>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-col md:min-h-0">
          <header className="flex items-center justify-between gap-3 bg-white/90 px-4 py-4 backdrop-blur md:px-8 md:py-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="md:hidden">
                <BrandLogo size={30} textClassName="text-sm font-black" />
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7658b3]">Admin Console</p>
                <p className="truncate text-sm font-bold text-[#4d4a72]">Dialect Library operations</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                className="grid size-10 place-items-center rounded-xl border border-[#e1d5fb] bg-white text-[#05083d] shadow-[0_8px_20px_rgba(72,31,152,0.06)] hover:bg-[#f8f3ff]"
                type="button"
                aria-label="Notifications"
              >
                <BellIcon />
              </button>
              <button
                className="hidden size-10 place-items-center rounded-xl border border-[#e1d5fb] bg-white text-[#05083d] shadow-[0_8px_20px_rgba(72,31,152,0.06)] hover:bg-[#f8f3ff] sm:grid"
                type="button"
                aria-label="Language"
              >
                <GlobeIcon />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e1d5fb] bg-white py-1 pl-1 pr-3 shadow-[0_8px_20px_rgba(72,31,152,0.06)] hover:bg-[#f8f3ff]">
                  <span className="grid size-9 place-items-center rounded-full bg-[linear-gradient(135deg,#7a19e6,#5e00d5)] text-sm font-black text-white">{initial}</span>
                  <span className="hidden max-w-44 text-left sm:block">
                    <span className="block truncate text-sm font-black leading-tight text-[#05083d]">{displayName}</span>
                    <span className="block text-xs font-bold text-[#5e5879]">Administrator</span>
                  </span>
                  <ChevronIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => router.push('/admin/profile')}>
                    <ProfileIcon />
                    Profile
                  </DropdownMenuItem>
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

          <nav className="flex gap-2 overflow-x-auto border-y border-[#ece3ff] bg-white/88 px-4 py-3 md:hidden">
            {navItems.map((item) => {
              const active = item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-extrabold no-underline ${
                    active ? 'bg-[linear-gradient(135deg,#7a19e6,#5e00d5)] text-white' : 'bg-[#f4eeff] text-[#0a0d45]'
                  }`}
                >
                  <item.icon />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-8 pt-5 md:px-7 md:pb-8 md:pt-8 xl:px-8">
            <div className="mx-auto max-w-[1560px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3v5m0 8v5M3 12h5m8 0h5M6.3 6.3l3.5 3.5m4.4 4.4 3.5 3.5m0-11.4-3.5 3.5m-4.4 4.4-3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21M12 3c-2.2 2.4-3.3 5.4-3.3 9S9.8 18.6 12 21" strokeLinecap="round" />
    </svg>
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

function LeadsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
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

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
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

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function WithdrawalsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3v14" strokeLinecap="round" />
      <path d="m6 11 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16" strokeLinecap="round" />
    </svg>
  );
}

function PoolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 15c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 19c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5h14v6H5z" strokeLinejoin="round" />
    </svg>
  );
}

function P2PIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M7 7h11l-3-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17H6l3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 7a5 5 0 0 1-5 5H8" strokeLinecap="round" />
      <path d="M6 17a5 5 0 0 1 5-5h5" strokeLinecap="round" />
    </svg>
  );
}

function WordsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BlogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 3h11l3 3v15H5z" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
    </svg>
  );
}

function CoursesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 9l10-5 10 5-10 5-10-5z" strokeLinejoin="round" />
      <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 9v6" strokeLinecap="round" />
    </svg>
  );
}
