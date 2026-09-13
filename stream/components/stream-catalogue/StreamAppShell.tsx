'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  catalogueMetrics,
  collections,
  defaultFilters,
  filterOptions,
  pinnedCollections,
  streamDecks,
  validationBreakdown,
  verifiedSpeakers,
} from './mock-data';
import type { CatalogueFilters, FilterKey, StreamDeck, VerifiedSpeaker } from './types';
import { CollectionCard } from './CollectionCard';
import { CollectionInspector } from './CollectionInspector';
import { DiscoverHero } from './DiscoverHero';
import { FilterBar } from './FilterBar';
import { RecentStreamDecks } from './RecentStreamDecks';
import { StreamPlayerBar } from './StreamPlayerBar';
import { StreamSidebar } from './StreamSidebar';
import { StreamTopbar } from './StreamTopbar';
import { EmptyCatalogueState, SectionHeading } from './primitives';
import { VerifiedVoices } from './VerifiedVoices';

export function StreamAppShell() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<CatalogueFilters>(defaultFilters);
  const [selectedCollectionId, setSelectedCollectionId] = useState(collections[0].id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [addedCollectionIds, setAddedCollectionIds] = useState<Set<string>>(new Set());
  const [addedDeckIds, setAddedDeckIds] = useState<Set<string>>(new Set());

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
      const matchesLanguage = !filters.language || collection.language === filters.language;
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
        matchesLanguage &&
        matchesCountry &&
        matchesDialect &&
        matchesSubdialect &&
        matchesQuality &&
        matchesLicense
      );
    });
  }, [filters, searchTerm]);

  function selectCollection(id: string, openMobile = true) {
    setSelectedCollectionId(id);
    setIsPlaying(false);
    if (openMobile) setMobileInspectorOpen(true);
  }

  function selectDeck(deck: StreamDeck) {
    const related =
      collections.find((collection) => collection.dialect === deck.dialect) ?? collections[0];
    selectCollection(related.id);
  }

  function selectSpeaker(speaker: VerifiedSpeaker) {
    const related =
      collections.find((collection) => collection.language === speaker.language) ?? collections[0];
    selectCollection(related.id);
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
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
            onMenu={() => setMobileMenuOpen(true)}
            onSearchChange={setSearchTerm}
            searchTerm={searchTerm}
          />
          <div className="mx-auto grid min-w-0 max-w-[1360px] gap-5 px-4 py-5 sm:px-5 lg:px-7">
            <FilterBar
              filters={filters}
              onChange={updateFilter}
              onClear={() => setFilters(defaultFilters)}
              options={filterOptions}
            />
            <DiscoverHero
              metrics={catalogueMetrics}
              onExplore={() => scrollTo('featured-collections')}
              onHowItWorks={() => scrollTo('recent-decks')}
            />

            <section className="min-w-0" id="featured-collections">
              <SectionHeading
                action={
                  <button
                    className="text-xs font-semibold text-catalogue-blue-bright hover:text-catalogue-ink"
                    type="button"
                  >
                    View all
                  </button>
                }
                title="Featured Voice Collections"
              />
              {filteredCollections.length ? (
                <div className="stream-catalogue-scrollbar mt-2 flex min-w-0 gap-2 overflow-x-auto pb-2">
                  {filteredCollections.map((collection) => (
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
                onAdd={toggleDeckAdded}
                onSelect={selectDeck}
              />
              <VerifiedVoices onSelect={selectSpeaker} speakers={verifiedSpeakers} />
            </div>
          </div>
        </main>

        <aside className="stream-catalogue-scrollbar hidden min-h-0 overflow-y-auto border-l border-catalogue-line bg-catalogue-surface lg:block">
          <CollectionInspector
            added={selectedCollection ? addedCollectionIds.has(selectedCollection.id) : false}
            collection={selectedCollection}
            isPlaying={isPlaying}
            onAdd={toggleCollectionAdded}
            onClose={() => setSelectedCollectionId('')}
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
