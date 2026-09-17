'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Code2,
  Home,
  Layers3,
  Lock,
  Pin,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  X,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import type { PinnedCollection } from './types';
import { CoverImage } from './primitives';
import { useAuthGate } from './useAuthGate';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home, protected: false },
  { href: '/dashboard/explore', label: 'Discover', icon: Search, protected: true },
  { href: '/dashboard/decks', label: 'Stream Decks', icon: Layers3, protected: true },
  { href: '/dashboard/validation', label: 'Validation', icon: ShieldCheck, protected: true },
  { href: '/dashboard/api-keys', label: 'API', icon: Code2, protected: true },
  // Public, unlike every other entry below Home: the reference is a reason to
  // sign up, so gating it behind the auth wall would be backwards.
  { href: '/docs', label: 'API Docs', icon: BookOpen, protected: false },
  { href: '/dashboard/analytics', label: 'Usage', icon: BarChart3, protected: true },
  { href: '/dashboard/team', label: 'Team', icon: UsersRound, protected: true },
  { href: '/settings', label: 'Settings', icon: Settings, protected: true },
];

export function StreamSidebar({
  mobileOpen = false,
  onClose,
  pinnedCollections,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
  pinnedCollections: PinnedCollection[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { guard, dialog, isAuthenticated } = useAuthGate();

  return (
    <aside
      className={`stream-catalogue-sidebar stream-catalogue-scrollbar fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-catalogue-line bg-catalogue-surface px-4 pb-[var(--catalogue-player-height)] pt-5 transition-transform duration-200 md:sticky md:top-0 md:z-10 md:translate-x-0 md:transition-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex items-center justify-between gap-3 px-2">
        <BrandLogo
          className="text-catalogue-ink"
          href=""
          mode="catalogue"
          size={34}
          textClassName="text-catalogue-ink"
        />
        <button
          aria-label="Close navigation"
          className="grid size-9 place-items-center rounded-lg text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink md:hidden"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <nav aria-label="Stream catalogue" className="mt-7 grid gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          return (
            <button
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60 ${
                active
                  ? 'bg-catalogue-blue/20 text-catalogue-ink ring-1 ring-inset ring-catalogue-blue/60'
                  : 'text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink'
              }`}
              key={item.label}
              onClick={() => {
                onClose?.();
                if (item.protected) {
                  guard(item.href, () => router.push(item.href));
                } else {
                  router.push(item.href);
                }
              }}
              type="button"
            >
              <Icon
                aria-hidden="true"
                className={`size-[18px] ${active ? 'text-catalogue-blue-bright' : ''}`}
              />
              <span className="flex-1">{item.label}</span>
              {item.protected && !isAuthenticated && (
                <Lock aria-hidden="true" className="size-3.5 shrink-0 text-catalogue-dim" />
              )}
            </button>
          );
        })}
      </nav>
      {dialog}

      <div className="my-5 h-px bg-catalogue-line" />
      <div className="flex items-center justify-between px-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-catalogue-dim">
          Pinned collections
        </p>
        <button
          aria-label="Add pinned collection"
          className="grid size-7 place-items-center rounded-md text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-1">
        {pinnedCollections.map((collection) => (
          <button
            className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-catalogue-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
            key={collection.id}
            type="button"
          >
            <CoverImage
              alt={collection.coverAlt}
              className="size-9 shrink-0 rounded-md object-cover"
              height={36}
              src={collection.coverUrl}
              width={36}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-catalogue-ink">
                {collection.title}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-catalogue-dim">
                {collection.meta}
              </span>
            </span>
            <Pin aria-hidden="true" className="size-3 shrink-0 text-catalogue-blue-bright" />
          </button>
        ))}
      </div>

      <div className="relative mt-auto overflow-hidden rounded-[10px] border border-catalogue-blue/30 bg-[linear-gradient(145deg,#33244a,#1a1424)] p-4">
        <SlidersHorizontal
          aria-hidden="true"
          className="absolute -bottom-2 -right-1 size-20 text-catalogue-blue/20"
        />
        <p className="relative text-sm font-bold text-catalogue-ink">Upgrade Plan</p>
        <p className="relative mt-1 text-xs leading-relaxed text-catalogue-muted">
          Unlock more hours, advanced filters, and team features.
        </p>
        <button
          className="relative mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-catalogue-blue/50 px-2.5 text-[11px] font-semibold text-catalogue-blue-bright transition-colors hover:bg-catalogue-blue/15"
          type="button"
        >
          View Plans <Plus aria-hidden="true" className="size-3" />
        </button>
      </div>
    </aside>
  );
}
