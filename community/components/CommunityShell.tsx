'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Compass,
  Hash,
  Home,
  LogOut,
  Plus,
  Search,
  Settings,
  User,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ConnectHeroBanner } from './ConnectHeroBanner';
import { IconButton } from './ui';
import { getInitials, getSpaceTone } from '@/lib/community-format';
import { useListNotificationsQuery, useListSpacesQuery } from '@/store/api';

const PRIMARY_NAV = [
  { href: '/', label: 'Home', mobileLabel: 'Home', icon: Home },
  { href: '/explore', label: 'Explore', mobileLabel: 'Explore', icon: Compass },
  { href: '/new', label: 'Create post', mobileLabel: 'Post', icon: Plus },
  { href: '/saved', label: 'Bookmarks', mobileLabel: 'Saved', icon: Bookmark },
  { href: '/notifications', label: 'Notifications', mobileLabel: 'Alerts', icon: Bell },
  { href: '/profile', label: 'Profile', mobileLabel: 'Profile', icon: User },
];

const SPACE_TONE_CLASSES = {
  blue: 'bg-space-blue text-space-blue-ink',
  purple: 'bg-space-purple text-space-purple-ink',
  mint: 'bg-space-mint text-space-mint-ink',
  green: 'bg-space-green text-space-green-ink',
  pink: 'bg-space-pink text-space-pink-ink',
  orange: 'bg-space-orange text-space-orange-ink',
} as const;

export function CommunityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { data: notifications } = useListNotificationsQuery(undefined, {
    skip: status !== 'authenticated',
  });
  const { data: spaces } = useListSpacesQuery();
  const unreadCount = notifications?.filter((notification) => !notification.readAt).length ?? 0;
  const initials = getInitials(
    [session?.user?.firstName, session?.user?.lastName].filter(Boolean).join(' ') ||
      session?.user?.name ||
      'Member',
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <CommunitySidebar pathname={pathname} spaces={spaces ?? []} unreadCount={unreadCount} />
      <div className="flex min-h-screen min-w-0 flex-col lg:pl-[288px]">
        <CommunityTopbar
          initials={initials}
          pathname={pathname}
          sessionStatus={status}
          displayName={session?.user?.name ?? session?.user?.firstName ?? 'Member'}
          unreadCount={unreadCount}
        />
        <ConnectHeroBanner />
        <main className="min-w-0 flex-1 pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>
      <CommunityMobileNav pathname={pathname} unreadCount={unreadCount} />
    </div>
  );
}

function CommunityTopbar({
  initials,
  pathname,
  sessionStatus,
  displayName,
  unreadCount,
}: {
  initials: string;
  pathname: string;
  sessionStatus: 'loading' | 'authenticated' | 'unauthenticated';
  displayName: string;
  unreadCount: number;
}) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useStateFromUrl(pathname);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchValue.trim();
    router.push(query ? `/explore?q=${encodeURIComponent(query)}` : '/explore');
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/');
  }

  const showBack = pathname !== '/' && pathname !== '/explore';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <BrandLogo href="/" showText={false} size={30} />
        </div>

        <form className="hidden min-w-0 max-w-[680px] flex-1 lg:flex" onSubmit={submitSearch}>
          <label className="relative block w-full">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            />
            <input
              aria-label="Search community"
              className="h-11 w-full rounded-lg border border-line bg-bg px-12 text-sm text-ink transition-colors placeholder:text-muted/75 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/15"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search discussions, topics, people..."
              value={searchValue}
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {showBack && (
            <IconButton className="lg:hidden" label="Go back" onClick={goBack}>
              <ArrowLeft aria-hidden="true" className="size-5" />
            </IconButton>
          )}
          <Link
            aria-label="Search community"
            className="inline-flex size-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-muted lg:hidden"
            href="/explore"
          >
            <Search aria-hidden="true" className="size-5" />
          </Link>
          <Link
            aria-current={pathname === '/notifications' ? 'page' : undefined}
            aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
            className="relative inline-flex size-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-muted"
            href="/notifications"
          >
            <Bell aria-hidden="true" className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute right-2 top-2 size-2.5 rounded-full bg-danger ring-2 ring-surface" />
            )}
          </Link>
          <Link
            aria-label="Open profile"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-1.5 py-1.5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 lg:pl-1.5 lg:pr-3"
            href="/profile"
          >
            <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-black text-white">
              {initials}
            </span>
            <span className="hidden max-w-36 truncate text-sm font-extrabold lg:block">
              {displayName}
            </span>
            <span className="sr-only">
              {sessionStatus === 'authenticated' ? displayName : 'Member profile'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function CommunitySidebar({
  pathname,
  spaces,
  unreadCount,
}: {
  pathname: string;
  spaces: { id: string; name: string; slug: string; isArchived?: boolean }[];
  unreadCount: number;
}) {
  const { data: session, status } = useSession();
  const visibleSpaces = spaces.filter((space) => !space.isArchived).slice(0, 8);

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[288px] min-w-0 max-w-[288px] flex-col border-r border-line bg-surface lg:flex">
      <div className="border-b border-line px-5 py-4">
        <BrandLogo textClassName="text-base" size={32} />
      </div>

      <nav
        aria-label="Community"
        className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4"
      >
        <div className="grid gap-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarNavLink
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
              pathname={pathname}
              unreadCount={item.href === '/notifications' ? unreadCount : 0}
            />
          ))}
        </div>

        <div className="my-5 h-px bg-line" />
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2 px-3">
          <span className="min-w-0 truncate text-xs font-black uppercase tracking-wide text-muted">
            Spaces
          </span>
          <Link
            className="shrink-0 text-xs font-extrabold text-accent hover:underline"
            href="/explore#spaces"
          >
            See all
          </Link>
        </div>
        <div className="grid gap-1">
          {visibleSpaces.map((space) => {
            const tone = getSpaceTone(space.slug);
            const active = pathname.startsWith(`/spaces/${space.slug}`);
            return (
              <Link
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'text-muted hover:bg-surface-muted hover:text-ink'
                }`}
                href={`/spaces/${space.slug}`}
                key={space.id}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-md ${SPACE_TONE_CLASSES[tone]}`}
                >
                  <Hash aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 whitespace-nowrap">{space.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-line p-3">
        {status === 'authenticated' ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-bg px-2 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-black text-white">
              {getInitials(
                [session.user?.firstName, session.user?.lastName].filter(Boolean).join(' ') ||
                  session.user?.name ||
                  'Member',
              )}
            </span>
            <span className="min-w-0 flex-1 truncate px-1 text-sm font-extrabold">
              {session.user?.name ?? session.user?.firstName ?? 'Member'}
            </span>
            <Link
              aria-label="Settings"
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
              href="/settings"
            >
              <Settings aria-hidden="true" className="size-4" />
            </Link>
            <button
              aria-label="Sign out"
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : (
          <button
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-3 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            onClick={() => void signIn()}
            type="button"
          >
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}

function SidebarNavLink({
  href,
  icon: Icon,
  label,
  pathname,
  unreadCount,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  pathname: string;
  unreadCount: number;
}) {
  const active = href === '/' ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
        active
          ? 'bg-accent-soft text-accent before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-accent'
          : 'text-muted hover:bg-surface-muted hover:text-ink'
      }`}
      href={href}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="min-w-0 whitespace-nowrap">{label}</span>
      {unreadCount > 0 && (
        <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-black text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

function CommunityMobileNav({ pathname, unreadCount }: { pathname: string; unreadCount: number }) {
  return (
    <nav
      aria-label="Community mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {PRIMARY_NAV.map((item) => {
        const active = item.href === '/' ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            className={`relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35 ${active ? 'text-accent' : 'text-muted'}`}
            href={item.href}
            key={item.href}
          >
            <span
              className={`relative grid size-8 place-items-center rounded-lg ${active ? 'bg-accent-soft' : ''}`}
            >
              <Icon aria-hidden="true" className="size-[18px]" strokeWidth={active ? 2.5 : 2} />
              {item.href === '/notifications' && unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-danger ring-2 ring-surface" />
              )}
            </span>
            <span className="max-w-full truncate">{item.mobileLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function useStateFromUrl(pathname: string) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get('q') ?? '');
  }, [pathname]);

  return [value, setValue] as const;
}
