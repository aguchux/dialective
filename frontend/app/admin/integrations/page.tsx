'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import {
  AdminIntegration,
  normalizeErrorMessage,
  useListAdminIntegrationsQuery,
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
    { key: 'category', header: 'Category', sortValue: (row) => row.category, render: (row) => row.category },
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
            Gate each peer-fulfilled product's enablement, fee, and how many claims a single
            member may hold at once, independently. New integrations are added by implementing
            them in code, not from this page -- they appear here automatically once shipped.
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
      </div>
    </AdminShell>
  );
}
