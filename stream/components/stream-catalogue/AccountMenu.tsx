'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Building2,
  ChevronRight,
  CreditCard,
  LifeBuoy,
  LogOut,
  Settings,
  Sparkles,
  UsersRound,
  UserRound,
} from 'lucide-react';
import { useGetSubscriptionQuery } from '@/store/api';
import { canAccessPath } from '@/lib/route-access';

/** "Ada Obi" -> "AO"; falls back to the email's first letter. */
function initialsFor(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
): string {
  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.trim();
  if (initials) return initials.toUpperCase();
  return (email?.[0] ?? '?').toUpperCase();
}

function displayNameFor(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || email || 'Signed in';
}

/**
 * Account-scoped destinations, in the order they appear.
 *
 * Team and Settings moved here out of the sidebar's Organization group:
 * they are account and org administration rather than places you work with
 * voice data, so they belong behind the member rather than in the primary
 * nav. Usage and Reports stayed in the sidebar -- those are the product.
 *
 * Several of these are role-gated (Team and Organization need an org admin,
 * Billing a billing role). They are filtered by the same canAccessPath the
 * sidebar uses, so a member is never shown a destination that would bounce
 * them -- it decides what renders, never what is permitted; the server's
 * guards do that.
 */
const MENU_GROUPS: {
  items: { href: string; label: string; icon: typeof UserRound; accent?: boolean }[];
}[] = [
  {
    items: [
      { href: '/settings/billing', label: 'Upgrade plan', icon: Sparkles, accent: true },
      { href: '/settings', label: 'Profile', icon: UserRound },
    ],
  },
  {
    items: [
      { href: '/dashboard/team', label: 'Team', icon: UsersRound },
      { href: '/settings/organization', label: 'Organization', icon: Building2 },
      { href: '/settings/billing', label: 'Billing', icon: CreditCard },
      { href: '/settings/security', label: 'Security', icon: Settings },
    ],
  },
  {
    items: [{ href: '/docs', label: 'Help', icon: LifeBuoy }],
  },
];

const MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-catalogue-muted transition-colors hover:bg-catalogue-surface-hover hover:text-catalogue-ink';

/**
 * The account row pinned to the bottom of the sidebar, and the only way to
 * sign out of the app.
 *
 * The menu opens upward (bottom-full) rather than down, because the
 * trigger sits at the bottom of the viewport -- a downward menu would open
 * off-screen. It is positioned against the row rather than rendered in a
 * portal, so it travels with the sidebar when the mobile drawer slides.
 *
 * The plan name comes from the real subscription rather than a literal, so
 * it cannot drift from what the org is actually billed for. While it loads,
 * or for an org with no subscription row, the line is omitted -- better
 * than showing a guess.
 */
export function AccountMenu() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAuthenticated = status === 'authenticated';
  const { data: subscription } = useGetSubscriptionQuery(undefined, { skip: !isAuthenticated });

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  // Signed out, the row offers the way in rather than an empty menu.
  if (!isAuthenticated) {
    return (
      <button
        className="mx-3 mb-3 mt-2 inline-flex min-h-10 items-center justify-center rounded-lg bg-catalogue-blue px-3.5 text-sm font-bold text-white transition-colors hover:bg-catalogue-blue-bright"
        onClick={() => router.push('/login')}
        type="button"
      >
        Sign in
      </button>
    );
  }

  const { firstName, lastName, email, orgRole } = session.user;
  const name = displayNameFor(firstName, lastName, email);
  const initials = initialsFor(firstName, lastName, email);

  return (
    <div className="relative mx-3 mb-3 mt-2 shrink-0" ref={containerRef}>
      {open && (
        <div
          className="stream-catalogue-scrollbar absolute bottom-full left-0 z-50 mb-2 max-h-[min(70svh,26rem)] w-full min-w-[232px] overflow-y-auto overscroll-contain rounded-xl border border-catalogue-line-strong bg-catalogue-surface-raised p-1.5 shadow-catalogue"
          role="menu"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-catalogue-blue-soft text-xs font-bold text-catalogue-ink">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-catalogue-ink">{name}</span>
              {email && <span className="block truncate text-xs text-catalogue-dim">{email}</span>}
            </span>
          </div>

          {MENU_GROUPS.map((group, index) => {
            const visible = group.items.filter((item) => canAccessPath(orgRole, item.href));
            if (visible.length === 0) return null;
            return (
              <div key={index}>
                <div className="my-1.5 h-px bg-catalogue-line" />
                {visible.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className={MENU_ITEM_CLASS}
                      key={item.label}
                      onClick={() => go(item.href)}
                      role="menuitem"
                      type="button"
                    >
                      <Icon
                        aria-hidden="true"
                        className={`size-4 ${item.accent ? 'text-catalogue-blue-bright' : ''}`}
                      />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div className="my-1.5 h-px bg-catalogue-line" />

          <button
            className={`${MENU_ITEM_CLASS} font-semibold hover:text-danger`}
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: '/login' });
            }}
            role="menuitem"
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Log out
          </button>
        </div>
      )}

      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
          open
            ? 'border-catalogue-line-strong bg-catalogue-surface-hover'
            : 'border-transparent hover:bg-catalogue-surface-hover'
        }`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-catalogue-blue-soft text-xs font-bold text-catalogue-ink">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-catalogue-ink">{name}</span>
          {subscription?.plan?.name && (
            <span className="block truncate text-xs text-catalogue-dim">
              {subscription.plan.name}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden="true"
          className={`size-4 shrink-0 text-catalogue-dim transition-transform ${open ? '-rotate-90' : ''}`}
        />
      </button>
    </div>
  );
}
