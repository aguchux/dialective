'use client';

import { FormEvent, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import {
  AdminIntegration,
  normalizeErrorMessage,
  useCreateAdminIntegrationMutation,
  useListAdminIntegrationsQuery,
  useUpdateAdminIntegrationMutation,
} from '@/store/api';

/**
 * Admin catalog management for the "P2P & Integrations" marketplace --
 * create new peer-fulfilled products and gate each one's enabled state and
 * fee/payout amount independently (per the product ask: admin gates EACH
 * integration's enablement and earning params). WhatsApp Validator ships
 * with this pass but is created here like any other row, not hardcoded.
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">Integrations</h1>
            <p className="text-sm text-muted">
              Manage the peer-fulfilled products members can subscribe to, and gate each one's
              enablement and fee independently.
            </p>
          </div>
          <CreateIntegrationDialog />
        </div>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}

        <DataTable
          columns={columns}
          emptyMessage="No integrations yet -- create one above."
          isLoading={isLoading}
          rowKey={(row) => row.id}
          rows={integrations}
          searchPlaceholder="Search integrations..."
        />
      </div>
    </AdminShell>
  );
}

function CreateIntegrationDialog() {
  const [open, setOpen] = useState(false);
  const [createIntegration, { isLoading: creating }] = useCreateAdminIntegrationMutation();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [feeTokenAmount, setFeeTokenAmount] = useState('0');
  const [error, setError] = useState('');

  function reset() {
    setSlug('');
    setName('');
    setDescription('');
    setCategory('');
    setFeeTokenAmount('0');
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await createIntegration({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        feeTokenAmount: Number(feeTokenAmount),
      }).unwrap();
      reset();
      setOpen(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create this integration.'));
    }
  }

  if (!open) {
    return (
      <button
        className="min-h-10 rounded-lg bg-accent px-4 font-extrabold text-white"
        onClick={() => setOpen(true)}
        type="button"
      >
        New integration
      </button>
    );
  }

  return (
    <form
      className="grid w-full gap-3 rounded-lg border border-line bg-surface p-4 md:w-[420px]"
      onSubmit={handleSubmit}
    >
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs font-bold text-danger">
          {error}
        </p>
      )}
      <label className="grid gap-1 text-sm font-bold">
        Slug (stable key, e.g. whatsapp-validator)
        <input
          className="min-h-9 rounded-lg border border-line bg-white px-2 text-sm font-normal"
          onChange={(e) => setSlug(e.target.value)}
          required
          value={slug}
        />
      </label>
      <label className="grid gap-1 text-sm font-bold">
        Name
        <input
          className="min-h-9 rounded-lg border border-line bg-white px-2 text-sm font-normal"
          onChange={(e) => setName(e.target.value)}
          required
          value={name}
        />
      </label>
      <label className="grid gap-1 text-sm font-bold">
        Description
        <textarea
          className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-normal"
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={2}
          value={description}
        />
      </label>
      <label className="grid gap-1 text-sm font-bold">
        Category
        <input
          className="min-h-9 rounded-lg border border-line bg-white px-2 text-sm font-normal"
          onChange={(e) => setCategory(e.target.value)}
          required
          value={category}
        />
      </label>
      <label className="grid gap-1 text-sm font-bold">
        Fee (DL) -- requester pays this, fulfilling peer receives it
        <input
          className="min-h-9 rounded-lg border border-line bg-white px-2 text-sm font-normal"
          min="0"
          onChange={(e) => setFeeTokenAmount(e.target.value)}
          step="0.01"
          type="number"
          value={feeTokenAmount}
        />
      </label>
      <div className="flex gap-2">
        <ActionButton
          className="min-h-9 flex-1 rounded-lg bg-accent px-3 font-extrabold text-white"
          pending={creating}
          pendingLabel="Creating"
          type="submit"
        >
          Create
        </ActionButton>
        <button
          className="min-h-9 rounded-lg border border-line px-3 font-extrabold"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
