'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, RefreshCw, X } from 'lucide-react';
import { useGetCatalogueShowcaseQuery } from '@/store/api';
import type {
  CatalogueCollection,
  CatalogueFilters,
  FilterKey,
  StreamDeck,
  VerifiedSpeaker,
} from './types';
import { CollectionCard } from './CollectionCard';
import { CollectionInspector } from './CollectionInspector';
import { DiscoverHero } from './DiscoverHero';
import { FilterBar } from './FilterBar';
import { RecentStreamDecks } from './RecentStreamDecks';
import { StreamPlayerBar } from './StreamPlayerBar';
import { StreamSidebar } from './StreamSidebar';
import { StreamTopbar } from './StreamTopbar';
import { useCatalogueSearch } from './CatalogueSearchContext';
import { useGeoFilterOptions } from './useGeoFilterOptions';
import {
  CarouselRow,
  CollectionCardSkeleton,
  EmptyCatalogueState,
  HeroSkeleton,
  SectionHeading,
} from './primitives';
import { VerifiedVoices } from './VerifiedVoices';
import { useAuthGate } from './useAuthGate';

/** Matches StreamPlayerBar's own fixed height. */
const PLAYER_HEIGHT = '60px';

export function StreamAppShell() {
  const { status: sessionStatus } = useSession();
  const { guard, dialog: actionAuthDialog } = useAuthGate();
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

  // Shared with every /dashboard page through CatalogueSearchProvider, so a
  // query survives navigating away and back.
  const { searchTerm, setSearchTerm, filters, updateFilter, clearFilters } = useCatalogueSearch();
  // Nothing is selected until the member picks something. The inspector
  // used to auto-select collections[0] on mount, which opened a dataset
  // panel and loaded its preview into the player before anyone had asked
  // for it -- and made the inspector's own "Select a collection" empty
  // state unreachable, as well as quietly undoing its close button.
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [addedCollectionIds, setAddedCollectionIds] = useState<Set<string>>(new Set());
  const [addedDeckIds, setAddedDeckIds] = useState<Set<string>>(new Set());
  const [showAllCollections, setShowAllCollections] = useState(false);

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
    guard('/dashboard/decks', () => {
      setAddedCollectionIds((current) => {
        const next = new Set(current);
        if (next.has(selectedCollection.id)) next.delete(selectedCollection.id);
        else next.add(selectedCollection.id);
        return next;
      });
    });
  }

  function toggleDeckAdded(id: string) {
    guard('/dashboard/decks', () => {
      setAddedDeckIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    });
  }

  function togglePreview(forcePlay = false) {
    guard('/dashboard/explore', () => {
      setIsPlaying((current) => (forcePlay ? true : !current));
    });
  }

  // Country/dialect/subdialect come from the database (GeoController's
  // Country -> Dialect -> DialectVariant tables) rather than from whatever
  // the loaded collections happen to contain. The old version derived each
  // list by filtering collections against the upstream choices, which meant
  // the dropdowns only ever offered values that already had data in the
  // current result set -- and since getCatalogueShowcase is still mock
  // data, those options were fictional. License stays collection-derived:
  // it belongs to the licence agreement, not to geography.
  const licenseOptions = useMemo(
    () => Array.from(new Set(collections.map((c) => c.license).filter(Boolean))).sort(),
    [collections],
  );
  const { options: cascadedFilterOptions } = useGeoFilterOptions(filters, licenseOptions);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const featuredLimit = 8;
  const visibleCollections = showAllCollections
    ? filteredCollections
    : filteredCollections.slice(0, featuredLimit);
  const hasMoreCollections = filteredCollections.length > featuredLimit;

  return (
    <div
      className="stream-catalogue h-svh w-full overflow-hidden bg-catalogue-bg text-catalogue-ink"
      style={
        {
          // Zero when no track is loaded: StreamPlayerBar renders nothing
          // without a collection, so reserving its strip unconditionally
          // left a dead band of page background below every column.
          //
          // Set inline rather than as a `sm:` utility because an inline
          // custom property wins over a class at every breakpoint -- the
          // responsive variant would have reinstated the band at >=640px.
          '--catalogue-player-height': selectedCollection ? PLAYER_HEIGHT : '0px',
        } as CSSProperties
      }
    >
      <div className="flex h-full min-h-0 pb-[var(--catalogue-player-height)] md:grid md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)_355px]">
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

        <main className="stream-catalogue-scrollbar min-h-0 min-w-0 overflow-y-auto">
          <StreamTopbar
            isRefreshing={isFetching && !isLoading}
            onMenu={() => setMobileMenuOpen(true)}
            onSearchChange={setSearchTerm}
            searchTerm={searchTerm}
          />
          <div className="mx-auto grid min-w-0 max-w-[1360px] gap-5 px-4 py-5 sm:px-5 lg:px-7">
            {isError && (
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-catalogue-yellow/40 bg-catalogue-yellow/10 px-4 py-2.5 text-xs text-catalogue-ink">
                <span>
                  Couldn&apos;t load the voice catalogue. Showing what&apos;s cached, if anything.
                </span>
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
              <div className="flex min-w-0 items-center gap-3">
                <FilterBar
                  filters={filters}
                  onChange={updateFilter}
                  onClear={clearFilters}
                  options={cascadedFilterOptions}
                />
                {sessionStatus === 'unauthenticated' && (
                  // ml-auto parks the CTA at the far right of the row rather
                  // than letting it hug the filters -- it's a separate action
                  // from the filtering controls, so it shouldn't read as the
                  // last filter in the group.
                  <Link
                    className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap bg-catalogue-blue px-3 text-xs font-semibold text-white no-underline transition-colors hover:bg-catalogue-blue-bright"
                    href="/register"
                  >
                    Start Here
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                )}
              </div>
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
                          togglePreview(true);
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
              <VerifiedVoices
                isLoading={isLoading}
                onSelect={selectSpeaker}
                speakers={verifiedSpeakers}
              />
            </div>
          </div>
        </main>

        <aside className="stream-catalogue-scrollbar hidden h-full min-h-0 overflow-y-auto border-l border-catalogue-line bg-catalogue-surface lg:block">
          <CollectionInspector
            added={selectedCollection ? addedCollectionIds.has(selectedCollection.id) : false}
            collection={selectedCollection}
            isLoading={isLoading}
            isPlaying={isPlaying}
            onAdd={toggleCollectionAdded}
            onClose={() => setSelectedCollectionId(null)}
            onTogglePlay={() => togglePreview()}
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
            className="flex max-h-[calc(100svh-var(--catalogue-player-height))] w-full flex-col overflow-hidden rounded-t-2xl border border-catalogue-line bg-catalogue-surface shadow-2xl"
            role="dialog"
            aria-label={`${selectedCollection.title} details`}
          >
            <div className="relative flex shrink-0 items-center justify-between border-b border-catalogue-line px-5 py-3">
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
              onTogglePlay={() => togglePreview()}
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
        onToggle={() => togglePreview()}
      />
      {actionAuthDialog}
    </div>
  );
}
