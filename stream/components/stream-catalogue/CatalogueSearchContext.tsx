'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { defaultFilters } from './mock-data';
import type { CatalogueFilters, FilterKey } from './types';

/** Upstream to downstream. Changing one clears everything after it. */
const CASCADE_ORDER: FilterKey[] = ['country', 'dialect', 'subdialect', 'quality', 'license'];

interface CatalogueSearchValue {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  filters: CatalogueFilters;
  /** Sets one field and clears every field downstream of it. */
  updateFilter: (key: FilterKey, value: string | null) => void;
  clearFilters: () => void;
  /** True when anything is currently narrowing the catalogue. */
  isFiltered: boolean;
}

const CatalogueSearchContext = createContext<CatalogueSearchValue | null>(null);

/**
 * Holds the catalogue's search term and filter selections above the router.
 *
 * The topbar and filter row render on every signed-in page, so their state
 * has to outlive the page under them: typing a query, opening Stream Decks
 * and coming back should not silently clear what you searched for. This
 * state used to live in StreamAppShell, which unmounted on every
 * navigation and took the query with it.
 *
 * The cascade rule lives here rather than in either shell so both get the
 * same behaviour from one implementation: picking a Country and then
 * changing it must drop the Dialect chosen under the old one, since that
 * value may not exist in the new country's list.
 *
 * Deliberately plain React state rather than a Redux slice or the URL. It
 * is transient view state and nothing outside this provider reads it. If
 * it ever needs to survive a reload or be shareable as a link, the URL is
 * the right home and this is the single place to change.
 */
export function CatalogueSearchProvider({ children }: { children: ReactNode }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<CatalogueFilters>(defaultFilters);

  const updateFilter = useCallback((key: FilterKey, value: string | null) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      const changedIndex = CASCADE_ORDER.indexOf(key);
      if (changedIndex !== -1) {
        for (const laterKey of CASCADE_ORDER.slice(changedIndex + 1)) next[laterKey] = null;
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(defaultFilters), []);

  const value = useMemo<CatalogueSearchValue>(
    () => ({
      searchTerm,
      setSearchTerm,
      filters,
      updateFilter,
      clearFilters,
      isFiltered: searchTerm.trim().length > 0 || Object.values(filters).some(Boolean),
    }),
    [searchTerm, filters, updateFilter, clearFilters],
  );

  return (
    <CatalogueSearchContext.Provider value={value}>{children}</CatalogueSearchContext.Provider>
  );
}

export function useCatalogueSearch(): CatalogueSearchValue {
  const value = useContext(CatalogueSearchContext);
  if (!value) {
    throw new Error('useCatalogueSearch must be used inside a CatalogueSearchProvider');
  }
  return value;
}
