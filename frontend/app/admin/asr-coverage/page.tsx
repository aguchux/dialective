'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { AsrCoverageRow, useGetAsrCoverageQuery, useSetAsrBackfillMutation } from '@/store/api';

/**
 * Which dialects are actually being transcribed.
 *
 * This page exists because the failure it surfaces is silent: a dialect
 * with no entry in models/asr-registry.yaml is published with no
 * asr_stream, no worker ever sees it, and its recordings end up with no
 * transcript while nothing errors anywhere. 17 dialects and 82k recordings
 * sat that way for a month, found only because someone asked why one
 * language looked wrong.
 *
 * Coverage is measured from real transcripts rather than from the registry,
 * so a dialect whose checkpoint fails to load shows as mapped-but-0%
 * instead of looking fine.
 */
export default function AdminAsrCoveragePage() {
  const { data: rows = [], isLoading } = useGetAsrCoverageQuery(undefined, {
    // The backfill job ticks a dialect off when it finishes, so the page
    // has to notice that on its own -- otherwise a finished dialect keeps
    // showing as still running until someone reloads.
    pollingInterval: 30_000,
  });
  const [setBackfill] = useSetAsrBackfillMutation();
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleBackfill = async (row: AsrCoverageRow) => {
    setPendingTag(row.dialectTag);
    setError(null);
    try {
      await setBackfill({ dialectTag: row.dialectTag, enabled: !row.backfillEnabled }).unwrap();
    } catch (err) {
      const message =
        typeof err === 'object' && err && 'data' in err
          ? ((err as { data?: { message?: string } }).data?.message ?? null)
          : null;
      setError(message ?? `Could not change the backfill setting for ${row.dialectTag}.`);
    } finally {
      setPendingTag(null);
    }
  };

  const backfilling = rows.filter((row) => row.backfillEnabled);
  const unmapped = rows.filter((row) => !row.mapped);
  const unmappedRecordings = unmapped.reduce((sum, row) => sum + row.recordings, 0);
  const totalRecordings = rows.reduce((sum, row) => sum + row.recordings, 0);
  const totalTranscribed = rows.reduce((sum, row) => sum + row.transcribed, 0);
  const overall = totalRecordings > 0 ? (totalTranscribed / totalRecordings) * 100 : 0;

  const columns: DataTableColumn<AsrCoverageRow>[] = [
    {
      key: 'dialect',
      header: 'Dialect',
      sortValue: (row) => row.name ?? row.dialectTag,
      render: (row) => (
        <div>
          <p className="font-extrabold">{row.name ?? row.dialectTag}</p>
          <p className="font-mono text-xs text-muted">{row.dialectTag}</p>
        </div>
      ),
    },
    {
      key: 'recordings',
      header: 'Recordings',
      searchable: false,
      sortValue: (row) => row.recordings,
      render: (row) => (
        <span className="font-mono tabular-nums">{row.recordings.toLocaleString()}</span>
      ),
    },
    {
      key: 'coverage',
      header: 'Transcribed',
      searchable: false,
      sortValue: (row) => row.coveragePercent,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-black ${
              row.coveragePercent >= 80
                ? 'bg-emerald-100 text-emerald-800'
                : row.coveragePercent > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-800'
            }`}
          >
            {row.coveragePercent}%
          </span>
          <span className="font-mono text-xs tabular-nums text-muted">
            {row.transcribed.toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      key: 'engine',
      header: 'ASR model',
      sortValue: (row) => (row.mapped ? (row.checkpoint ?? '') : ''),
      render: (row) =>
        row.mapped ? (
          <div>
            <p className="text-xs font-bold uppercase text-muted">{row.engine}</p>
            <p className="break-all font-mono text-xs">{row.checkpoint ?? '—'}</p>
          </div>
        ) : (
          // Not an error state on its own -- some languages genuinely have
          // no public ASR model. It is a gap that should be seen, not one
          // that should be alarming.
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-800">
            no model mapped
          </span>
        ),
    },
    {
      key: 'backfill',
      header: 'Backfill',
      searchable: false,
      sortValue: (row) => row.backfillable,
      render: (row) => {
        // Nothing recoverable: either everything already has a transcript,
        // or the retention job has purged the audio of whatever doesn't.
        // Showing a dead checkbox here would imply an action that cannot
        // do anything.
        if (row.backfillable === 0) {
          return <span className="text-xs text-muted">&mdash;</span>;
        }
        return (
          <label
            className={`flex items-center gap-2 ${row.backfillBlocked ? '' : 'cursor-pointer'}`}
            title={row.backfillBlocked ?? undefined}
          >
            <input
              checked={row.backfillEnabled}
              className="size-4 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"
              disabled={pendingTag === row.dialectTag || !!row.backfillBlocked}
              onChange={() => void toggleBackfill(row)}
              type="checkbox"
            />
            <span className="text-xs">
              <span className="font-mono font-bold tabular-nums">
                {row.backfillable.toLocaleString()}
              </span>{' '}
              <span className="text-muted">recoverable</span>
              {row.backfillEnabled ? (
                <span className="ml-1 font-black text-emerald-700">&middot; running</span>
              ) : null}
            </span>
          </label>
        );
      },
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-5">
        <div>
          {/* "ASR Transcription", not "ASR Coverage" -- this group already
              has a Coverage page (geographic reach), and the two are
              different questions: which dialects are collected vs which of
              them get transcribed. */}
          <h1 className="text-2xl font-black">ASR transcription</h1>
          <p className="mt-1 text-sm text-muted">
            {unmapped.length > 0
              ? `${unmapped.length} dialect${unmapped.length === 1 ? '' : 's'} with ${unmappedRecordings.toLocaleString()} recording${unmappedRecordings === 1 ? '' : 's'} have no ASR model mapped. `
              : 'Every dialect with recordings has an ASR model mapped. '}
            A dialect with no model is skipped silently &mdash; its recordings are never sent to a
            worker and never get a transcript, without anything failing. Add one in{' '}
            <span className="font-mono text-xs">models/asr-registry.yaml</span>.
          </p>
          <p className="mt-2 text-sm text-muted">
            Mapping a dialect only transcribes recordings made <em>after</em> it was mapped, so
            anything recorded before that stays blank. <strong>Backfill</strong> re-sends that
            history &mdash; but it is currently unavailable on every dialect: running it OOMKilled
            the ASR workers and stopped live transcription. It needs more worker memory before it
            can be turned back on.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            {error}
          </div>
        ) : null}

        {backfilling.length > 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <span className="font-black">Backfilling now:</span>{' '}
            {backfilling.map((row) => `${row.name ?? row.dialectTag} (${row.backfillable.toLocaleString()} left)`).join(', ')}
            . Each dialect unticks itself once nothing is left to send.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-bold uppercase text-muted">Overall transcribed</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{overall.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-bold uppercase text-muted">Dialects mapped</p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {rows.length - unmapped.length}/{rows.length}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-bold uppercase text-muted">Recordings without a model</p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {unmappedRecordings.toLocaleString()}
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          emptyMessage="No recordings yet."
          isLoading={isLoading}
          pageSize={15}
          adjustablePageSize
          rowKey={(row) => row.dialectTag}
          rows={rows}
        />
      </div>
    </AdminShell>
  );
}
