'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { LogOut, Settings, UserRound } from 'lucide-react';

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
 * The avatar, and the only way to sign out of the app.
 *
 * The topbar's avatar was a plain <span> showing a hardcoded "DL", so a
 * signed-in member had no sign-out control anywhere in the product -- the
 * only `signOut` call in the app was providers.tsx's automatic one for an
 * expired session. The initials now come from the session too, rather than
 * being the same two letters for everyone.
 *
 * Deliberately not wired to the catalogue's useAuthGate dialog: that gate
 * exists to push a signed-out visitor towards signing in, which is the
 * opposite direction from here.
 */
export function AccountMenu() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Signed out, the topbar offers the way in rather than an empty menu.
  if (status !== 'authenticated') {
    return (
      <button
        className="inline-flex h-10 shrink-0 items-center rounded-lg bg-catalogue-blue px-3.5 text-xs font-bold text-white transition-colors hover:bg-catalogue-blue-bright"
        onClick={() => router.push('/login')}
        type="button"
      >
        Sign in
      </button>
    );
  }

  const { firstName, lastName, email } = session.user;

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="grid size-10 place-items-center rounded-full border-2 border-catalogue-blue/40 bg-catalogue-blue-soft text-sm font-bold text-catalogue-ink transition-colors hover:border-catalogue-blue/70"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {initialsFor(firstName, lastName, email)}
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-lg border border-catalogue-line-strong bg-catalogue-surface-raised py-1 shadow-catalogue"
          role="menu"
        >
          <div className="border-b border-catalogue-line px-3 py-2.5">
            <p className="truncate text-sm font-bold text-catalogue-ink">
              {displayNameFor(firstName, lastName, email)}
            </p>
            {email && <p className="mt-0.5 truncate text-xs text-catalogue-dim">{email}</p>}
          </div>

          <button
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-catalogue-muted transition-colors hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
            onClick={() => {
              setOpen(false);
              router.push('/settings');
            }}
            role="menuitem"
            type="button"
          >
            <UserRound aria-hidden="true" className="size-4" />
            Profile
          </button>
          <button
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-catalogue-muted transition-colors hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
            onClick={() => {
              setOpen(false);
              router.push('/settings/organization');
            }}
            role="menuitem"
            type="button"
          >
            <Settings aria-hidden="true" className="size-4" />
            Organization settings
          </button>

          <div className="my-1 h-px bg-catalogue-line" />
          <button
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-catalogue-muted transition-colors hover:bg-catalogue-surface-hover hover:text-danger"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: '/login' });
            }}
            role="menuitem"
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
