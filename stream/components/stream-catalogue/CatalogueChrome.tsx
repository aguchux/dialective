'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { FilterBar } from './FilterBar';
import { StreamSidebar } from './StreamSidebar';
import { StreamTopbar } from './StreamTopbar';
import { useCatalogueSearch } from './CatalogueSearchContext';
import { useGetCatalogueShowcaseQuery } from '@/store/api';
import type { FilterKey } from './types';

/**
 * The signed-in app's frame: sidebar, search topbar and filter row.
 *
 * Extracted from StreamAppShell so /dashboard/* can render inside the same
 * chrome instead of a second sidebar with its own labels. The catalogue
 * keeps its own copy of the layout because it also owns the inspector
 * column and the player; everything else -- decks, validation, API keys,
 * team -- renders through here.
 *
 * Search and filter state comes from CatalogueSearchProvider rather than
 * local state, so it survives navigation between pages. The filter row is
 * hidden on pages where narrowing a catalogue means nothing (API keys,
 * webhooks); it still renders on anything that lists recordings.
 */
export function CatalogueChrome({
  children,
  showFilters = false,
}: {
  children: ReactNode;
  showFilters?: boolean;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { searchTerm, setSearchTerm, filters, updateFilter, clearFilters } = useCatalogueSearch();
  // Only for the filter dropdowns' option lists -- the page below renders
  // its own data. Cached by RTK Query, so this costs nothing extra when the
  // catalogue is already loaded.
  const { data, isFetching } = useGetCatalogueShowcaseQuery(undefined, { skip: !showFilters });

  const filterOptions = useMemo(() => {
    const collections = data?.collections ?? [];
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort();
    return {
      country: unique(collections.map((collection) => collection.country)),
      dialect: unique(collections.map((collection) => collection.dialect)),
      subdialect: unique(collections.map((collection) => collection.subdialect)),
      quality: ['9.5+', '9.0+', '8.5+'],
      license: unique(collections.map((collection) => collection.license)),
    } satisfies Record<FilterKey, string[]>;
  }, [data]);

  return (
    <div
      className="stream-catalogue h-svh w-full overflow-hidden bg-catalogue-bg text-catalogue-ink"
      style={{ '--catalogue-player-height': '0px' } as CSSProperties}
    >
      <div className="flex h-full min-h-0 md:grid md:grid-cols-[260px_minmax(0,1fr)]">
        <StreamSidebar
          mobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          pinnedCollections={[]}
        />
        {mobileMenuOpen && (
          <button
            aria-label="Close navigation backdrop"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
        )}

        <main className="stream-catalogue-scrollbar min-h-0 min-w-0 overflow-y-auto">
          <StreamTopbar
            isRefreshing={isFetching}
            onMenu={() => setMobileMenuOpen(true)}
            onSearchChange={setSearchTerm}
            searchTerm={searchTerm}
          />
          <div className="mx-auto grid min-w-0 max-w-[1360px] gap-5 px-4 py-5 sm:px-5 lg:px-7">
            {showFilters && (
              <FilterBar
                filters={filters}
                onChange={updateFilter}
                onClear={clearFilters}
                options={filterOptions}
              />
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
