'use client';

import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { AsrCoverageRow, useGetAsrCoverageQuery } from '@/store/api';

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
  const { data: rows = [], isLoading } = useGetAsrCoverageQuery();

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
  ];

  return (
    <AdminShell>
      <div className="grid gap-5">
        <div>
          <h1 className="text-2xl font-black">ASR coverage</h1>
          <p className="mt-1 text-sm text-muted">
            {unmapped.length > 0
              ? `${unmapped.length} dialect${unmapped.length === 1 ? '' : 's'} with ${unmappedRecordings.toLocaleString()} recording${unmappedRecordings === 1 ? '' : 's'} have no ASR model mapped. `
              : 'Every dialect with recordings has an ASR model mapped. '}
            A dialect with no model is skipped silently &mdash; its recordings are never sent to a
            worker and never get a transcript, without anything failing. Add one in{' '}
            <span className="font-mono text-xs">models/asr-registry.yaml</span>.
          </p>
        </div>

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
