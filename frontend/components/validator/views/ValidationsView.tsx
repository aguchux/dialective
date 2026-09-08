'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { cardClass, EmptyPanel, formatDateTime } from '@/components/dashboard/shared';
import { useGetValidatorRecordingsQuery } from '@/store/api';

const STATUS_OPTIONS = ['', 'PENDING', 'TRANSCRIBED', 'REJECTED', 'SCORED', 'SETTLED', 'EXPIRED'];

export function ValidationsView() {
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [dialectTag, setDialectTag] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading, isFetching } = useGetValidatorRecordingsQuery({
    page,
    pageSize,
    dialectTag: dialectTag.trim() || undefined,
    status: (status || undefined) as never,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-h-10 w-40 rounded-lg border border-line bg-surface px-3 text-sm"
          onChange={(e) => {
            setDialectTag(e.target.value);
            setPage(1);
          }}
          placeholder="Dialect tag"
          value={dialectTag}
        />
        <select
          className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm"
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          value={status}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option || 'any'} value={option}>
              {option || 'Any status'}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div className="h-20 animate-pulse rounded-lg bg-surface-muted" key={i} />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className={`${isFetching ? 'opacity-70' : ''} grid gap-2`}>
          {data.items.map((recording) => (
            <div className={`${cardClass} grid gap-2 p-4`} key={recording.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{recording.promptText}</p>
                  {recording.responseText && (
                    <p className="truncate text-sm text-muted">{recording.responseText}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-bold text-muted">
                  {recording.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span>Dialect: {recording.dialectTag}</span>
                {recording.score && <span>Score: {recording.score}</span>}
                <span>{formatDateTime(recording.createdAt)}</span>
              </div>
              {recording.audioUrl && (
                <audio className="w-full" controls preload="none" src={recording.audioUrl} />
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="select-all font-mono text-xs text-muted">{recording.id}</p>
                <p className="text-xs font-bold text-muted">
                  Open a deck to add and score this recording
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel icon={ClipboardCheck} title="No recordings match these filters" />
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm font-bold">
          <button
            className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
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
            className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
