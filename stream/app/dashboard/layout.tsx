'use client';

import { ReactNode, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { CatalogueChrome } from '@/components/stream-catalogue/CatalogueChrome';

/**
 * Pages that list recordings, and so have something for the catalogue
 * filters to narrow. Everywhere else (API keys, webhooks, team, billing)
 * the filter row would be decoration, so it is left off -- the search bar
 * still renders, because it searches the catalogue from anywhere.
 */
const FILTERABLE_PREFIXES = ['/dashboard/explore', '/dashboard/decks', '/dashboard/marketplace'];

/**
 * /dashboard used to render its own sidebar, with its own labels for the
 * same destinations the catalogue sidebar already had -- "Search" vs
 * "Discover", "API Keys" vs "API", "API Usage" vs "Usage" -- so moving
 * between the two swapped the whole chrome and renamed the page you had
 * just left. Both now render CatalogueChrome, which owns the one sidebar,
 * the search bar and the filter row.
 *
 * The role-based nav filtering that lived here moved into StreamSidebar
 * (it reads the session itself and calls the same canAccessPath); the
 * unauthenticated redirect stays here, because it is a property of this
 * route subtree rather than of the chrome -- the catalogue at / renders
 * the same chrome for signed-out visitors on purpose.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="stream-catalogue grid h-svh place-items-center bg-catalogue-bg text-catalogue-ink">
        <p className="text-sm text-catalogue-muted">Loading...</p>
      </div>
    );
  }

  const showFilters = FILTERABLE_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

  return <CatalogueChrome showFilters={showFilters}>{children}</CatalogueChrome>;
}
