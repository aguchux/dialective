'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Flag,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cardClass, EmptyPanel, formatDateTime } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { normalizeErrorMessage } from '@/store/api';
import {
  useAddValidatorDeckItemMutation,
  useCreateValidatorDeckMutation,
  useFlagValidatorDeckItemMutation,
  useGetValidatorDeckQuery,
  useGetValidatorDecksQuery,
  useGetValidatorRecordingsQuery,
  useScoreValidatorDeckItemMutation,
  useUpdateValidatorTranscriptMutation,
  type ValidatorDeckSummary,
  type ValidatorFlagReason,
  type ValidatorItemStatus,
  type ValidatorRecordingSortField,
  type ValidatorRecordingSummary,
} from '@/store/api';

const FLAG_REASONS: { value: ValidatorFlagReason; label: string }[] = [
  { value: 'UNCLEAR_AUDIO', label: 'Unclear audio' },
  { value: 'EXCESSIVE_NOISE', label: 'Excessive background noise' },
  { value: 'CLIPPING_OR_DISTORTION', label: 'Clipping or distortion' },
  { value: 'WRONG_LANGUAGE_OR_DIALECT', label: 'Wrong language or dialect' },
  { value: 'MULTIPLE_SPEAKERS', label: 'Multiple speakers' },
  { value: 'INCORRECT_PROMPT', label: 'Incorrect prompt' },
  { value: 'INCOMPLETE_RECORDING', label: 'Incomplete recording' },
  { value: 'DUPLICATE_RECORDING', label: 'Duplicate recording' },
  { value: 'UNABLE_TO_TRANSCRIBE', label: 'Unable to transcribe confidently' },
  { value: 'OTHER', label: 'Other' },
];

const SORT_OPTIONS: { sortBy: ValidatorRecordingSortField; sortDir: 'asc' | 'desc'; label: string }[] = [
  { sortBy: 'createdAt', sortDir: 'desc', label: 'Newest' },
  { sortBy: 'createdAt', sortDir: 'asc', label: 'Oldest' },
  { sortBy: 'compositeScore', sortDir: 'desc', label: 'Highest score' },
  { sortBy: 'compositeScore', sortDir: 'asc', label: 'Lowest score' },
];

const STATUS_OPTIONS: { value: ValidatorRecordingSummary['status']; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'TRANSCRIBED', label: 'Transcribed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SCORED', label: 'Scored' },
  { value: 'SETTLED', label: 'Settled' },
  { value: 'EXPIRED', label: 'Expired' },
];

interface RecordingFilters {
  dialectTag: string;
  status: ValidatorRecordingSummary['status'] | null;
  minScore: number | null;
  maxScore: number | null;
}

const EMPTY_FILTERS: RecordingFilters = { dialectTag: '', status: null, minScore: null, maxScore: null };

function countActiveFilters(filters: RecordingFilters): number {
  let count = 0;
  if (filters.dialectTag.trim()) count += 1;
  if (filters.status) count += 1;
  if (filters.minScore !== null || filters.maxScore !== null) count += 1;
  return count;
}

/**
 * Task Mode -- the full-screen validation workspace entered from Start Task
 * (see ValidationsView). Renders as a fixed, viewport-covering overlay so
 * the outer ValidatorHeader/ValidatorMobileNavigation are visually hidden
 * for the duration of a session, per the mobile UI spec's "hide platform
 * nav once a task is active" decision. Browse the recording pool (search,
 * filter by dialect/status/score, sort), play audio, transcribe, flag, and
 * add a recording to a deck to score it there (scoring is deck-scoped by
 * design -- see ValidatorDecksService.scoreItem -- so "score a recording"
 * always routes through "add it to one of your decks" first). Real
 * waveform/loop-region/zoom are still deferred to a later pass -- see the
 * mobile spec's Playback Segment section.
 */
export function TaskMode({ onEndTask }: { onEndTask: () => void }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<RecordingFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [activeRecording, setActiveRecording] = useState<ValidatorRecordingSummary | null>(null);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [deckPickerRecording, setDeckPickerRecording] = useState<ValidatorRecordingSummary | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  // recordingId -> deckId overrides -- Transcribe/Flag are deck-item-scoped
  // (same as scoring), so the Expanded Player needs to know which deck to
  // write to. The pool-browse endpoint reports each recording's own
  // myDeckId (one of the caller's OWN decks that already contains it, from
  // an earlier session or this one) directly, so this map is now only a
  // same-tick bridge: addValidatorDeckItem invalidates the ValidatorRecordings
  // cache on success, but until that refetch actually lands this fills the
  // gap so Add to Deck -> Transcribe feels instant rather than waiting on
  // a round trip. See resolveDeckId below for how the two are combined.
  const [recordingDeckIds, setRecordingDeckIds] = useState<Record<string, string>>({});

  // activeRecording is a snapshot taken at selection time (see
  // selectRecording), not re-derived from the live query result, so a
  // myDeckId picked up by a later page's refetch after this recording was
  // selected won't retroactively update it -- an accepted staleness edge
  // case, since the override map below already covers the actually
  // UX-sensitive moment (Add to Deck succeeding for the CURRENTLY active
  // recording).
  function resolveDeckId(recording: ValidatorRecordingSummary): string | null {
    return recordingDeckIds[recording.id] ?? recording.myDeckId ?? null;
  }
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setAudioEl = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any change to what's being asked for resets to page 1 -- otherwise a
  // validator three pages into "Highest score" who then filters by dialect
  // could land on an empty page 3 of a much shorter filtered result.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters, sort]);

  const { data, isLoading, isFetching } = useGetValidatorRecordingsQuery({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    dialectTag: filters.dialectTag.trim() || undefined,
    status: filters.status ?? undefined,
    minScore: filters.minScore ?? undefined,
    maxScore: filters.maxScore ?? undefined,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
  });

  function selectRecording(recording: ValidatorRecordingSummary) {
    setActiveRecording(recording);
    setIsPlaying(true);
    // Autoplay is driven by the <audio> element's own play() call inside
    // the mini-player effect below, keyed off activeRecording.id changing.
  }

  function endTaskWithConfirm() {
    // No unsaved-transcript risk for browsing/filters (transcript drafts
    // themselves are saved explicitly, not tracked as "dirty" here) -- End
    // Task is a plain, immediate action.
    onEndTask();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-ink" role="dialog" aria-label="Validation task">
      {/*
        Exactly one <audio> element for the lifetime of Task Mode (headless
        -- no native `controls`; MiniPlayer/ExpandedPlayer build their own
        transport chrome around audioRef/setIsPlaying instead). Owned here
        rather than by MiniPlayer or ExpandedPlayer so expanding/collapsing
        the player, or switching the Playback<->Transcribe segment, never
        remounts <audio> -- currentTime/buffered state survives all of
        that instead of restarting playback from 0.
      */}
      {activeRecording && (
        <audio
          className="hidden"
          onEnded={() => setIsPlaying(false)}
          onPause={() => isPlaying && setIsPlaying(false)}
          onPlay={() => !isPlaying && setIsPlaying(true)}
          ref={setAudioEl}
          src={activeRecording.audioUrl ?? undefined}
        />
      )}

      <TaskModeTopBar onEndTask={endTaskWithConfirm} reviewedCount={reviewedCount} />

      {/*
        lg: the desktop layout from the original desktop-first prompt --
        wide multi-column catalogue alongside a right-side drawer (not a
        full-screen takeover) when the player is expanded, per the
        "resize the catalogue instead of covering it" requirement. Below
        lg, this is the mobile layout: single column, full-screen Expanded
        Player. One component tree, responsive at the breakpoint, matching
        the rest of this app's ValidatorHeader/ValidatorMobileNavigation
        lg: convention rather than a JS media-query hook.
      */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SearchToolbar
            activeFilterCount={countActiveFilters(filters)}
            onFilterOpen={() => setIsFilterSheetOpen(true)}
            onSearchChange={setSearch}
            onSortOpen={() => setIsSortSheetOpen(true)}
            search={search}
            sortLabel={sort.label}
            totalCount={data?.total}
          />
          {countActiveFilters(filters) > 0 && (
            <ActiveFilterChips filters={filters} onFiltersChange={setFilters} />
          )}

          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 pb-4 ${activeRecording ? 'pb-24 lg:pb-4' : ''}`}
          >
            {isLoading ? (
              <CatalogueSkeleton />
            ) : data && data.items.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {data.items.map((recording) => (
                  <RecordingCard
                    isActive={activeRecording?.id === recording.id}
                    isPlaying={isPlaying && activeRecording?.id === recording.id}
                    key={recording.id}
                    onAddToDeck={() => setDeckPickerRecording(recording)}
                    onSelect={() => selectRecording(recording)}
                    recording={recording}
                  />
                ))}
                {isFetching && (
                  <div className="col-span-full flex justify-center py-3">
                    <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
                  </div>
                )}
              </div>
            ) : (
              <EmptyPanel icon={Search} title="No recordings match this search" unframed />
            )}

            {data && data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3 text-sm font-bold">
                <button
                  className="min-h-10 rounded-lg border border-line px-3 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  Previous
                </button>
                <span>
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  className="min-h-10 rounded-lg border border-line px-3 disabled:opacity-40"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/*
            Desktop's persistent bottom workstation -- always docked while
            a recording is loaded (no expand/collapse concept at this
            width, matching the desktop spec's "not a website footer, a
            persistent application control surface"). Positioned inside
            the catalogue column (not viewport-fixed) so it never overlaps
            the drawer.
          */}
          {activeRecording && (
            <DesktopWorkstation
              audioRef={audioRef}
              isPlaying={isPlaying}
              onOpenDrawer={() => setIsPlayerExpanded(true)}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              recording={activeRecording}
            />
          )}
        </div>

        {activeRecording && isPlayerExpanded && (
          <ExpandedPlayer
            audioRef={audioRef}
            deckId={resolveDeckId(activeRecording)}
            isPlaying={isPlaying}
            onAddToDeck={() => setDeckPickerRecording(activeRecording)}
            onClose={() => setIsPlayerExpanded(false)}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            recording={activeRecording}
          />
        )}
      </div>

      {activeRecording && (
        <MiniPlayer
          audioRef={audioRef}
          isExpanded={isPlayerExpanded}
          isPlaying={isPlaying}
          onExpand={() => setIsPlayerExpanded(true)}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          recording={activeRecording}
        />
      )}

      {deckPickerRecording && (
        <AddToDeckSheet
          onAdded={(deckId) =>
            setRecordingDeckIds((prev) => ({ ...prev, [deckPickerRecording.id]: deckId }))
          }
          onClose={() => setDeckPickerRecording(null)}
          onScored={() => setReviewedCount((c) => c + 1)}
          recording={deckPickerRecording}
        />
      )}

      {isFilterSheetOpen && (
        <FilterSheet
          filters={filters}
          onApply={setFilters}
          onClose={() => setIsFilterSheetOpen(false)}
        />
      )}

      {isSortSheetOpen && (
        <SortSheet
          onClose={() => setIsSortSheetOpen(false)}
          onSelect={setSort}
          selected={sort}
        />
      )}
    </div>
  );
}

function TaskModeTopBar({ onEndTask, reviewedCount }: { onEndTask: () => void; reviewedCount: number }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-3">
      <button
        className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-muted hover:bg-surface-muted hover:text-ink"
        onClick={onEndTask}
        type="button"
      >
        <X className="size-4" aria-hidden="true" />
        End Task
      </button>
      <span className="text-xs font-bold text-muted">{reviewedCount} reviewed</span>
    </div>
  );
}

function SearchToolbar({
  search,
  onSearchChange,
  totalCount,
  activeFilterCount,
  onFilterOpen,
  sortLabel,
  onSortOpen,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  totalCount?: number;
  activeFilterCount: number;
  onFilterOpen: () => void;
  sortLabel: string;
  onSortOpen: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-line bg-bg px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="min-h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search dialect, prompt, or recording ID…"
            value={search}
          />
        </div>
        <button
          className={`relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold ${
            activeFilterCount > 0 ? 'border-accent text-accent' : 'border-line text-ink hover:bg-surface-muted'
          }`}
          onClick={onFilterOpen}
          type="button"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="grid size-4 place-items-center rounded-full bg-accent text-[10px] text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          className="flex min-h-8 items-center gap-1 text-xs font-bold text-muted hover:text-ink"
          onClick={onSortOpen}
          type="button"
        >
          Sort: {sortLabel}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
        {typeof totalCount === 'number' && (
          <p className="text-xs font-bold text-muted">{totalCount} recordings</p>
        )}
      </div>
    </div>
  );
}

function ActiveFilterChips({
  filters,
  onFiltersChange,
}: {
  filters: RecordingFilters;
  onFiltersChange: (filters: RecordingFilters) => void;
}) {
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.dialectTag.trim()) {
    chips.push({
      key: 'dialect',
      label: `Dialect: ${filters.dialectTag.trim()}`,
      onRemove: () => onFiltersChange({ ...filters, dialectTag: '' }),
    });
  }
  if (filters.status) {
    chips.push({
      key: 'status',
      label: STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status,
      onRemove: () => onFiltersChange({ ...filters, status: null }),
    });
  }
  if (filters.minScore !== null || filters.maxScore !== null) {
    chips.push({
      key: 'score',
      label: `Score: ${filters.minScore ?? 0}–${filters.maxScore ?? 100}`,
      onRemove: () => onFiltersChange({ ...filters, minScore: null, maxScore: null }),
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-bg px-4 py-2">
      {chips.map((chip) => (
        <button
          className="flex min-h-7 shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2.5 text-xs font-bold text-accent"
          key={chip.key}
          onClick={chip.onRemove}
          type="button"
        >
          {chip.label}
          <X className="size-3" aria-hidden="true" />
        </button>
      ))}
      <button
        className="shrink-0 text-xs font-bold text-muted underline hover:text-ink"
        onClick={() => onFiltersChange(EMPTY_FILTERS)}
        type="button"
      >
        Clear all
      </button>
    </div>
  );
}

function FilterSheet({
  filters,
  onApply,
  onClose,
}: {
  filters: RecordingFilters;
  onApply: (filters: RecordingFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);

  function handleApply() {
    onApply(draft);
    onClose();
  }

  function handleClear() {
    setDraft(EMPTY_FILTERS);
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent title="Filters">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Dialect</span>
            <input
              className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm"
              onChange={(e) => setDraft((prev) => ({ ...prev, dialectTag: e.target.value }))}
              placeholder="e.g. ig, yo, ha…"
              value={draft.dialectTag}
            />
          </label>

          <div className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Validation status
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((option) => (
                <button
                  aria-pressed={draft.status === option.value}
                  className={`min-h-8 rounded-full border px-3 text-xs font-bold ${
                    draft.status === option.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-ink hover:bg-surface-muted'
                  }`}
                  key={option.value}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      status: prev.status === option.value ? null : option.value,
                    }))
                  }
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Min score</span>
              <input
                className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm"
                max={100}
                min={0}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    minScore: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                type="number"
                value={draft.minScore ?? ''}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Max score</span>
              <input
                className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm"
                max={100}
                min={0}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    maxScore: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                type="number"
                value={draft.maxScore ?? ''}
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              className="min-h-10 flex-1 rounded-lg border border-line px-3 text-sm font-bold text-ink hover:bg-surface-muted"
              onClick={handleClear}
              type="button"
            >
              Clear all
            </button>
            <button
              className="min-h-10 flex-1 rounded-lg bg-accent px-3 text-sm font-extrabold text-white hover:bg-accent/90"
              onClick={handleApply}
              type="button"
            >
              Show recordings
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortSheet({
  selected,
  onSelect,
  onClose,
}: {
  selected: (typeof SORT_OPTIONS)[number];
  onSelect: (option: (typeof SORT_OPTIONS)[number]) => void;
  onClose: () => void;
}) {
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent title="Sort">
        <div className="grid gap-1.5">
          {SORT_OPTIONS.map((option) => (
            <button
              aria-pressed={selected.label === option.label}
              className={`flex min-h-11 items-center rounded-lg border px-3 text-left text-sm font-bold ${
                selected.label === option.label
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line hover:bg-surface-muted'
              }`}
              key={option.label}
              onClick={() => {
                onSelect(option);
                onClose();
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CatalogueSkeleton() {
  return (
    <div className="grid gap-3 pt-3">
      {[0, 1, 2, 3].map((i) => (
        <div className={`${cardClass} h-32 animate-pulse`} key={i} />
      ))}
    </div>
  );
}

function RecordingCard({
  recording,
  isActive,
  isPlaying,
  onSelect,
  onAddToDeck,
}: {
  recording: ValidatorRecordingSummary;
  isActive: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onAddToDeck: () => void;
}) {
  return (
    <div
      className={`${cardClass} grid gap-2.5 p-3.5 ${isActive ? 'border-accent bg-accent/5' : ''} relative`}
    >
      {isActive && <span className="absolute inset-y-3 left-0 w-1 rounded-full bg-accent" aria-hidden="true" />}
      <button className="grid gap-2.5 pl-2 text-left" onClick={onSelect} type="button">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-muted">
            {recording.dialectTag}
          </p>
          {isPlaying ? (
            <PlayingGlyph />
          ) : (
            <Play className="size-4 shrink-0 text-accent" aria-hidden="true" />
          )}
        </div>
        <p className="line-clamp-2 font-bold leading-snug">{recording.promptText}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {recording.compositeScore && <ScoreBadge label="Overall" value={recording.compositeScore} />}
          {recording.score && <ScoreBadge label="Score" value={recording.score} />}
          <StatusPill status={recording.status} />
          <span>{formatDateTime(recording.createdAt)}</span>
        </div>
      </button>
      <div className="flex items-center gap-2 pl-2">
        <button
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm font-bold text-ink hover:bg-surface-muted"
          onClick={onAddToDeck}
          type="button"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add to Deck
        </button>
      </div>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-surface-muted px-2 py-0.5 font-bold text-ink">
      {label} {Number(value).toFixed(0)}
    </span>
  );
}

function StatusPill({ status }: { status: ValidatorRecordingSummary['status'] }) {
  return <span className="rounded-full bg-surface-muted px-2 py-0.5 font-bold">{status}</span>;
}

function PlayingGlyph() {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      <span className="h-2.5 w-0.5 animate-[eq_0.8s_ease-in-out_infinite] bg-accent motion-reduce:animate-none" />
      <span className="h-3.5 w-0.5 animate-[eq_0.8s_ease-in-out_infinite_0.2s] bg-accent motion-reduce:animate-none" />
      <span className="h-2 w-0.5 animate-[eq_0.8s_ease-in-out_infinite_0.4s] bg-accent motion-reduce:animate-none" />
    </span>
  );
}

function MiniPlayer({
  recording,
  isPlaying,
  onTogglePlay,
  onExpand,
  audioRef,
  isExpanded,
}: {
  recording: ValidatorRecordingSummary;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onExpand: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isExpanded: boolean;
}) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [audioRef, isPlaying, recording.id]);

  // Presentational only while the Expanded Player/drawer is open -- the
  // shared <audio> element (owned by TaskMode) keeps playing underneath,
  // but this bar's own chrome is redundant with it, so it renders nothing
  // rather than a second, competing set of controls. Also hidden at
  // desktop widths entirely -- DesktopWorkstation is the persistent bottom
  // bar there (this bar's useEffect above keeps running regardless, since
  // it's what actually drives audio.play()/pause()).
  if (isExpanded) return null;

  return (
    <button
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center gap-3 border-t border-line bg-surface px-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] lg:hidden"
      onClick={onExpand}
      type="button"
    >
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold">{recording.promptText}</span>
        <span className="block truncate text-xs text-muted">{recording.dialectTag}</span>
      </span>
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay();
        }}
        role="button"
        tabIndex={0}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onTogglePlay();
          }
        }}
      >
        {isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
      </span>
    </button>
  );
}

/**
 * Desktop's persistent bottom workstation (lg+ only, hidden below that --
 * see the lg:hidden on MiniPlayer's own bar). Unlike MiniPlayer there is no
 * expand/collapse state here: it's always docked while a recording is
 * loaded, matching the desktop spec's "not a website footer, a persistent
 * application control surface." "Expand" here means open the right-side
 * drawer (ExpandedPlayer at lg widths), not a full-screen takeover.
 */
function DesktopWorkstation({
  recording,
  isPlaying,
  onTogglePlay,
  onOpenDrawer,
  audioRef,
}: {
  recording: ValidatorRecordingSummary;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onOpenDrawer: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}) {
  const { currentTime, duration } = useAudioTime(audioRef, recording.id);

  return (
    <div className="hidden shrink-0 items-center gap-4 border-t border-line bg-surface px-5 py-3 lg:flex">
      <button
        className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white"
        onClick={onTogglePlay}
        type="button"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
      </button>

      <div className="min-w-0 shrink-0" style={{ width: '220px' }}>
        <p className="truncate text-sm font-bold">{recording.promptText}</p>
        <p className="truncate text-xs text-muted">{recording.dialectTag}</p>
      </div>

      <span className="shrink-0 font-mono text-xs text-muted">{formatSeconds(currentTime)}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/20">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-xs text-muted">{formatSeconds(duration)}</span>

      <button
        className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-bold text-ink hover:bg-surface-muted"
        onClick={onOpenDrawer}
        type="button"
      >
        Open workspace
      </button>
    </div>
  );
}

function ExpandedPlayer({
  recording,
  isPlaying,
  onTogglePlay,
  onClose,
  onAddToDeck,
  audioRef,
  deckId,
}: {
  recording: ValidatorRecordingSummary;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
  onAddToDeck: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  deckId: string | null;
}) {
  const [segment, setSegment] = useState<'playback' | 'transcribe'>('playback');
  const [isFlagSheetOpen, setIsFlagSheetOpen] = useState(false);

  return (
    // Mobile (<lg): full-screen takeover, matches the mobile spec's
    // Expanded Player exactly. Desktop (lg+): a fixed-width right-side
    // drawer instead -- the catalogue stays visible and scrollable to its
    // left (its parent flex row in TaskMode isn't touched by this drawer),
    // per the desktop spec's "resize the catalogue instead of covering
    // it" requirement.
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-ink lg:static lg:inset-auto lg:z-auto lg:h-full lg:w-95 lg:shrink-0 lg:border-l lg:border-line xl:w-105">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <button
          className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
          onClick={onClose}
          type="button"
          aria-label="Close panel"
        >
          <ChevronDown className="size-5 lg:hidden" aria-hidden="true" />
          <X className="hidden size-5 lg:block" aria-hidden="true" />
        </button>
        <div
          className="flex rounded-lg border border-line p-0.5 text-xs font-bold"
          role="tablist"
          aria-label="Player mode"
        >
          <button
            aria-selected={segment === 'playback'}
            className={`min-h-8 rounded-md px-3 ${segment === 'playback' ? 'bg-accent text-white' : 'text-muted'}`}
            onClick={() => setSegment('playback')}
            role="tab"
            type="button"
          >
            Playback
          </button>
          <button
            aria-selected={segment === 'transcribe'}
            className={`min-h-8 rounded-md px-3 ${segment === 'transcribe' ? 'bg-accent text-white' : 'text-muted'}`}
            onClick={() => setSegment('transcribe')}
            role="tab"
            type="button"
          >
            Transcribe
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
            onClick={() => setIsFlagSheetOpen(true)}
            type="button"
            aria-label="Flag recording"
          >
            <Flag className="size-5" aria-hidden="true" />
          </button>
          <button
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
            onClick={onAddToDeck}
            type="button"
            aria-label="Add to Deck"
          >
            <ListMusic className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {segment === 'playback' ? (
        <PlaybackSegment
          audioRef={audioRef}
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          recording={recording}
        />
      ) : (
        <TranscribeSegment deckId={deckId} onAddToDeck={onAddToDeck} recording={recording} />
      )}

      {isFlagSheetOpen && (
        <FlagRecordingSheet
          deckId={deckId}
          onAddToDeck={() => {
            setIsFlagSheetOpen(false);
            onAddToDeck();
          }}
          onClose={() => setIsFlagSheetOpen(false)}
          recording={recording}
        />
      )}
    </div>
  );
}

/**
 * Playback segment -- transport chrome (play/pause, scrubber, time) built
 * around the single shared <audio> element (audioRef, owned by TaskMode),
 * not a second <audio controls> of its own -- see TaskMode's doc comment
 * on why there is exactly one <audio> element for the whole Task Mode
 * session. Real waveform/loop-region/zoom are deferred to a later pass --
 * see the mobile spec's Playback Segment section.
 */
function PlaybackSegment({
  recording,
  audioRef,
  isPlaying,
  onTogglePlay,
}: {
  recording: ValidatorRecordingSummary;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  onTogglePlay: () => void;
}) {
  const [loopRegion, setLoopRegion] = useState<[number, number] | null>(null);
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);

  // A fresh recording never inherits the previous one's loop selection.
  useEffect(() => {
    setLoopRegion(null);
    setIsLoopEnabled(false);
  }, [recording.id]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{recording.dialectTag}</p>
        <p className="mt-2 text-xl font-black leading-snug">{recording.promptText}</p>
        <p className="mt-1 select-all font-mono text-xs text-muted">{recording.id}</p>
      </div>

      <div className="flex w-full max-w-md items-center gap-3">
        <button
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white"
          onClick={onTogglePlay}
          type="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
        </button>
        <button
          aria-label="Loop selected region"
          aria-pressed={isLoopEnabled}
          className={`grid size-9 shrink-0 place-items-center rounded-lg border ${
            isLoopEnabled ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:bg-surface-muted'
          } disabled:cursor-not-allowed disabled:opacity-40`}
          disabled={!loopRegion}
          onClick={() => setIsLoopEnabled((v) => !v)}
          type="button"
        >
          <Repeat className="size-4" aria-hidden="true" />
        </button>
      </div>

      <Waveform
        audioRef={audioRef}
        isLoopEnabled={isLoopEnabled}
        isPlaying={isPlaying}
        loopRegion={loopRegion}
        onLoopRegionChange={setLoopRegion}
        recording={recording}
      />

      <p className="max-w-sm text-xs text-muted">
        Tap the waveform to seek, or drag across it to select a region and loop it while you
        transcribe.
      </p>
    </div>
  );
}

/**
 * Polls the shared <audio> element's currentTime/duration via
 * requestAnimationFrame -- no dependency on native <audio controls>, which
 * this build deliberately avoids duplicating (see TaskMode's single-<audio>
 * doc comment). Shared by the Waveform's playhead and the plain fallback
 * time readout.
 */
function useAudioTime(audioRef: React.RefObject<HTMLAudioElement | null>, recordingId: string) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);

    let frame: number;
    const tick = () => {
      setCurrentTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onLoadedMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
    // recordingId dependency: re-attach when the shared <audio>'s src
    // changes to a new recording, so time/duration reset to that
    // recording's own values instead of showing the previous one's.
  }, [audioRef, recordingId]);

  return { currentTime, duration };
}

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const ZOOM_LEVELS = [1, 2, 4, 8];
const WAVEFORM_BAR_COUNT = 200; // peaks resolution, independent of zoom -- zoom stretches bar width, not peak count

/**
 * Decodes the recording's own audio (fetch + Web Audio API decodeAudioData)
 * into a fixed-resolution peaks array -- no backend waveform-data endpoint
 * exists yet, so this computes it client-side. Recordings here are short
 * (a few seconds of dictated speech), so a full fetch+decode per recording
 * is cheap; re-decodes whenever the recording changes. Returns null while
 * decoding/on failure so the caller can render a loading/fallback state.
 */
interface WaveformPeaksState {
  status: 'loading' | 'ready' | 'error';
  peaks: number[] | null;
}

/**
 * Decoding can fail for reasons outside this app's control (a storage
 * bucket that hasn't been CORS-configured for cross-origin fetch+decode, an
 * unsupported codec, a purged/expired audio URL) -- surfaced as an explicit
 * 'error' status rather than silently staying null forever, so the caller
 * can fall back to a plain seek bar instead of an indefinite spinner.
 */
function useWaveformPeaks(audioUrl: string | null, recordingId: string): WaveformPeaksState {
  const [state, setState] = useState<WaveformPeaksState>({ status: 'loading', peaks: null });

  useEffect(() => {
    setState({ status: 'loading', peaks: null });
    if (!audioUrl) {
      setState({ status: 'error', peaks: null });
      return;
    }
    let cancelled = false;
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setState({ status: 'error', peaks: null });
      return;
    }

    async function decode() {
      try {
        const response = await fetch(audioUrl as string);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new AudioContextCtor();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (cancelled) return;
        const channelData = audioBuffer.getChannelData(0);
        const blockSize = Math.max(1, Math.floor(channelData.length / WAVEFORM_BAR_COUNT));
        const computed: number[] = [];
        for (let i = 0; i < WAVEFORM_BAR_COUNT; i += 1) {
          const start = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize && start + j < channelData.length; j += 1) {
            sum += Math.abs(channelData[start + j]);
          }
          computed.push(sum / blockSize);
        }
        const max = Math.max(...computed, 0.0001);
        void audioContext.close();
        if (!cancelled) setState({ status: 'ready', peaks: computed.map((v) => v / max) });
      } catch {
        if (!cancelled) setState({ status: 'error', peaks: null });
      }
    }

    void decode();
    return () => {
      cancelled = true;
    };
  }, [audioUrl, recordingId]);

  return state;
}

/**
 * Interactive waveform -- tap/click to seek, drag across bars to select a
 * loop region, zoom in/out (stretches bar width, not peak resolution), and
 * a Loop toggle that snaps playback back to the region's start once
 * currentTime passes its end. Region state is owned by PlaybackSegment
 * (cleared automatically when the active recording changes there).
 */
function Waveform({
  audioRef,
  recording,
  isPlaying,
  loopRegion,
  onLoopRegionChange,
  isLoopEnabled,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  recording: ValidatorRecordingSummary;
  isPlaying: boolean;
  loopRegion: [number, number] | null;
  onLoopRegionChange: (region: [number, number] | null) => void;
  isLoopEnabled: boolean;
}) {
  const { status: peaksStatus, peaks } = useWaveformPeaks(recording.audioUrl, recording.id);
  const { currentTime, duration } = useAudioTime(audioRef, recording.id);
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_LEVELS[zoomIndex];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);

  // Loop enforcement: while looping is on and playback exits the region's
  // end, jump back to the region's start rather than continuing past it.
  useEffect(() => {
    if (!isLoopEnabled || !loopRegion || !isPlaying) return;
    const audio = audioRef.current;
    if (!audio) return;
    const [start, end] = loopRegion;
    if (currentTime >= end) {
      audio.currentTime = start;
    }
  }, [audioRef, currentTime, isLoopEnabled, loopRegion, isPlaying]);

  function timeAtClientX(clientX: number): number {
    const el = containerRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const scrollLeft = el.scrollLeft;
    const fraction = (clientX - rect.left + scrollLeft) / (rect.width * zoom);
    return Math.min(duration, Math.max(0, fraction * duration));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragStartRef.current = timeAtClientX(e.clientX);
    setDragCurrent(dragStartRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartRef.current === null) return;
    setDragCurrent(timeAtClientX(e.clientX));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    const end = dragCurrent;
    dragStartRef.current = null;
    setDragCurrent(null);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (start === null || end === null) return;

    const distance = Math.abs(end - start);
    if (distance < 0.15) {
      // A tap, not a drag -- seek there and clear any existing loop region.
      const audio = audioRef.current;
      if (audio) audio.currentTime = start;
      onLoopRegionChange(null);
      return;
    }
    onLoopRegionChange(start < end ? [start, end] : [end, start]);
  }

  const previewRegion =
    dragStartRef.current !== null && dragCurrent !== null
      ? ([Math.min(dragStartRef.current, dragCurrent), Math.max(dragStartRef.current, dragCurrent)] as const)
      : null;
  const visibleRegion = previewRegion ?? loopRegion;

  return (
    <div className="w-full max-w-md">
      <div
        className="relative h-24 cursor-pointer touch-none select-none overflow-x-auto rounded-lg bg-surface-muted"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={containerRef}
        role="slider"
        aria-label="Waveform seek and loop-region selector"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
      >
        {peaksStatus === 'ready' && peaks ? (
          <div className="relative flex h-full items-center gap-px px-1" style={{ width: `${zoom * 100}%` }}>
            {peaks.map((peak, i) => {
              const barTime = (i / peaks.length) * duration;
              const isPlayed = duration > 0 && barTime <= currentTime;
              const isInRegion = visibleRegion && barTime >= visibleRegion[0] && barTime <= visibleRegion[1];
              return (
                <span
                  aria-hidden="true"
                  className={`flex-1 rounded-full ${
                    isInRegion ? 'bg-accent' : isPlayed ? 'bg-accent/70' : 'bg-muted/40'
                  }`}
                  key={i}
                  style={{ height: `${Math.max(6, peak * 100)}%` }}
                />
              );
            })}
            {duration > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-px bg-ink"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            )}
          </div>
        ) : peaksStatus === 'loading' ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs font-bold text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading waveform…
          </div>
        ) : (
          // Waveform decoding failed (e.g. the audio host isn't
          // CORS-configured for cross-origin fetch+decode) -- tap-to-seek
          // and drag-to-loop still work against this plain bar since
          // neither depends on peaks, only on duration/currentTime.
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-0 right-0 m-auto h-1 rounded-full bg-muted/30" aria-hidden="true" />
            {duration > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-px bg-ink"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            )}
            {visibleRegion && duration > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 bg-accent/20"
                style={{
                  left: `${(visibleRegion[0] / duration) * 100}%`,
                  width: `${((visibleRegion[1] - visibleRegion[0]) / duration) * 100}%`,
                }}
              />
            )}
          </div>
        )}
      </div>
      {peaksStatus === 'error' && (
        <p className="mt-1 text-xs text-muted">Waveform preview unavailable -- tap or drag above to seek/loop.</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted">
          {formatSeconds(currentTime)} / {formatSeconds(duration)}
        </span>
        <div className="flex items-center gap-1">
          <button
            aria-label="Zoom out"
            className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
            type="button"
          >
            <ZoomOut className="size-4" aria-hidden="true" />
          </button>
          <button
            aria-label="Zoom in"
            className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIndex((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
            type="button"
          >
            <ZoomIn className="size-4" aria-hidden="true" />
          </button>
          {zoomIndex > 0 && (
            <button
              className="text-xs font-bold text-muted underline hover:text-ink"
              onClick={() => setZoomIndex(0)}
              type="button"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Transcribe segment. Transcript saves are deck-item-scoped (same as
 * scoring), so this needs a deckId -- when the active recording hasn't
 * been added to any deck yet this session, show a prompt to Add to Deck
 * first rather than silently creating one on the validator's behalf.
 */
function TranscribeSegment({
  recording,
  deckId,
  onAddToDeck,
}: {
  recording: ValidatorRecordingSummary;
  deckId: string | null;
  onAddToDeck: () => void;
}) {
  if (!deckId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-sm text-sm text-muted">
          Add this recording to a deck to transcribe it.
        </p>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-extrabold text-white hover:bg-accent/90"
          onClick={onAddToDeck}
          type="button"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add to Deck
        </button>
      </div>
    );
  }

  return <TranscribeEditor deckId={deckId} recording={recording} />;
}

function TranscribeEditor({
  recording,
  deckId,
}: {
  recording: ValidatorRecordingSummary;
  deckId: string;
}) {
  const { data: deck, isLoading } = useGetValidatorDeckQuery(deckId);
  const [updateTranscript, { isLoading: isSaving }] = useUpdateValidatorTranscriptMutation();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const item = deck?.items.find((i) => i.recordingId === recording.id);
  // Seed the draft from the saved transcript once, the first time it
  // loads -- afterward the textarea is the source of truth so a refetch
  // (e.g. from another mutation invalidating this deck's tag) never
  // clobbers text the validator is mid-typing.
  const value = draft ?? item?.validatorTranscript ?? '';

  async function handleSave() {
    setError(null);
    try {
      await updateTranscript({ id: deckId, recordingId: recording.id, transcript: value }).unwrap();
      setSavedAt(Date.now());
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this transcript.'));
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <div className="h-40 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{recording.dialectTag}</p>
        <p className="mt-1 font-bold leading-snug">{recording.promptText}</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
          {error}
        </p>
      )}

      <textarea
        className="min-h-40 flex-1 rounded-lg border border-line bg-surface p-3 text-sm"
        onChange={(e) => {
          setDraft(e.target.value);
          setSavedAt(null);
        }}
        placeholder="Type what you hear in the recording…"
        value={value}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-muted">
          {isSaving ? 'Saving…' : savedAt ? 'Saved' : item?.validatorTranscriptUpdatedAt ? 'Unsaved changes' : ''}
        </span>
        <ActionButton
          className="min-h-10 rounded-lg bg-accent px-4 text-sm font-extrabold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!value.trim()}
          onClick={() => void handleSave()}
          pending={isSaving}
          pendingLabel="Saving"
          type="button"
        >
          Save Transcription
        </ActionButton>
      </div>
    </div>
  );
}

function FlagRecordingSheet({
  recording,
  deckId,
  onClose,
  onAddToDeck,
}: {
  recording: ValidatorRecordingSummary;
  deckId: string | null;
  onClose: () => void;
  onAddToDeck: () => void;
}) {
  const [flagItem, { isLoading: isSaving }] = useFlagValidatorDeckItemMutation();
  const [reason, setReason] = useState<ValidatorFlagReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFlagged, setIsFlagged] = useState(false);

  async function handleSubmit() {
    if (!deckId || !reason) return;
    setError(null);
    try {
      await flagItem({ id: deckId, recordingId: recording.id, reason, note: note.trim() || undefined }).unwrap();
      setIsFlagged(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to flag this recording.'));
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent
        description={isFlagged ? undefined : recording.promptText}
        title={isFlagged ? 'Recording flagged' : 'Flag Recording'}
      >
        {!deckId ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted">Add this recording to a deck to flag it.</p>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-extrabold text-white hover:bg-accent/90"
              onClick={onAddToDeck}
              type="button"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add to Deck
            </button>
          </div>
        ) : isFlagged ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted">This recording has been flagged for review.</p>
            <DialogClose className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold text-ink hover:bg-surface-muted">
              Done
            </DialogClose>
          </div>
        ) : (
          <div className="grid gap-3">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {error}
              </p>
            )}
            <div className="grid gap-1.5">
              {FLAG_REASONS.map((option) => (
                <button
                  aria-pressed={reason === option.value}
                  className={`flex min-h-10 items-center rounded-lg border px-3 text-left text-sm font-bold ${
                    reason === option.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line hover:bg-surface-muted'
                  }`}
                  key={option.value}
                  onClick={() => setReason(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <textarea
              className="min-h-20 rounded-lg border border-line bg-surface p-3 text-sm"
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              value={note}
            />
            <div className="flex gap-2">
              <DialogClose className="min-h-10 flex-1 rounded-lg border border-line px-3 text-sm font-bold text-ink hover:bg-surface-muted">
                Cancel
              </DialogClose>
              <ActionButton
                className="min-h-10 flex-1 rounded-lg bg-accent px-3 text-sm font-extrabold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!reason}
                onClick={() => void handleSubmit()}
                pending={isSaving}
                pendingLabel="Flagging"
                type="button"
              >
                Flag Recording
              </ActionButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddToDeckSheet({
  recording,
  onClose,
  onScored,
  onAdded,
}: {
  recording: ValidatorRecordingSummary;
  onClose: () => void;
  onScored: () => void;
  onAdded: (deckId: string) => void;
}) {
  const { data: decks, isLoading } = useGetValidatorDecksQuery({ filter: 'mine' });
  const [createDeck, { isLoading: isCreating }] = useCreateValidatorDeckMutation();
  const [addItem] = useAddValidatorDeckItemMutation();
  const [scoreItem] = useScoreValidatorDeckItemMutation();
  const [newDeckName, setNewDeckName] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedDeckId, setAddedDeckId] = useState<string | null>(null);

  const draftDecks = useMemo(() => (decks ?? []).filter((d) => d.status === 'DRAFT'), [decks]);

  async function handleAdd(deck: ValidatorDeckSummary) {
    setError(null);
    try {
      await addItem({ id: deck.id, recordingId: recording.id }).unwrap();
      setAddedDeckId(deck.id);
      onAdded(deck.id);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to add this recording to the deck.'));
    }
  }

  async function handleCreateAndAdd() {
    setError(null);
    try {
      const deck = await createDeck({ name: newDeckName.trim() }).unwrap();
      await addItem({ id: deck.id, recordingId: recording.id }).unwrap();
      setAddedDeckId(deck.id);
      onAdded(deck.id);
      setIsCreatingNew(false);
      setNewDeckName('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create the deck.'));
    }
  }

  async function handleScore(deckId: string, status: ValidatorItemStatus) {
    setError(null);
    try {
      await scoreItem({ id: deckId, recordingId: recording.id, body: { status } }).unwrap();
      onScored();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this score.'));
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent
        description={recording.promptText}
        title={addedDeckId ? 'Added to Deck' : 'Add to Deck'}
      >
        <div className="grid gap-3">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}

          {addedDeckId ? (
            <div className="grid gap-3">
              <p className="text-sm text-muted">
                Mark this recording&apos;s validity now, or come back to it later from the deck.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-accent px-3 text-sm font-extrabold text-white hover:bg-accent/90"
                  onClick={() => handleScore(addedDeckId, 'VALID')}
                  type="button"
                >
                  Mark Valid
                </button>
                <button
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-line px-3 text-sm font-extrabold text-ink hover:bg-surface-muted"
                  onClick={() => handleScore(addedDeckId, 'INVALID')}
                  type="button"
                >
                  Mark Invalid
                </button>
              </div>
              <DialogClose className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold text-ink hover:bg-surface-muted">
                Done
              </DialogClose>
            </div>
          ) : (
            <>
              {isLoading ? (
                <div className="grid gap-2">
                  {[0, 1].map((i) => (
                    <div className="h-11 animate-pulse rounded-lg bg-surface-muted" key={i} />
                  ))}
                </div>
              ) : draftDecks.length > 0 ? (
                <div className="grid max-h-64 gap-2 overflow-y-auto">
                  {draftDecks.map((deck) => (
                    <button
                      className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line px-3 text-left text-sm font-bold hover:bg-surface-muted"
                      key={deck.id}
                      onClick={() => handleAdd(deck)}
                      type="button"
                    >
                      <span className="truncate">{deck.name}</span>
                      <span className="shrink-0 text-xs font-bold text-muted">
                        {deck._count.items} items
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">You don&apos;t have any draft decks yet.</p>
              )}

              {isCreatingNew ? (
                <div className="grid gap-2">
                  <input
                    autoFocus
                    className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm"
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="New deck name"
                    value={newDeckName}
                  />
                  <div className="flex gap-2">
                    <button
                      className="min-h-9 flex-1 rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted"
                      onClick={() => setIsCreatingNew(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <ActionButton
                      className="min-h-9 flex-1 rounded-lg bg-accent px-3 text-sm font-extrabold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!newDeckName.trim()}
                      onClick={() => void handleCreateAndAdd()}
                      pending={isCreating}
                      pendingLabel="Creating"
                      type="button"
                    >
                      Create &amp; Add
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <button
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-sm font-bold text-muted hover:bg-surface-muted hover:text-ink"
                  onClick={() => setIsCreatingNew(true)}
                  type="button"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New deck
                </button>
              )}

              <DialogClose className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold text-ink hover:bg-surface-muted">
                Cancel
              </DialogClose>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
