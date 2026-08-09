'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { PublicUser, useGetUsersQuery, useUpdateUserRoleMutation, useUpdateUserStatusMutation } from '@/store/api';

const selectClass = 'min-h-9 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-bold text-ink dark:bg-surface-muted';
const inputClass = 'min-h-9 w-full max-w-xs rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

const roleOptions = ['TRAINER', 'ADMIN', 'PARTNER'] as const;
const statusOptions = ['ACTIVE', 'SUSPENDED', 'BLOCKED'] as const;

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-accent-dark',
  SUSPENDED: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOCKED: 'bg-[#fde8e8] text-[#a3242f]',
};

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: users, isLoading } = useGetUsersQuery({
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const [updateRole] = useUpdateUserRoleMutation();
  const [updateStatus] = useUpdateUserStatusMutation();

  const selfId = session?.user?.id;

  const columns: DataTableColumn<PublicUser>[] = [
    {
      key: 'email',
      header: 'Email',
      sortValue: (u) => u.email,
      render: (u) => (
        <>
          <p className="font-extrabold">{u.email}</p>
          {u.id === selfId && <p className="text-xs text-muted">This is you</p>}
        </>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortValue: (u) => u.role,
      render: (u) => (
        <select
          className={selectClass}
          value={u.role}
          disabled={u.id === selfId}
          onChange={(e) => updateRole({ id: u.id, role: e.target.value })}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (u) => u.status,
      render: (u) => <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[u.status]}`}>{u.status}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => (
        <select
          className={selectClass}
          value={u.status}
          disabled={u.id === selfId}
          onChange={(e) => updateStatus({ id: u.id, status: e.target.value })}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s === 'ACTIVE' ? 'Set active' : s === 'SUSPENDED' ? 'Suspend' : 'Block'}
            </option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Users</h1>
          <p className="leading-relaxed text-muted">Manage roles and account status across trainers, partners, and admins.</p>
        </div>

        <section className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="search">
              Search email
            </label>
            <input
              className={inputClass}
              id="search"
              type="text"
              placeholder="jane@example.com"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="role-filter">
              Role
            </label>
            <select className={selectClass} id="role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="status-filter">
              Status
            </label>
            <select className={selectClass} id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </section>

        <DataTable
          columns={columns}
          rows={users ?? []}
          rowKey={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="No users match these filters."
        />
      </div>
    </AdminShell>
  );
}
