'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useGetCatalogueShowcaseQuery } from '@/store/api';
import { defaultFilters } from './mock-data';
import type { CatalogueCollection, CatalogueFilters, FilterKey, StreamDeck, VerifiedSpeaker } from './types';
import { CollectionCard } from './CollectionCard';
import { CollectionInspector } from './CollectionInspector';
import { DiscoverHero } from './DiscoverHero';
import { FilterBar } from './FilterBar';
import { RecentStreamDecks } from './RecentStreamDecks';
import { StreamPlayerBar } from './StreamPlayerBar';
import { StreamSidebar } from './StreamSidebar';
import { StreamTopbar } from './StreamTopbar';
import {
  CarouselRow,
  CollectionCardSkeleton,
  EmptyCatalogueState,
  HeroSkeleton,
  SectionHeading,
} from './primitives';
import { VerifiedVoices } from './VerifiedVoices';

export function StreamAppShell() {
  const {
    data: showcase,
    isFetching,
    isLoading,
    isError,
    refetch,
  } = useGetCatalogueShowcaseQuery();

  const collections = showcase?.collections ?? [];
  const streamDecks = showcase?.streamDecks ?? [];
  const verifiedSpeakers = showcase?.verifiedSpeakers ?? [];
  const catalogueMetrics = showcase?.catalogueMetrics ?? [];
  const pinnedCollections = showcase?.pinnedCollections ?? [];
  const filterOptions = showcase?.filterOptions;
  const validationBreakdown = showcase?.validationBreakdown ?? [];

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<CatalogueFilters>(defaultFilters);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [addedCollectionIds, setAddedCollectionIds] = useState<Set<string>>(new Set());
  const [addedDeckIds, setAddedDeckIds] = useState<Set<string>>(new Set());
  const [showAllCollections, setShowAllCollections] = useState(false);

  useEffect(() => {
    if (!selectedCollectionId && collections.length > 0) {
      setSelectedCollectionId(collections[0].id);
    }
  }, [collections, selectedCollectionId]);

  const selectedCollection =
    collections.find((collection) => collection.id === selectedCollectionId) ?? null;
  const filteredCollections = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return collections.filter((collection) => {
      const matchesQuery =
        !query ||
        [
          collection.title,
          collection.language,
          collection.country,
          collection.dialect,
          collection.subdialect,
        ].some((value) => value.toLowerCase().includes(query));
      const matchesCountry = !filters.country || collection.country === filters.country;
      const matchesDialect = !filters.dialect || collection.dialect === filters.dialect;
      const matchesSubdialect =
        !filters.subdialect ||
        collection.subdialect.toLowerCase().includes(filters.subdialect.toLowerCase());
      const matchesQuality =
        !filters.quality || collection.qualityScore >= Number(filters.quality.replace('+', ''));
      const matchesLicense =
        !filters.license ||
        collection.license.toLowerCase().includes(filters.license.toLowerCase());
      return (
        matchesQuery &&
        matchesCountry &&
        matchesDialect &&
        matchesSubdialect &&
        matchesQuality &&
        matchesLicense
      );
    });
  }, [collections, filters, searchTerm]);

  function selectCollection(id: string, openMobile = true) {
    setSelectedCollectionId(id);
    setIsPlaying(false);
    if (openMobile) setMobileInspectorOpen(true);
  }

  function selectDeck(deck: StreamDeck) {
    const related =
      collections.find((collection) => collection.dialect === deck.dialect) ?? collections[0];
    if (related) selectCollection(related.id);
  }

  function selectSpeaker(speaker: VerifiedSpeaker) {
    const related =
      collections.find((collection) => collection.language === speaker.language) ?? collections[0];
    if (related) selectCollection(related.id);
  }

  function toggleCollectionAdded() {
    if (!selectedCollection) return;
    setAddedCollectionIds((current) => {
      const next = new Set(current);
      if (next.has(selectedCollection.id)) next.delete(selectedCollection.id);
      else next.add(selectedCollection.id);
      return next;
    });
  }

  function toggleDeckAdded(id: string) {
    setAddedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateFilter(key: FilterKey, value: string | null) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      // Cascading filters: changing an upstream field clears anything
      // downstream of it (country -> dialect -> subdialect -> quality ->
      // license) since a previously-picked value may no longer apply to
      // the narrowed-down option list.
      const cascadeOrder: FilterKey[] = ['country', 'dialect', 'subdialect', 'quality', 'license'];
      const changedIndex = cascadeOrder.indexOf(key);
      if (changedIndex !== -1) {
        for (const laterKey of cascadeOrder.slice(changedIndex + 1)) next[laterKey] = null;
      }
      return next;
    });
  }

  // Each field's option list is derived from collections matching every
  // *upstream* filter already chosen, so picking Country narrows the
  // Dialect list to that country's dialects, picking Dialect narrows
  // Subdialect, and so on -- rather than one static flat list per field.
  const cascadedFilterOptions = useMemo(() => {
    function optionsFor(uptoKey: FilterKey): CatalogueCollection[] {
      const cascadeOrder: FilterKey[] = ['country', 'dialect', 'subdialect', 'quality', 'license'];
      const uptoIndex = cascadeOrder.indexOf(uptoKey);
      return collections.filter((collection) => {
        for (const key of cascadeOrder.slice(0, uptoIndex)) {
          const value = filters[key];
          if (!value) continue;
          if (key === 'quality') {
            if (collection.qualityScore < Number(value.replace('+', ''))) return false;
          } else if (key === 'subdialect') {
            if (!collection.subdialect.toLowerCase().includes(value.toLowerCase())) return false;
          } else if (key === 'license') {
            if (!collection.license.toLowerCase().includes(value.toLowerCase())) return false;
          } else if (collection[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort();

    return {
      country: uniqueSorted(optionsFor('country').map((c) => c.country)),
      dialect: uniqueSorted(optionsFor('dialect').map((c) => c.dialect)),
      subdialect: uniqueSorted(
        optionsFor('subdialect').flatMap((c) => c.subdialect.split(',').map((s) => s.trim())),
      ),
      quality: ['9.5+', '9.0+', '8.5+'],
      license: uniqueSorted(optionsFor('license').map((c) => c.license)),
    } satisfies Record<FilterKey, string[]>;
  }, [collections, filterOptions, filters]);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const featuredLimit = 8;
  const visibleCollections = showAllCollections
    ? filteredCollections
    : filteredCollections.slice(0, featuredLimit);
  const hasMoreCollections = filteredCollections.length > featuredLimit;

  return (
    <div className="stream-catalogue min-h-screen w-full overflow-x-hidden bg-catalogue-bg text-catalogue-ink [--catalogue-player-height:56px] sm:[--catalogue-player-height:60px]">
      <div className="flex min-h-screen pb-[var(--catalogue-player-height)] md:grid md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)_355px]">
        <StreamSidebar
          mobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          pinnedCollections={pinnedCollections}
        />
        {mobileMenuOpen && (
          <button
            aria-label="Close navigation backdrop"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
        )}

        <main className="stream-catalogue-scrollbar min-w-0 overflow-y-auto">
          <StreamTopbar
            isRefreshing={isFetching && !isLoading}
            onMenu={() => setMobileMenuOpen(true)}
            onSearchChange={setSearchTerm}
            searchTerm={searchTerm}
          />
          <div className="mx-auto grid min-w-0 max-w-[1360px] gap-5 px-4 py-5 sm:px-5 lg:px-7">
            {isError && (
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-catalogue-yellow/40 bg-catalogue-yellow/10 px-4 py-2.5 text-xs text-catalogue-ink">
                <span>Couldn&apos;t load the voice catalogue. Showing what&apos;s cached, if anything.</span>
                <button
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-catalogue-line-strong px-2.5 py-1 font-semibold hover:bg-catalogue-surface-hover"
                  onClick={() => void refetch()}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                  Retry
                </button>
              </div>
            )}

            {filterOptions && (
              <FilterBar
                filters={filters}
                onChange={updateFilter}
                onClear={() => setFilters(defaultFilters)}
                options={cascadedFilterOptions}
              />
            )}

            {isLoading ? (
              <HeroSkeleton />
            ) : (
              <DiscoverHero
                metrics={catalogueMetrics}
                onExplore={() => scrollTo('featured-collections')}
                onHowItWorks={() => scrollTo('recent-decks')}
              />
            )}

            <section className="min-w-0" id="featured-collections">
              <SectionHeading
                action={
                  hasMoreCollections ? (
                    <button
                      className="text-xs font-semibold text-catalogue-blue-bright hover:text-catalogue-ink"
                      onClick={() => setShowAllCollections((current) => !current)}
                      type="button"
                    >
                      {showAllCollections ? 'Show less' : 'View all'}
                    </button>
                  ) : undefined
                }
                title="Featured Voice Collections"
              />
              {isLoading ? (
                <div className="mt-2 flex min-w-0 gap-2 overflow-hidden">
                  {Array.from({ length: 6 }, (_, index) => (
                    <CollectionCardSkeleton key={index} />
                  ))}
                </div>
              ) : visibleCollections.length ? (
                <div className="mt-2">
                  <CarouselRow label="Featured voice collections">
                    {visibleCollections.map((collection) => (
                      <CollectionCard
                        collection={collection}
                        key={collection.id}
                        onPlay={() => {
                          selectCollection(collection.id);
                          setIsPlaying(true);
                        }}
                        onSelect={() => selectCollection(collection.id)}
                        selected={collection.id === selectedCollectionId}
                      />
                    ))}
                  </CarouselRow>
                </div>
              ) : (
                <div className="mt-2">
                  <EmptyCatalogueState query={searchTerm} />
                </div>
              )}
            </section>

            <div
              className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(290px,0.84fr)]"
              id="recent-decks"
            >
              <RecentStreamDecks
                addedDeckIds={addedDeckIds}
                decks={streamDecks}
                isLoading={isLoading}
                onAdd={toggleDeckAdded}
                onSelect={selectDeck}
              />
              <VerifiedVoices isLoading={isLoading} onSelect={selectSpeaker} speakers={verifiedSpeakers} />
            </div>
          </div>
        </main>

        <aside className="stream-catalogue-scrollbar hidden min-h-0 overflow-y-auto border-l border-catalogue-line bg-catalogue-surface lg:block">
          <CollectionInspector
            added={selectedCollection ? addedCollectionIds.has(selectedCollection.id) : false}
            collection={selectedCollection}
            isLoading={isLoading}
            isPlaying={isPlaying}
            onAdd={toggleCollectionAdded}
            onClose={() => setSelectedCollectionId(null)}
            onTogglePlay={() => setIsPlaying((current) => !current)}
            validation={validationBreakdown}
          />
        </aside>
      </div>

      {mobileInspectorOpen && selectedCollection && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/65 lg:hidden"
          role="presentation"
        >
          <div
            className="max-h-[calc(100svh-var(--catalogue-player-height))] w-full overflow-hidden rounded-t-2xl border border-catalogue-line bg-catalogue-surface shadow-2xl"
            role="dialog"
            aria-label={`${selectedCollection.title} details`}
          >
            <div className="flex items-center justify-between border-b border-catalogue-line px-5 py-3">
              <span className="mx-auto h-1 w-10 rounded-full bg-catalogue-line-strong" />
              <button
                aria-label="Close collection details"
                className="absolute right-4 top-3 grid size-8 place-items-center rounded-lg text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
                onClick={() => setMobileInspectorOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <CollectionInspector
              added={addedCollectionIds.has(selectedCollection.id)}
              collection={selectedCollection}
              isPlaying={isPlaying}
              onAdd={toggleCollectionAdded}
              onClose={() => setMobileInspectorOpen(false)}
              onTogglePlay={() => setIsPlaying((current) => !current)}
              validation={validationBreakdown}
            />
          </div>
        </div>
      )}

      <StreamPlayerBar
        added={selectedCollection ? addedCollectionIds.has(selectedCollection.id) : false}
        collection={selectedCollection}
        isPlaying={isPlaying}
        onAdd={toggleCollectionAdded}
        onToggle={() => setIsPlaying((current) => !current)}
      />
    </div>
  );
}
