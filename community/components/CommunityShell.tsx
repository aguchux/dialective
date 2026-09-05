'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import {
  Home,
  Compass,
  PlusCircle,
  FileText,
  Bookmark,
  Bell,
  User,
  LogOut,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useListNotificationsQuery } from '@/store/api';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/new', label: 'Create Post', icon: PlusCircle },
  { href: '/me/posts', label: 'My Posts', icon: FileText },
  { href: '/saved', label: 'Bookmarks', icon: Bookmark },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Profile', icon: User },
];

/**
 * Desktop persistent sidebar + mobile bottom nav (docs/COMMUNITY-PLAN.md
 * §10.2/§10.3), sharing frontend's design tokens so the app reads as a
 * native extension rather than a separate product (unlike stream/'s
 * deliberately distinct console theme).
 */
export function CommunityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { data: notifications } = useListNotificationsQuery(undefined, {
    skip: status !== 'authenticated',
  });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-5 py-5">
          <BrandLogo size={28} textClassName="text-sm font-black" />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                className={`relative mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold no-underline transition-colors ${
                  active ? 'bg-accent text-white' : 'text-muted hover:bg-surface-muted hover:text-ink'
                }`}
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.href === '/notifications' && unreadCount > 0 && (
                  <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-danger text-[11px] font-black text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line px-3 py-3">
          {status === 'authenticated' ? (
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-black text-white">
                {(session.user?.firstName ?? session.user?.name ?? 'M').trim()[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                {session.user?.firstName ?? session.user?.name ?? 'Member'}
              </span>
              <button
                aria-label="Sign out"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                onClick={() => void signOut()}
                type="button"
              >
                <LogOut aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : status === 'unauthenticated' ? (
            <button
              className="flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-dark"
              onClick={() => void signIn()}
              type="button"
            >
              Sign in
            </button>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <BrandLogo size={24} textClassName="text-xs font-black" />
        </header>

        <main className="flex-1">{children}</main>
      </div>

      <nav
        aria-label="Community"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface md:hidden"
      >
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const active = item.href === '/' ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold no-underline ${
                active ? 'text-accent' : 'text-muted'
              }`}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" className="size-5" />
              {item.label === 'Create Post' ? 'Post' : item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
