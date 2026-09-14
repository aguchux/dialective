'use client';

import { useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  MisplacedDialectRecording,
  normalizeErrorMessage,
  useGetAllDialectsQuery,
  useGetMisplacedDialectRecordingsQuery,
  useResolveMisplacedDialectRecordingMutation,
} from '@/store/api';

const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';

function PlayButton({ audioUrl }: { audioUrl: string | null }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!audioUrl) return <span className="text-xs text-muted">No audio</span>;

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play();
  }

  return (
    <>
      <button
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-9 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-accent-dark"
        onClick={toggle}
        type="button"
      >
        {playing ? (
          <Pause className="size-4 fill-current" aria-hidden="true" />
        ) : (
          <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
        )}
      </button>
      <audio
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        ref={audioRef}
        src={audioUrl}
      />
    </>
  );
}

/**
 * Admin queue for WordRecordings auto-flagged as possibly mis-tagged --
 * PlatformSettings.misplacedDialectFlagThreshold distinct trainers must tick
 * WRONG_DIALECT via the Dialect Validation task (WordValidationService.
 * submit) before a recording lands here. Admin either deletes it outright or
 * reassigns it to the correct dialect, clearing wrongDialectFlagCount/
 * misplacedDialectAt either way.
 */
export default function MisplacedDialectsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading, isFetching } = useGetMisplacedDialectRecordingsQuery({ page, pageSize });
  const { data: dialects } = useGetAllDialectsQuery();
  const [resolve, { isLoading: isResolving }] = useResolveMisplacedDialectRecordingMutation();

  const [reassigning, setReassigning] = useState<MisplacedDialectRecording | null>(null);
  const [targetDialectTag, setTargetDialectTag] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setError(null);
    try {
      await resolve({ id, action: 'DELETE' }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete this recording.'));
    }
  }

  async function handleReassign() {
    if (!reassigning || !targetDialectTag) return;
    setError(null);
    try {
      await resolve({ id: reassigning.id, action: 'REASSIGN', dialectTag: targetDialectTag }).unwrap();
      setReassigning(null);
      setTargetDialectTag('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to reassign this recording.'));
    }
  }

  const items = data?.items ?? [];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Misplaced Dialects</h1>
          <p className="leading-relaxed text-muted">
            Recordings flagged as the wrong dialect by multiple trainers during Dialect
            Validation. Listen, then delete it or reassign it to the correct dialect.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-[#fde8e8] px-4 py-3 text-sm font-bold text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {isLoading ? (
            <p className="p-5 text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-5 text-muted">Nothing in the misplaced-dialect queue right now.</p>
          ) : (
            <div className="divide-y divide-line">
              {items.map((rec) => (
                <div className="flex flex-wrap items-center gap-4 p-4 md:px-5" key={rec.id}>
                  <PlayButton audioUrl={rec.audioUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{rec.word?.text ?? '—'}</p>
                    <p className="text-sm text-muted">
                      Tagged as <span className="font-bold">{rec.dialectTag}</span> ·{' '}
                      {rec.wrongDialectFlagCount} trainers flagged wrong dialect
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={secondaryButtonClass}
                      onClick={() => {
                        setReassigning(rec);
                        setTargetDialectTag('');
                      }}
                      type="button"
                    >
                      Reassign dialect
                    </button>
                    <button
                      className={dangerButtonClass}
                      onClick={() => void handleDelete(rec.id)}
                      type="button"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
              <p className="text-sm text-muted">
                Page {data.page} of {data.totalPages} {isFetching ? '· refreshing…' : ''}
              </p>
              <div className="flex gap-2">
                <button
                  className={secondaryButtonClass}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!reassigning} onOpenChange={(open) => !open && setReassigning(null)}>
        {reassigning && (
          <DialogContent
            title="Reassign dialect"
            description={`Move this recording out of ${reassigning.dialectTag} into the correct dialect.`}
          >
            <div className="grid gap-4">
              <select
                className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-ink dark:bg-surface-muted"
                onChange={(event) => setTargetDialectTag(event.target.value)}
                value={targetDialectTag}
              >
                <option value="">Select a dialect…</option>
                {(dialects ?? [])
                  .filter((d) => d.tag !== reassigning.dialectTag)
                  .map((d) => (
                    <option key={d.tag} value={d.tag}>
                      {d.name}
                    </option>
                  ))}
              </select>
              <ActionButton
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-accent bg-accent px-4 font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!targetDialectTag}
                onClick={() => void handleReassign()}
                pending={isResolving}
                pendingLabel="Reassigning"
                type="button"
              >
                Reassign
              </ActionButton>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AdminShell>
  );
}
