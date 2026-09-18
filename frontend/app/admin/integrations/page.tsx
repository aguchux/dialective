'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminIntegration,
  AdminIntegrationSubscription,
  normalizeErrorMessage,
  useGetAdminIntegrationSubscriptionsQuery,
  useListAdminIntegrationsQuery,
  useReviewIntegrationSubscriptionMutation,
  useUpdateAdminIntegrationMutation,
} from '@/store/api';

/**
 * Admin gate for the "P2P & Integrations" marketplace. Integrations are
 * NOT created here -- each one is a real implemented feature registered in
 * code (services/api/src/integrations/integration-registry.ts), synced
 * into this list automatically on API boot. Admin's only power over a row
 * is gating it: whether it's live, what the fee is, and where it sorts.
 */
export default function AdminIntegrationsPage() {
  const { data: integrations = [], isLoading } = useListAdminIntegrationsQuery();
  const [updateIntegration] = useUpdateAdminIntegrationMutation();
  const [error, setError] = useState('');

  async function handleToggleEnabled(id: string, enabled: boolean) {
    setError('');
    try {
      await updateIntegration({ id, enabled }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this integration.'));
    }
  }

  async function handleFeeChange(id: string, feeTokenAmount: number) {
    setError('');
    try {
      await updateIntegration({ id, feeTokenAmount }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this integration.'));
    }
  }

  async function handleMaxConcurrentClaimsChange(id: string, maxConcurrentClaims: number) {
    setError('');
    try {
      await updateIntegration({ id, maxConcurrentClaims }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this integration.'));
    }
  }

  async function handleCodeValidityChange(id: string, codeValidityMinutes: number) {
    setError('');
    try {
      await updateIntegration({ id, codeValidityMinutes }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this integration.'));
    }
  }

  const columns: DataTableColumn<AdminIntegration>[] = [
    {
      key: 'name',
      header: 'Integration',
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <p className="font-bold">{row.name}</p>
          <p className="text-xs text-muted">{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (row) => row.category,
      render: (row) => row.category,
    },
    {
      key: 'fee',
      header: 'Fee (DL)',
      searchable: false,
      render: (row) => (
        <input
          className="min-h-9 w-24 rounded-lg border border-line bg-surface px-2 text-sm"
          defaultValue={row.feeTokenAmount}
          key={row.id + row.feeTokenAmount}
          min="0"
          onBlur={(e) => {
            const next = Number(e.target.value);
            if (!Number.isNaN(next) && String(next) !== row.feeTokenAmount) {
              handleFeeChange(row.id, next);
            }
          }}
          step="0.01"
          type="number"
        />
      ),
    },
    {
      key: 'maxConcurrentClaims',
      header: 'Max claims/member',
      searchable: false,
      render: (row) => (
        <input
          className="min-h-9 w-20 rounded-lg border border-line bg-surface px-2 text-sm"
          defaultValue={row.maxConcurrentClaims}
          key={row.id + row.maxConcurrentClaims}
          min="1"
          onBlur={(e) => {
            const next = Number(e.target.value);
            if (Number.isInteger(next) && next >= 1 && next !== row.maxConcurrentClaims) {
              handleMaxConcurrentClaimsChange(row.id, next);
            }
          }}
          step="1"
          type="number"
        />
      ),
    },
    {
      key: 'codeValidityMinutes',
      header: 'Code validity (min)',
      searchable: false,
      render: (row) => (
        <input
          className="min-h-9 w-24 rounded-lg border border-line bg-surface px-2 text-sm"
          defaultValue={row.codeValidityMinutes}
          key={row.id + row.codeValidityMinutes}
          min="1"
          onBlur={(e) => {
            const next = Number(e.target.value);
            if (Number.isInteger(next) && next >= 1 && next !== row.codeValidityMinutes) {
              handleCodeValidityChange(row.id, next);
            }
          }}
          step="1"
          type="number"
        />
      ),
    },
    {
      key: 'enabled',
      header: 'Enabled',
      searchable: false,
      render: (row) => (
        <label className="inline-flex items-center gap-2">
          <input
            checked={row.enabled}
            className="size-5 accent-[#6F16B9]"
            onChange={(e) => handleToggleEnabled(row.id, e.target.checked)}
            type="checkbox"
          />
          <span className={row.enabled ? 'font-bold text-success' : 'font-bold text-muted'}>
            {row.enabled ? 'Live' : 'Hidden'}
          </span>
        </label>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-black">Integrations</h1>
          <p className="text-sm text-muted">
            Gate each peer-fulfilled product's enablement, fee, how many claims a single member may
            hold at once, and how long an issued code stays valid -- independently. New integrations
            are added by implementing them in code, not from this page -- they appear here
            automatically once shipped.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}

        <DataTable
          columns={columns}
          emptyMessage="No integrations have been implemented yet."
          isLoading={isLoading}
          rowKey={(row) => row.id}
          rows={integrations}
          searchPlaceholder="Search integrations..."
        />

        <AccessRequests />
      </div>
    </AdminShell>
  );
}

/**
 * The access-request queue.
 *
 * Subscribing to an integration is a request, not a grant -- fulfilling
 * one means handling other members' identity documents and being paid for
 * it, so access is an admin decision. Nobody can claim or fulfil anything
 * until their row here is approved.
 */
function AccessRequests() {
  const { data: requests = [], isLoading } = useGetAdminIntegrationSubscriptionsQuery();
  const [review, { isLoading: reviewing }] = useReviewIntegrationSubscriptionMutation();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function decide(row: AdminIntegrationSubscription, decision: 'approve' | 'reject') {
    if (
      decision === 'reject' &&
      !window.confirm(`Decline ${row.user.email}'s access to ${row.integration.name}?`)
    ) {
      return;
    }
    setError('');
    setReviewingId(row.id);
    try {
      const reviewNote =
        decision === 'reject'
          ? (window.prompt('Reason (shown to the member, optional):') ?? undefined)
          : undefined;
      await review({ id: row.id, decision, reviewNote }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not save that decision'));
    } finally {
      setReviewingId(null);
    }
  }

  const columns: DataTableColumn<AdminIntegrationSubscription>[] = [
    {
      key: 'user',
      header: 'Member',
      render: (row) => (
        <div>
          <p className="font-bold">
            {[row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email}
          </p>
          <p className="text-xs text-muted">{row.user.email}</p>
        </div>
      ),
    },
    { key: 'integration', header: 'Integration', render: (row) => row.integration.name },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-black ${
            row.status === 'APPROVED'
              ? 'bg-emerald-100 text-emerald-800'
              : row.status === 'REJECTED'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {row.status.toLowerCase()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.status === 'PENDING' ? (
          <div className="flex gap-2">
            <ActionButton
              className="min-h-9 rounded-lg bg-accent px-3 text-sm font-extrabold text-white disabled:opacity-50"
              onClick={() => void decide(row, 'approve')}
              pending={reviewing && reviewingId === row.id}
              pendingLabel="Saving"
              type="button"
            >
              Approve
            </ActionButton>
            <button
              className="min-h-9 rounded-lg border border-red-200 px-3 text-sm font-extrabold text-red-700 hover:bg-red-50"
              onClick={() => void decide(row, 'reject')}
              type="button"
            >
              Decline
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted">{row.reviewNote ?? '—'}</span>
        ),
    },
  ];

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-lg font-black">Access requests</h2>
        <p className="mt-1 text-sm text-muted">
          A member who subscribes cannot fulfil anything until you approve them here. Pending
          requests sort to the top.
        </p>
      </div>
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
          {error}
        </p>
      )}
      <DataTable
        columns={columns}
        emptyMessage="No access requests yet."
        isLoading={isLoading}
        rowKey={(row) => row.id}
        rows={requests}
        searchPlaceholder="Search requests..."
      />
    </div>
  );
}
