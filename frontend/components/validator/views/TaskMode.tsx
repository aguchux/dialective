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
  Search,
  SlidersHorizontal,
  X,
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
  // recordingId -> deckId, populated once Add to Deck succeeds for that
  // recording this session -- Transcribe/Flag are deck-item-scoped (same as
  // scoring), so the Expanded Player needs to know which deck to write to.
  // Session-local only: a recording added to a deck in an earlier session
  // re-prompts Add to Deck here until the pool-browse endpoint can report
  // deck membership directly.
  const [recordingDeckIds, setRecordingDeckIds] = useState<Record<string, string>>({});
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

        <div className={`min-h-0 flex-1 overflow-y-auto px-4 pb-4 ${activeRecording ? 'pb-24' : ''}`}>
          {isLoading ? (
            <CatalogueSkeleton />
          ) : data && data.items.length > 0 ? (
            <div className="grid gap-3">
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
                <div className="flex justify-center py-3">
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

      {activeRecording && isPlayerExpanded && (
        <ExpandedPlayer
          audioRef={audioRef}
          deckId={recordingDeckIds[activeRecording.id] ?? null}
          isPlaying={isPlaying}
          onAddToDeck={() => setDeckPickerRecording(activeRecording)}
          onClose={() => setIsPlayerExpanded(false)}
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

  // Presentational only while the Expanded Player is open -- the shared
  // <audio> element (owned by TaskMode) keeps playing underneath, but this
  // bar's own chrome is redundant with the Expanded Player's, so it renders
  // nothing rather than a second, competing set of controls.
  if (isExpanded) return null;

  return (
    <button
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center gap-3 border-t border-line bg-surface px-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]"
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
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-ink">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <button
          className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
          onClick={onClose}
          type="button"
          aria-label="Collapse player"
        >
          <ChevronDown className="size-5" aria-hidden="true" />
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
        <Scrubber audioRef={audioRef} recordingId={recording.id} />
      </div>

      <p className="max-w-sm text-xs text-muted">
        Waveform, loop region, and zoom are coming in a later pass -- this build covers browsing,
        playback, transcription, flagging, and scoring via Add to Deck.
      </p>
    </div>
  );
}

/**
 * Minimal seek bar + elapsed/total time, driven by the shared <audio>
 * element via a rAF-throttled currentTime poll (no dependency on native
 * <audio controls>, which this build deliberately avoids duplicating --
 * see TaskMode's single-<audio> doc comment).
 */
function Scrubber({
  audioRef,
  recordingId,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  recordingId: string;
}) {
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
    // changes to a new recording, so the scrubber resets to that
    // recording's own duration/time instead of showing the previous one's.
  }, [audioRef, recordingId]);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Number(e.target.value);
    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        aria-label="Seek"
        className="h-1.5 flex-1 accent-accent"
        max={duration || 0}
        min={0}
        onChange={handleSeek}
        step={0.1}
        type="range"
        value={Math.min(currentTime, duration || 0)}
      />
      <span className="shrink-0 font-mono text-xs text-muted">
        {formatSeconds(currentTime)} / {formatSeconds(duration)}
      </span>
    </div>
  );
}

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
