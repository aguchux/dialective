'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Download, MessageSquareText } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { requestPwaInstall } from '@/components/PwaInstallPrompt';
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
  { href: '/admin/distributors', label: 'Distributors', icon: DistributorsIcon },
  { href: '/admin/data-access', label: 'Data Access Leads', icon: LeadsIcon },
  { href: '/admin/geo', label: 'Coverage', icon: GeoIcon },
  { href: '/admin/words', label: 'Words', icon: WordsIcon },
  { href: '/admin/recordings', label: 'Recordings', icon: RecordingsIcon },
  { href: '/admin/testimonials', label: 'Testimonials', icon: TestimonialsIcon },
  { href: '/admin/marketing', label: 'Marketing', icon: MarketingIcon },
  { href: '/admin/audit-hold', label: 'Audit Queue', icon: AuditQueueIcon },
  { href: '/admin/phone-verifications', label: 'Phone Verifications', icon: PhoneIcon },
  { href: '/admin/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { href: '/admin/referrals', label: 'Referrals', icon: ReferralIcon },
  { href: '/admin/p2p', label: 'P2P Market', icon: P2PIcon },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: WithdrawalsIcon },
  { href: '/admin/pools', label: 'Reward Pool', icon: PoolIcon },
  { href: '/admin/tokenomics', label: 'Tokenomics', icon: TokenomicsIcon },
  { href: '/admin/settlement', label: 'Unsettled Tasks', icon: SettlementIcon },
  { href: '/admin/blog', label: 'Blog', icon: BlogIcon },
  { href: '/admin/courses', label: 'Courses', icon: CoursesIcon },
  { href: '/admin/updates', label: 'Updates', icon: BellIcon },
  { href: '/admin/ai-conversations', label: 'AI Conversations', icon: MessageSquareText },
  { href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const email = session?.user?.email ?? '';
  const displayName =
    [session?.user?.firstName, session?.user?.lastName].filter(Boolean).join(' ') || email;
  const initial = displayName ? displayName[0].toUpperCase() : '?';

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="grid min-h-screen bg-surface-muted text-ink md:grid-cols-[240px_1fr]">
      <AdminSidebar pathname={pathname} router={router} />

      <div
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity md:hidden ${
          menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[min(84vw,280px)] transform transition-transform duration-200 md:hidden ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AdminSidebar
          pathname={pathname}
          router={router}
          mobile
          onClose={() => setMenuOpen(false)}
        />
      </div>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="grid size-10 place-items-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-surface-muted md:hidden"
              type="button"
              aria-label="Open admin menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <HamburgerIcon />
            </button>
            <div className="md:hidden">
              <BrandLogo size={28} textClassName="hidden text-sm font-black sm:inline" />
            </div>
            <span className="hidden text-lg font-black md:inline">Admin Panel</span>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-muted">
                <span className="grid size-7 place-items-center rounded-full bg-accent text-sm font-black text-white">
                  {initial}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-bold sm:inline">
                  {displayName}
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
                <DropdownMenuItem onSelect={() => requestPwaInstall()}>
                  <Download className="size-4" aria-hidden="true" />
                  Install app
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

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function AdminSidebar({
  pathname,
  router,
  mobile = false,
  onClose,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
  mobile?: boolean;
  onClose?: () => void;
}) {
  return (
    <aside
      className={`${mobile ? 'flex h-full' : 'hidden md:flex'} flex-col gap-1 border-r border-line bg-[#151726] p-4 text-white`}
    >
      <div className="mb-4 flex items-center justify-between px-1">
        <BrandLogo className="text-white" textClassName="text-base" size={32} />
        {mobile && (
          <button
            className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
            onClick={onClose}
            type="button"
            aria-label="Close admin menu"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <nav className="grid gap-1 overflow-y-auto">
        {navItems.map((item) => {
          const active =
            item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold no-underline transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
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
        onClick={() => router.push('/')}
        type="button"
      >
        <HomeIcon />
        Back to site
      </button>

      <button
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        onClick={() => signOut({ callbackUrl: '/' })}
        type="button"
      >
        <SignOutIcon />
        Sign out
      </button>
    </aside>
  );
}

function HamburgerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
      <path d="M15.5 5.5a3.25 3.25 0 0 1 0 6.4" strokeLinecap="round" />
      <path d="M17 14.2a6.5 6.5 0 0 1 4.5 5.8" strokeLinecap="round" />
    </svg>
  );
}

function DistributorsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LeadsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GeoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.25" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
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
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 19V9l8-5 8 5v10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 19v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WithdrawalsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 3v14" strokeLinecap="round" />
      <path d="m6 11 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16" strokeLinecap="round" />
    </svg>
  );
}

function RecordingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 17v4" strokeLinecap="round" />
      <path d="M8 21h8" strokeLinecap="round" />
    </svg>
  );
}

function TestimonialsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 10h.01M12 10h.01M16 10h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarketingIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m3 11 18-5v12L3 14v-3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AuditQueueIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h.01" strokeLinecap="round" />
      <path d="M12.5 9H16" strokeLinecap="round" />
      <path d="M9 13h.01" strokeLinecap="round" />
      <path d="M12.5 13H16" strokeLinecap="round" />
      <path d="M9 17h.01" strokeLinecap="round" />
      <path d="M12.5 17H16" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L9 10.6a16 16 0 0 0 4.4 4.4l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M8 21h8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 17v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" strokeLinejoin="round" />
      <path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TokenomicsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v2M12 16v2" strokeLinecap="round" />
      <path
        d="M9 15.5c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-1.7-3-2.2-3-1.1-3-2.3 1.3-2 3-2 3 .8 3 2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettlementIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PoolIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M3 15c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 19c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 11c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 5h14v6H5z" strokeLinejoin="round" />
    </svg>
  );
}

function P2PIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M7 7h11l-3-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17H6l3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 7a5 5 0 0 1-5 5H8" strokeLinecap="round" />
      <path d="M6 17a5 5 0 0 1 5-5h5" strokeLinecap="round" />
    </svg>
  );
}

function WordsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BlogIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M5 3h11l3 3v15H5z" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
    </svg>
  );
}

function CoursesIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M2 9l10-5 10 5-10 5-10-5z" strokeLinejoin="round" />
      <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 9v6" strokeLinecap="round" />
    </svg>
  );
}
