'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Pause, Play, Search, XCircle } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { RecordingDetailDialog } from '@/components/admin/RecordingAuditDialog';
import {
  AdminRecordingSummary,
  RecordingKind,
  RecordingSortField,
  useGetAdminAllRecordingsQuery,
  useGetAllDialectsQuery,
} from '@/store/api';
import { resolveDialectName } from '@/lib/dialect-name';

const tabs: { key: RecordingKind; label: string }[] = [
  { key: 'word', label: 'Word training' },
  { key: 'submission', label: 'Sentence submissions' },
];

const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

const SORT_OPTIONS: { value: RecordingSortField; label: string }[] = [
  { value: 'createdAt', label: 'Newest' },
  { value: 'score', label: 'Score' },
  { value: 'compositeScore', label: 'Composite score' },
  { value: 'rawScore', label: 'Raw score' },
  { value: 'payoutTokenAmount', label: 'Payout' },
];

const STATUS_OPTIONS = ['PENDING', 'TRANSCRIBED', 'REJECTED', 'SCORED', 'SETTLED', 'EXPIRED'] as const;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function PlayButton({ audioUrl }: { audioUrl: string | null }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!audioUrl) {
    return <span className="text-xs text-muted">No audio</span>;
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
  }

  return (
    <>
      <button
        aria-label={playing ? 'Pause recording' : 'Play recording'}
        className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent transition-colors hover:bg-accent/20"
        onClick={toggle}
        type="button"
      >
        {playing ? <Pause className="size-4 fill-current" aria-hidden="true" /> : <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />}
      </button>
      <audio onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} ref={audioRef} src={audioUrl} />
    </>
  );
}

function trainerLabel(trainer: AdminRecordingSummary['trainer']): string {
  if (!trainer) return '—';
  const name = [trainer.firstName, trainer.lastName].filter(Boolean).join(' ');
  return name || trainer.email;
}

function scoreCell(value: string | null): string {
  return value ? Number(value).toFixed(0) : '—';
}

export default function AdminRecordingsPage() {
  const [kind, setKind] = useState<RecordingKind>('word');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dialectTag, setDialectTag] = useState('');
  const [status, setStatus] = useState('');
  const [reviewState, setReviewState] = useState<'' | 'unreviewed' | 'VALID' | 'INVALID'>('');
  const [sortBy, setSortBy] = useState<RecordingSortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<AdminRecordingSummary | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = 20;

  useEffect(() => {
    setPage(1);
  }, [kind, debouncedSearch, dialectTag, status, reviewState, sortBy, sortDir]);

  const { data, isLoading, isFetching, isError, refetch } = useGetAdminAllRecordingsQuery({
    kind,
    page,
    pageSize,
    sortBy,
    sortDir,
    search: debouncedSearch || undefined,
    dialectTag: dialectTag || undefined,
    status: (status || undefined) as AdminRecordingSummary['status'] | undefined,
    ...(reviewState === 'unreviewed' ? { reviewState: 'unreviewed' as const } : {}),
    ...(reviewState === 'VALID' || reviewState === 'INVALID' ? { adminAuditStatus: reviewState } : {}),
  });
  const { data: dialects } = useGetAllDialectsQuery();

  function toggleSort(field: RecordingSortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Recordings</h1>
          <p className="leading-relaxed text-muted">
            Every trainer recording platform-wide, sortable by score and filterable by word, dialect, status, and
            review state. Play back audio and audit a recording inline.
          </p>
        </div>

        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setKind(tab.key)}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                kind === tab.key ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-surface-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="grid gap-4 overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink dark:bg-surface-muted"
                onChange={(e) => setSearch(e.target.value)}
                placeholder={kind === 'word' ? 'Search word or text...' : 'Search prompt or transcript...'}
                type="search"
                value={search}
                aria-label="Search recordings"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-bold" htmlFor="rec-dialect-filter">Dialect</label>
              <select
                className="min-h-9 rounded-lg border border-line bg-white px-3 text-sm"
                id="rec-dialect-filter"
                onChange={(e) => setDialectTag(e.target.value)}
                value={dialectTag}
              >
                <option value="">All dialects</option>
                {dialects?.map((d) => (
                  <option key={d.tag} value={d.tag}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-bold" htmlFor="rec-status-filter">Status</label>
              <select
                className="min-h-9 rounded-lg border border-line bg-white px-3 text-sm"
                id="rec-status-filter"
                onChange={(e) => setStatus(e.target.value)}
                value={status}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-bold" htmlFor="rec-review-filter">Audit</label>
              <select
                className="min-h-9 rounded-lg border border-line bg-white px-3 text-sm"
                id="rec-review-filter"
                onChange={(e) => setReviewState(e.target.value as typeof reviewState)}
                value={reviewState}
              >
                <option value="">All</option>
                <option value="unreviewed">Unreviewed</option>
                <option value="VALID">Marked valid</option>
                <option value="INVALID">Marked invalid</option>
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm font-bold" htmlFor="rec-sort-filter">Sort by</label>
              <select
                className="min-h-9 rounded-lg border border-line bg-white px-3 text-sm"
                id="rec-sort-filter"
                onChange={(e) => setSortBy(e.target.value as RecordingSortField)}
                value={sortBy}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                className={secondaryButtonClass}
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                type="button"
                aria-label={sortDir === 'desc' ? 'Sorted descending, click for ascending' : 'Sorted ascending, click for descending'}
              >
                {sortDir === 'desc' ? '↓' : '↑'}
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="p-5 text-muted">Loading...</p>
          ) : isError ? (
            <div className="grid gap-3 p-5 text-center">
              <p className="font-extrabold">Could not load recordings.</p>
              <button className={secondaryButtonClass} onClick={() => void refetch()} type="button">
                Try again
              </button>
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                  <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3.5" scope="col">Play</th>
                      <th className="px-5 py-3.5" scope="col">Trainer</th>
                      <th className="px-5 py-3.5" scope="col">{kind === 'word' ? 'Word' : 'Prompt'}</th>
                      <th className="px-5 py-3.5" scope="col">Dialect</th>
                      <th className="px-5 py-3.5" scope="col">Status</th>
                      <SortableHeader field="score" label="Score" active={sortBy} onClick={toggleSort} dir={sortDir} />
                      <th className="px-5 py-3.5" scope="col">Noise</th>
                      <th className="px-5 py-3.5" scope="col">Quality</th>
                      <th className="px-5 py-3.5" scope="col">Liveness</th>
                      <SortableHeader field="payoutTokenAmount" label="Payout" active={sortBy} onClick={toggleSort} dir={sortDir} />
                      <th className="px-5 py-3.5" scope="col">Audit</th>
                      <th className="px-5 py-3.5" scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.items.map((rec) => (
                      <tr key={rec.id}>
                        <td className="px-5 py-3.5">
                          <PlayButton audioUrl={rec.audioUrl} />
                        </td>
                        <td className="px-5 py-3.5 font-bold">{trainerLabel(rec.trainer)}</td>
                        <td className="max-w-xs truncate px-5 py-3.5" title={rec.promptText}>{rec.promptText}</td>
                        <td className="px-5 py-3.5 text-muted">{resolveDialectName(rec.dialectTag, dialects)}</td>
                        <td className="px-5 py-3.5 text-muted">{rec.status}</td>
                        <td className="px-5 py-3.5 font-black tabular-nums">{scoreCell(rec.score)}</td>
                        <td className="px-5 py-3.5 tabular-nums text-muted">{scoreCell(rec.noiseScore)}</td>
                        <td className="px-5 py-3.5 tabular-nums text-muted">{scoreCell(rec.qualityScore)}</td>
                        <td className="px-5 py-3.5 tabular-nums text-muted">{scoreCell(rec.livenessScore)}</td>
                        <td className="px-5 py-3.5 tabular-nums text-muted">{rec.payoutTokenAmount ? `${rec.payoutTokenAmount} DL` : '—'}</td>
                        <td className="px-5 py-3.5">
                          <AuditBadge status={rec.adminAuditStatus} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark"
                            onClick={() => setSelected(rec)}
                            type="button"
                          >
                            <ClipboardCheck className="size-4" aria-hidden="true" /> Audit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-line md:hidden">
                {data.items.map((rec) => (
                  <article className="grid gap-2 p-4" key={rec.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <PlayButton audioUrl={rec.audioUrl} />
                        <div className="min-w-0">
                          <p className="truncate font-extrabold">{trainerLabel(rec.trainer)}</p>
                          <p className="truncate text-sm text-muted">{rec.promptText}</p>
                        </div>
                      </div>
                      <AuditBadge status={rec.adminAuditStatus} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span>{resolveDialectName(rec.dialectTag, dialects)}</span>
                      <span>{rec.status}</span>
                      <span>Score: {scoreCell(rec.score)}</span>
                      <span>Noise: {scoreCell(rec.noiseScore)}</span>
                      <span>Quality: {scoreCell(rec.qualityScore)}</span>
                      <span>Liveness: {scoreCell(rec.livenessScore)}</span>
                      {rec.payoutTokenAmount && <span>{rec.payoutTokenAmount} DL</span>}
                    </div>
                    <button
                      className="inline-flex min-h-9 w-fit items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark"
                      onClick={() => setSelected(rec)}
                      type="button"
                    >
                      <ClipboardCheck className="size-4" aria-hidden="true" /> Audit
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="p-5 text-muted">No recordings match these filters.</p>
          )}

          {data && data.totalPages > 1 && (
            <PaginationFooter page={data.page} totalPages={data.totalPages} isFetching={isFetching} onChange={setPage} />
          )}
        </section>
      </div>

      <RecordingDetailDialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)} recording={selected} />
    </AdminShell>
  );
}

function SortableHeader({
  field,
  label,
  active,
  dir,
  onClick,
}: {
  field: RecordingSortField;
  label: string;
  active: RecordingSortField;
  dir: 'asc' | 'desc';
  onClick: (field: RecordingSortField) => void;
}) {
  const isActive = active === field;
  return (
    <th className="px-5 py-3.5" scope="col">
      <button className="inline-flex items-center gap-1 font-extrabold uppercase" onClick={() => onClick(field)} type="button">
        {label} {isActive && (dir === 'desc' ? '↓' : '↑')}
      </button>
    </th>
  );
}

function AuditBadge({ status }: { status: AdminRecordingSummary['adminAuditStatus'] }) {
  if (!status) return <span className="text-xs text-muted">Unreviewed</span>;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${
        status === 'VALID' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {status === 'VALID' ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <XCircle className="size-3.5" aria-hidden="true" />}
      {status === 'VALID' ? 'Valid' : 'Invalid'}
    </span>
  );
}

function PaginationFooter({
  page,
  totalPages,
  isFetching,
  onChange,
}: {
  page: number;
  totalPages: number;
  isFetching: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
      <p className="text-sm text-muted">
        Page {page} of {totalPages} {isFetching ? '· refreshing…' : ''}
      </p>
      <div className="flex gap-2">
        <button className={secondaryButtonClass} disabled={page <= 1} onClick={() => onChange(page - 1)} type="button">
          Previous
        </button>
        <button className={secondaryButtonClass} disabled={page >= totalPages} onClick={() => onChange(page + 1)} type="button">
          Next
        </button>
      </div>
    </div>
  );
}
