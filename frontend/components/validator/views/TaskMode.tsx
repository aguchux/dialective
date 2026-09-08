'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ListMusic, Loader2, Pause, Play, Plus, Search, X } from 'lucide-react';
import { cardClass, EmptyPanel, formatDateTime } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { normalizeErrorMessage } from '@/store/api';
import {
  useAddValidatorDeckItemMutation,
  useCreateValidatorDeckMutation,
  useGetValidatorDecksQuery,
  useGetValidatorRecordingsQuery,
  useScoreValidatorDeckItemMutation,
  type ValidatorDeckSummary,
  type ValidatorItemStatus,
  type ValidatorRecordingSummary,
} from '@/store/api';

/**
 * Task Mode -- the full-screen validation workspace entered from Start Task
 * (see ValidationsView). Renders as a fixed, viewport-covering overlay so
 * the outer ValidatorHeader/ValidatorMobileNavigation are visually hidden
 * for the duration of a session, per the mobile UI spec's "hide platform
 * nav once a task is active" decision -- this is a thin first slice: browse
 * the recording pool, play audio in a mini-player, add a recording to a
 * deck, and score it there (scoring is deck-scoped by design -- see
 * ValidatorDecksService.scoreItem -- so "score a recording" always routes
 * through "add it to one of your decks" first). Filters, waveform/loop,
 * transcribe, and flag are deliberately deferred to a later pass -- see the
 * Validation Workspace mobile spec's "thin vertical slice" scoping.
 */
export function TaskMode({ onEndTask }: { onEndTask: () => void }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [activeRecording, setActiveRecording] = useState<ValidatorRecordingSummary | null>(null);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [deckPickerRecording, setDeckPickerRecording] = useState<ValidatorRecordingSummary | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setAudioEl = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching } = useGetValidatorRecordingsQuery({
    page,
    pageSize,
    search: debouncedSearch || undefined,
  });

  function selectRecording(recording: ValidatorRecordingSummary) {
    setActiveRecording(recording);
    setIsPlaying(true);
    // Autoplay is driven by the <audio> element's own play() call inside
    // the mini-player effect below, keyed off activeRecording.id changing.
  }

  function endTaskWithConfirm() {
    // No unsaved-transcript risk in this slice (transcribe isn't built
    // yet) -- End Task is a plain, immediate action for now. Revisit once
    // the Transcribe segment lands, per the mobile spec's "warn before
    // discarding unsaved changes" requirement.
    onEndTask();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-ink" role="dialog" aria-label="Validation task">
      <TaskModeTopBar onEndTask={endTaskWithConfirm} reviewedCount={reviewedCount} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SearchToolbar onSearchChange={setSearch} search={search} totalCount={data?.total} />

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
          setAudioEl={setAudioEl}
        />
      )}

      {activeRecording && isPlayerExpanded && (
        <ExpandedPlayer
          isPlaying={isPlaying}
          setAudioEl={setAudioEl}
          onAddToDeck={() => setDeckPickerRecording(activeRecording)}
          onClose={() => setIsPlayerExpanded(false)}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          recording={activeRecording}
        />
      )}

      {deckPickerRecording && (
        <AddToDeckSheet
          onClose={() => setDeckPickerRecording(null)}
          onScored={() => setReviewedCount((c) => c + 1)}
          recording={deckPickerRecording}
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
}: {
  search: string;
  onSearchChange: (value: string) => void;
  totalCount?: number;
}) {
  return (
    <div className="shrink-0 border-b border-line bg-bg px-4 py-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          className="min-h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm"
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search dialect, prompt, or recording ID…"
          value={search}
        />
      </div>
      {typeof totalCount === 'number' && (
        <p className="mt-2 text-xs font-bold text-muted">{totalCount} recordings</p>
      )}
    </div>
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
  setAudioEl,
  isExpanded,
}: {
  recording: ValidatorRecordingSummary;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onExpand: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  setAudioEl: (el: HTMLAudioElement | null) => void;
  isExpanded: boolean;
}) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [audioRef, isPlaying, recording.id]);

  if (isExpanded) {
    return <audio ref={setAudioEl} src={recording.audioUrl ?? undefined} />;
  }

  return (
    <button
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center gap-3 border-t border-line bg-surface px-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]"
      onClick={onExpand}
      type="button"
    >
      <audio
        ref={setAudioEl}
        src={recording.audioUrl ?? undefined}
      />
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
  setAudioEl,
}: {
  recording: ValidatorRecordingSummary;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
  onAddToDeck: () => void;
  setAudioEl: (el: HTMLAudioElement | null) => void;
}) {
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
        <span className="text-xs font-bold text-muted">Playback</span>
        <button
          className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
          onClick={onAddToDeck}
          type="button"
          aria-label="Add to Deck"
        >
          <ListMusic className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{recording.dialectTag}</p>
          <p className="mt-2 text-xl font-black leading-snug">{recording.promptText}</p>
          <p className="mt-1 select-all font-mono text-xs text-muted">{recording.id}</p>
        </div>

        <audio
          className="w-full max-w-md"
          controls
          onPause={() => isPlaying && onTogglePlay()}
          onPlay={() => !isPlaying && onTogglePlay()}
          ref={setAudioEl}
          src={recording.audioUrl ?? undefined}
        />

        <p className="max-w-sm text-xs text-muted">
          Waveform, loop region, and transcription are coming in a later pass -- this build covers
          browsing, playback, and scoring via Add to Deck.
        </p>
      </div>
    </div>
  );
}

function AddToDeckSheet({
  recording,
  onClose,
  onScored,
}: {
  recording: ValidatorRecordingSummary;
  onClose: () => void;
  onScored: () => void;
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
