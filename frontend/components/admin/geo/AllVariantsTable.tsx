'use client';

import { useState } from 'react';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminDialectVariantFlat,
  normalizeErrorMessage,
  useGetAllAdminDialectVariantsQuery,
  useUpdateDialectVariantMutation,
} from '@/store/api';

const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Every sub-dialect across every dialect/country, in one flat searchable
 * table -- lets an admin locate a specific sub-dialect (e.g. "Izzi") to
 * pause its tasks directly by name, without first opening its parent
 * dialect's "Variants" dialog. That drill-down dialog (DialectsTable.tsx)
 * still has the same toggle for editing a sub-dialect while already
 * looking at its parent; this is the alternate "search first" path.
 */
export function AllVariantsTable() {
  const { data: variants, isLoading } = useGetAllAdminDialectVariantsQuery();
  const [updateVariant] = useUpdateDialectVariantMutation();
  const [error, setError] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);

  async function handleToggleTasksPaused(variant: AdminDialectVariantFlat, tasksPaused: boolean) {
    setError(null);
    setPausingId(variant.id);
    try {
      await updateVariant({
        id: variant.id,
        dialectId: variant.dialect.id,
        body: { tasksPaused },
      }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update task availability.'));
    } finally {
      setPausingId(null);
    }
  }

  const columns: DataTableColumn<AdminDialectVariantFlat>[] = [
    {
      key: 'name',
      header: 'Sub-dialect',
      sortValue: (v) => v.name,
      render: (v) => (
        <p className="font-extrabold">
          {v.name} <span className="text-muted">({v.tag})</span>
        </p>
      ),
    },
    {
      key: 'dialect',
      header: 'Dialect',
      sortValue: (v) => v.dialect.name,
      render: (v) => (
        <p>
          {v.dialect.name} <span className="text-muted">({v.dialect.tag})</span>
        </p>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      sortValue: (v) => v.dialect.country.name,
      render: (v) => v.dialect.country.name,
    },
    {
      key: 'availability',
      header: 'Availability',
      sortValue: (v) => (v.active ? 1 : 0),
      render: (v) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            v.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {v.active ? 'Active' : 'Revoked'}
        </span>
      ),
    },
    {
      key: 'tasks',
      header: 'Tasks',
      sortValue: (v) => (v.tasksPaused ? 0 : 1),
      render: (v) => (
        <label
          className="flex items-center gap-2 text-sm font-bold"
          title="Pausing stops new word-training tasks for this sub-dialect without touching trainers already assigned to it -- unlike Revoke, this does not reset onboarding."
        >
          <input
            checked={!v.tasksPaused}
            className="size-4 accent-accent"
            disabled={pausingId === v.id}
            onChange={(e) => handleToggleTasksPaused(v, !e.target.checked)}
            type="checkbox"
          />
          <span
            className={
              v.tasksPaused
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }
          >
            {v.tasksPaused ? 'Paused' : 'Running'}
          </span>
        </label>
      ),
    },
    {
      key: 'users',
      header: 'Users',
      sortValue: (v) => v._count.users,
      render: (v) => v._count.users,
    },
    {
      key: 'actions',
      header: 'Actions',
      searchable: false,
      render: (v) => (
        <ActionButton
          className={secondaryButtonClass}
          onClick={() => handleToggleTasksPaused(v, !v.tasksPaused)}
          pending={pausingId === v.id}
          pendingLabel={v.tasksPaused ? 'Resuming' : 'Pausing'}
          type="button"
        >
          {v.tasksPaused ? 'Resume tasks' : 'Pause tasks'}
        </ActionButton>
      ),
    },
  ];

  return (
    <section className="grid gap-4">
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={variants ?? []}
        rowKey={(v) => v.id}
        isLoading={isLoading}
        emptyMessage="No sub-dialects yet."
        searchPlaceholder="Search sub-dialects, dialects, or countries..."
      />
    </section>
  );
}
