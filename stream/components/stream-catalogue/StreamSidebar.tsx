'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  FileText,
  Fingerprint,
  Home,
  KeyRound,
  Layers3,
  Lock,
  Pin,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Store,
  UsersRound,
  Webhook,
  X,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { AccountMenu } from './AccountMenu';
import { UpgradeCard } from './UpgradeCard';
import type { PinnedCollection } from './types';
import { CoverImage } from './primitives';
import { useAuthGate } from './useAuthGate';
import { canAccessPath } from '@/lib/route-access';
import { useSession } from 'next-auth/react';

/**
 * The one navigation for the whole signed-in app.
 *
 * /dashboard used to carry a second sidebar with its own labels for the
 * same destinations -- "Discover" here was "Search" there, "API" was "API
 * Keys", "Usage" was "API Usage" -- so moving between the catalogue and a
 * dashboard page swapped the entire chrome and renamed the page you had
 * just come from. Both shells now render this list.
 *
 * Grouped so the longer list stays scannable: the catalogue first, then
 * the integration surfaces, then the org. `roles` mirrors the server's
 * @SubscriberRoles() guards via canAccessPath -- it decides what renders,
 * never what is permitted.
 */
const NAV_GROUPS: {
  heading: string | null;
  items: {
    href: string;
    label: string;
    icon: typeof Home;
    protected: boolean;
  }[];
}[] = [
  {
    heading: null,
    items: [
      { href: '/', label: 'Home', icon: Home, protected: false },
      { href: '/dashboard/explore', label: 'Discover', icon: Search, protected: true },
      { href: '/dashboard/decks', label: 'Stream Decks', icon: Layers3, protected: true },
      { href: '/dashboard/validation', label: 'Validation', icon: ShieldCheck, protected: true },
      { href: '/dashboard/marketplace', label: 'Marketplace', icon: Store, protected: true },
    ],
  },
  {
    heading: 'Developer',
    items: [
      { href: '/dashboard/api-keys', label: 'API Keys', icon: KeyRound, protected: true },
      {
        href: '/dashboard/oauth-clients',
        label: 'OAuth Clients',
        icon: Fingerprint,
        protected: true,
      },
      { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook, protected: true },
      // Public, unlike every other protected entry: the reference is a
      // reason to sign up, so gating it behind the auth wall is backwards.
      { href: '/docs', label: 'API Docs', icon: BookOpen, protected: false },
    ],
  },
  {
    heading: 'Organization',
    items: [
      { href: '/dashboard/analytics', label: 'Usage', icon: BarChart3, protected: true },
      { href: '/dashboard/reports', label: 'Reports', icon: FileText, protected: true },
      { href: '/dashboard/team', label: 'Team', icon: UsersRound, protected: true },
      { href: '/settings', label: 'Settings', icon: Settings, protected: true },
    ],
  },
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
  const { data: session } = useSession();
  // Undefined while signed out, which canAccessPath treats as no access --
  // the protected entries then render with their padlock as before.
  const orgRole = session?.user?.orgRole;

  return (
    <aside
      className={`stream-catalogue-sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-catalogue-line bg-catalogue-surface pt-5 pb-[var(--catalogue-player-height)] transition-transform duration-200 md:static md:z-10 md:h-full md:translate-x-0 md:transition-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-6">
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

      <div className="stream-catalogue-scrollbar min-h-0 flex-1 overflow-y-auto px-4">
        <nav aria-label="Stream Dialect" className="mt-7 grid gap-1">
          {NAV_GROUPS.map((group) => {
            // Role filtering applies only once we know the member's role.
            // Signed out there is no role to check, and hiding the protected
            // entries then would leave a near-empty menu that hides what the
            // product does -- they render with their padlock instead, which
            // is what the auth gate is for.
            const visible = group.items.filter(
              (item) => !item.protected || !orgRole || canAccessPath(orgRole, item.href),
            );
            if (visible.length === 0) return null;
            return (
              <div className="grid gap-1" key={group.heading ?? 'primary'}>
                {group.heading && (
                  <p className="mt-4 px-3 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-catalogue-dim">
                    {group.heading}
                  </p>
                )}
                {visible.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
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
              </div>
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
      </div>

      <UpgradeCard
        onViewPlans={() => {
          onClose?.();
          guard('/settings/billing', () => router.push('/settings/billing'));
        }}
      />

      <AccountMenu />
    </aside>
  );
}
