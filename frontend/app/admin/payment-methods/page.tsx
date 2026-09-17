'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  PaymentMethodCatalogEntry,
  normalizeErrorMessage,
  useConfirmAdminPaymentMethodLogoUploadMutation,
  useCreateAdminPaymentMethodLogoUploadUrlMutation,
  useCreateAdminPaymentMethodMutation,
  useDeleteAdminPaymentMethodMutation,
  useGetCountriesQuery,
  useListAdminPaymentMethodsQuery,
  useUpdateAdminPaymentMethodMutation,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

export default function AdminPaymentMethodsPage() {
  const { data: methods, isLoading } = useListAdminPaymentMethodsQuery();
  const { data: countries = [] } = useGetCountriesQuery();
  const [deleteMethod] = useDeleteAdminPaymentMethodMutation();
  const [updateMethod] = useUpdateAdminPaymentMethodMutation();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentMethodCatalogEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!window.confirm('Remove this payment method from the catalog?')) return;
    setError(null);
    setDeletingId(id);
    try {
      await deleteMethod(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete payment method.'));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setError(null);
    setTogglingId(id);
    try {
      await updateMethod({ id, enabled }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update payment method.'));
    } finally {
      setTogglingId(null);
    }
  }

  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;

  const columns: DataTableColumn<PaymentMethodCatalogEntry>[] = [
    {
      key: 'logo',
      header: '',
      searchable: false,
      render: (m) =>
        m.logoUrl ? (
          <Image alt="" className="rounded object-contain" height={28} src={m.logoUrl} width={28} />
        ) : (
          <span className="grid size-7 place-items-center rounded bg-surface-muted text-xs font-black text-muted">
            {m.name.slice(0, 1)}
          </span>
        ),
    },
    {
      key: 'name',
      header: 'Name',
      sortValue: (m) => m.name,
      render: (m) => (
        <div>
          <p className="font-extrabold">{m.name}</p>
          {m.description && <p className="text-xs text-muted">{m.description}</p>}
        </div>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      sortValue: (m) => countryName(m.countryCode),
      render: (m) => countryName(m.countryCode),
    },
    { key: 'type', header: 'Type', sortValue: (m) => m.type, render: (m) => m.type },
    {
      key: 'enabled',
      header: 'Enabled',
      searchable: false,
      render: (m) => (
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            checked={m.enabled}
            className="size-4"
            disabled={togglingId === m.id}
            onChange={(e) => handleToggle(m.id, e.target.checked)}
            type="checkbox"
          />
        </label>
      ),
    },
    {
      key: 'actions',
      header: '',
      searchable: false,
      render: (m) => (
        <div className="flex gap-2">
          <button className={secondaryButtonClass} onClick={() => setEditing(m)} type="button">
            Edit
          </button>
          <button
            className={dangerButtonClass}
            disabled={deletingId === m.id}
            onClick={() => handleDelete(m.id)}
            type="button"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <h1 className="text-3xl font-black">Payment Methods</h1>
            <p className="leading-relaxed text-muted">
              The curated bank/mobile-money list users pick from when adding a payout account.
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <button className={primaryButtonClass} type="button">
                Add payment method
              </button>
            </DialogTrigger>
            <DialogContent title="Add payment method">
              <PaymentMethodForm countries={countries} onDone={() => {}} />
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            {error}
          </p>
        )}

        <DataTable
          adjustablePageSize
          columns={columns}
          emptyMessage="No payment methods yet."
          isLoading={isLoading}
          rowKey={(m) => m.id}
          rows={methods ?? []}
          searchPlaceholder="Search payment methods..."
        />
      </div>

      {editing && (
        <Dialog onOpenChange={(open) => !open && setEditing(null)} open>
          <DialogContent title="Edit payment method">
            <PaymentMethodForm
              countries={countries}
              existing={editing}
              onDone={() => setEditing(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </AdminShell>
  );
}

function PaymentMethodForm({
  countries,
  existing,
  onDone,
}: {
  countries: { code: string; name: string }[];
  existing?: PaymentMethodCatalogEntry;
  onDone: () => void;
}) {
  const [createMethod, { isLoading: creating }] = useCreateAdminPaymentMethodMutation();
  const [updateMethod, { isLoading: updating }] = useUpdateAdminPaymentMethodMutation();
  const [createLogoUploadUrl, { isLoading: uploadingLogo }] =
    useCreateAdminPaymentMethodLogoUploadUrlMutation();
  const [confirmLogoUpload] = useConfirmAdminPaymentMethodLogoUploadMutation();

  const [countryCode, setCountryCode] = useState(existing?.countryCode ?? '');
  const [type, setType] = useState<'BANK' | 'MOBILE_MONEY'>(
    existing?.type === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'BANK',
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [bankCode, setBankCode] = useState(existing?.bankCode ?? '');
  const [error, setError] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const isSaving = creating || updating || uploadingLogo;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!existing && !countryCode) {
      setError('Select a country');
      return;
    }
    if (!name.trim()) {
      setError('Enter a name');
      return;
    }
    setError('');
    try {
      let id = existing?.id;
      if (existing) {
        await updateMethod({
          id: existing.id,
          name: name.trim(),
          description: description.trim() || undefined,
          bankCode: bankCode.trim() || undefined,
        }).unwrap();
      } else {
        const created = await createMethod({
          countryCode,
          type,
          name: name.trim(),
          description: description.trim() || undefined,
          bankCode: bankCode.trim() || undefined,
        }).unwrap();
        id = created.id;
      }
      if (logoFile && id) {
        const { uploadUrl, key } = await createLogoUploadUrl({
          id,
          contentType: logoFile.type,
        }).unwrap();
        const putResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': logoFile.type },
          body: logoFile,
        });
        if (!putResponse.ok) throw new Error('Logo upload failed');
        await confirmLogoUpload({ id, key }).unwrap();
      }
      onDone();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not save payment method'));
    }
  }

  function handleLogoChange(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError('Logo must be JPG, PNG, WEBP, or SVG');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo is too large (max 2MB)');
      return;
    }
    setError('');
    setLogoFile(file);
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {!existing && (
        <label className="grid gap-1.5 text-sm font-bold">
          Country
          <SearchableSelect
            onChange={setCountryCode}
            options={countries.map((c) => ({ value: c.code, label: c.name }))}
            placeholder="Search country..."
            value={countryCode}
          />
        </label>
      )}

      {!existing && (
        <label className="grid gap-1.5 text-sm font-bold">
          Type
          <select
            className={inputClass}
            onChange={(e) => setType(e.target.value as 'BANK' | 'MOBILE_MONEY')}
            value={type}
          >
            <option value="BANK">Bank</option>
            <option value="MOBILE_MONEY">Mobile money</option>
          </select>
        </label>
      )}

      <label className="grid gap-1.5 text-sm font-bold">
        Name
        <input
          className={inputClass}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. GTBank"
          value={name}
        />
      </label>

      <label className="grid gap-1.5 text-sm font-bold">
        Description (optional)
        <input
          className={inputClass}
          onChange={(e) => setDescription(e.target.value)}
          value={description}
        />
      </label>

      <label className="grid gap-1.5 text-sm font-bold">
        Bank code (optional -- only meaningful for BANK)
        <input
          className={inputClass}
          onChange={(e) => setBankCode(e.target.value)}
          value={bankCode}
        />
      </label>

      <label className="grid gap-1.5 text-sm font-bold">
        Logo (optional)
        <input
          accept={ALLOWED_LOGO_TYPES.join(',')}
          className={inputClass}
          onChange={(e) => handleLogoChange(e.target.files?.[0])}
          type="file"
        />
      </label>

      {error && <p className="text-sm font-bold text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <button className={secondaryButtonClass} type="button">
            Cancel
          </button>
        </DialogClose>
        <ActionButton
          className={primaryButtonClass}
          pending={isSaving}
          pendingLabel="Saving"
          type="submit"
        >
          Save
        </ActionButton>
      </div>
    </form>
  );
}
