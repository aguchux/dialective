'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  AdminDataAccessLead,
  normalizeErrorMessage,
  useGetAdminDataAccessLeadsQuery,
  useUpdateAdminDataAccessLeadContactMutation,
  useInviteDataAccessLeadMutation,
  useGetSubscriptionPlansQuery,
} from '@/store/api';

function formatInterests(lead: AdminDataAccessLead): string {
  if (lead.interests.length === 0) return '-';
  return lead.interests
    .map((interest) => {
      const dialects = interest.dialectTags.length > 0 ? ` (${interest.dialectTags.join(', ')})` : '';
      return `${interest.country.name}${dialects}`;
    })
    .join('; ');
}

export default function AdminDataAccessLeadsPage() {
  const [page, setPage] = useState(1);
  const [contactLead, setContactLead] = useState<AdminDataAccessLead | null>(null);
  const [inviteLead, setInviteLead] = useState<AdminDataAccessLead | null>(null);
  const pageSize = 25;
  const { data, isLoading } = useGetAdminDataAccessLeadsQuery({ page, pageSize });
  const [updateContact] = useUpdateAdminDataAccessLeadContactMutation();
  const [inviteLeadMutation] = useInviteDataAccessLeadMutation();

  const columns: DataTableColumn<AdminDataAccessLead>[] = [
    {
      key: 'contact',
      header: 'Contact',
      sortValue: (row) => `${row.firstName} ${row.lastName} ${row.email}`,
      render: (row) => (
        <div className="grid gap-1">
          <p className="font-extrabold">
            {row.firstName} {row.lastName}
          </p>
          <a className="text-sm font-bold text-accent hover:underline" href={`mailto:${row.email}`}>
            {row.email}
          </a>
        </div>
      ),
    },
    {
      key: 'organization',
      header: 'Company / Organization',
      sortValue: (row) => row.organization ?? '',
      render: (row) => <span>{row.organization ?? '-'}</span>,
    },
    {
      key: 'website',
      header: 'Website',
      sortValue: (row) => row.website ?? '',
      render: (row) =>
        row.website ? (
          <a
            className="font-bold text-accent hover:underline"
            href={row.website}
            target="_blank"
            rel="noreferrer"
          >
            {row.website}
          </a>
        ) : (
          <span>-</span>
        ),
    },
    {
      key: 'interests',
      header: 'Countries / Dialects Interested In',
      sortValue: (row) => formatInterests(row),
      render: (row) => <span className="leading-relaxed">{formatInterests(row)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      sortValue: (row) => row.createdAt,
      render: (row) => <span>{new Date(row.createdAt).toLocaleString()}</span>,
      searchable: false,
    },
    {
      key: 'contactStatus',
      header: 'Contact status',
      sortValue: (row) => row.contactedAt ?? '',
      render: (row) => (
        <div className="grid gap-1">
          <span
            className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold ${row.contactedAt ? 'bg-accent-soft text-accent-dark' : 'bg-[#fff3e0] text-[#8a4b0f]'}`}
          >
            {row.contactedAt ? 'Contacted' : 'Pending'}
          </span>
          {row.contactedAt && (
            <span className="text-xs text-muted">{new Date(row.contactedAt).toLocaleString()}</span>
          )}
        </div>
      ),
      searchable: false,
    },
    {
      key: 'invite',
      header: 'Organization',
      sortValue: (row) => row.invitedOrganization?.name ?? '',
      render: (row) =>
        row.invitedOrganization ? (
          <span className="inline-flex w-fit rounded-full bg-accent-soft px-2 py-1 text-xs font-bold text-accent-dark">
            Invited: {row.invitedOrganization.name}
          </span>
        ) : (
          <span className="text-xs text-muted">Not invited</span>
        ),
      searchable: false,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted"
            onClick={() => setContactLead(row)}
            type="button"
          >
            {row.contactedAt ? 'Update contact note' : 'Mark contacted'}
          </button>
          {!row.invitedOrganization && (
            <button
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-accent-dark"
              onClick={() => setInviteLead(row)}
              type="button"
            >
              Approve &amp; invite
            </button>
          )}
        </div>
      ),
      searchable: false,
    },
  ];

  const pageRows = useMemo(() => data?.items ?? [], [data?.items]);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Stream Requests</h1>
          <p className="leading-relaxed text-muted">
            Voice-data subscription requests submitted from the public form. Use contact details
            below for follow-up, or approve a request to provision an organization and send an
            invite.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No data-access requests yet."
          searchPlaceholder="Search name, email, organization, website, or countries"
          pageSize={25}
        />

        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm text-muted">
            Page {data?.page ?? page} of {data?.totalPages ?? 1} · {data?.total ?? 0} total
          </p>
          <div className="flex gap-2">
            <button
              className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || (data ? page >= data.totalPages : true)}
              onClick={() => setPage((p) => p + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>

        {contactLead && (
          <UpdateLeadContactDialog
            lead={contactLead}
            onClose={() => setContactLead(null)}
            onSubmit={async (payload) => {
              await updateContact({ id: contactLead.id, body: payload }).unwrap();
              setContactLead(null);
            }}
          />
        )}

        {inviteLead && (
          <InviteLeadDialog
            lead={inviteLead}
            onClose={() => setInviteLead(null)}
            onSubmit={async (payload) => {
              await inviteLeadMutation({ id: inviteLead.id, body: payload }).unwrap();
              setInviteLead(null);
            }}
          />
        )}
      </div>
    </AdminShell>
  );
}

function UpdateLeadContactDialog({
  lead,
  onClose,
  onSubmit,
}: {
  lead: AdminDataAccessLead;
  onClose: () => void;
  onSubmit: (payload: { contacted: boolean; note?: string }) => Promise<void>;
}) {
  const [contacted, setContacted] = useState(Boolean(lead.contactedAt));
  const [note, setNote] = useState(lead.contactNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onSubmit({
        contacted,
        note: note.trim() || undefined,
      });
    } catch (mutationError) {
      setError(normalizeErrorMessage(mutationError, 'Unable to update contact status.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Lead follow-up"
        description={`Update contact status for ${lead.firstName} ${lead.lastName} (${lead.email}).`}
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm font-bold">
            <input
              checked={contacted}
              className="mt-1"
              onChange={(e) => setContacted(e.target.checked)}
              type="checkbox"
            />
            Mark this lead as contacted
          </label>

          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="contact-note">
              Follow-up note (optional)
            </label>
            <textarea
              className="min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
              id="contact-note"
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Intro email sent on 12 Aug, waiting for requirements"
              value={note}
            />
          </div>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteLeadDialog({
  lead,
  onClose,
  onSubmit,
}: {
  lead: AdminDataAccessLead;
  onClose: () => void;
  onSubmit: (payload: { organizationName: string; planId: string }) => Promise<void>;
}) {
  const { data: plans, isLoading: plansLoading } = useGetSubscriptionPlansQuery();
  const [organizationName, setOrganizationName] = useState(lead.organization ?? '');
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!planId) {
      setError('Choose a subscription plan.');
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({ organizationName, planId });
    } catch (mutationError) {
      setError(normalizeErrorMessage(mutationError, 'Unable to send the invite.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Approve & invite"
        description={`Provision a Voice Stream organization for ${lead.firstName} ${lead.lastName} (${lead.email}) and email them an owner invite.`}
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="org-name">
              Organization name
            </label>
            <input
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink"
              id="org-name"
              maxLength={200}
              onChange={(e) => setOrganizationName(e.target.value)}
              required
              value={organizationName}
            />
          </div>

          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="plan-select">
              Subscription plan
            </label>
            <select
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink"
              id="plan-select"
              onChange={(e) => setPlanId(e.target.value)}
              required
              value={planId}
            >
              <option disabled value="">
                {plansLoading ? 'Loading plans…' : 'Select a plan'}
              </option>
              {(plans ?? []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} (${plan.monthlyUsdAmount}/mo)
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              pending={isSaving}
              pendingLabel="Sending invite"
              type="submit"
            >
              Send invite
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
