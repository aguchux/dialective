'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useGetMeQuery } from '@/store/api';

/**
 * The organization the member is working in.
 *
 * This showed a hardcoded "Dialect Labs Org" to everyone, on a button
 * labelled "Choose organization" that had no onClick -- so it named the
 * wrong org and did not switch. The name now comes from the member's own
 * memberships.
 *
 * Which membership is current comes from the session rather than this
 * query: the access token is minted for one organizationId, so that is the
 * org every API call actually reads, and picking a different row here for
 * display would be a lie about what the page below is showing.
 *
 * Switching is listed but not yet wired, because changing org means
 * re-minting the token against the new organizationId -- a NextAuth
 * session concern, not a UI one. Rather than fake it, a member of several
 * orgs sees the list with the current one marked, and the others are
 * disabled with the reason shown. A member of one org gets a plain label
 * with no menu, since there is nothing to choose.
 */
export function OrgSwitcher() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const { data: me } = useGetMeQuery(undefined, { skip: !isAuthenticated });
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

  if (!isAuthenticated) return null;

  const memberships = me?.memberships ?? [];
  const activeOrgId = session.user.organizationId;
  const active = memberships.find((membership) => membership.organization.id === activeOrgId);

  // Until /me resolves there is no name to show. A placeholder would be a
  // guess at the org the member is in, so the control waits instead.
  if (!active) return null;

  const canSwitch = memberships.length > 1;

  const label = (
    <>
      <Building2 aria-hidden="true" className="size-4 shrink-0 text-catalogue-muted" />
      <span className="hidden max-w-40 truncate lg:inline">{active.organization.name}</span>
    </>
  );

  if (!canSwitch) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-catalogue-line bg-catalogue-surface px-3 text-xs font-semibold text-catalogue-ink">
        {label}
      </span>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Choose organization"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-catalogue-line bg-catalogue-surface px-3 text-xs font-semibold text-catalogue-ink hover:bg-catalogue-surface-hover"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {label}
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-catalogue-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-catalogue-line-strong bg-catalogue-surface-raised p-1.5 shadow-catalogue"
          role="menu"
        >
          {memberships.map((membership) => {
            const isActive = membership.organization.id === activeOrgId;
            return (
              <div
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
                  isActive ? 'text-catalogue-ink' : 'text-catalogue-dim'
                }`}
                key={membership.id}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {membership.organization.name}
                  </span>
                  <span className="block truncate text-xs text-catalogue-dim">
                    {membership.role.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </span>
                {isActive && (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-catalogue-blue-bright"
                  />
                )}
              </div>
            );
          })}
          <p className="border-t border-catalogue-line px-2.5 pb-1 pt-2 text-xs leading-relaxed text-catalogue-dim">
            Sign in again to work in a different organization.
          </p>
        </div>
      )}
    </div>
  );
}
