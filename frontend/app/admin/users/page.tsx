'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useGetUsersQuery, useUpdateUserRoleMutation, useUpdateUserStatusMutation } from '@/store/api';

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

        <section className="overflow-x-auto rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          {isLoading && <p className="p-4 text-muted">Loading...</p>}
          {users && users.length === 0 && <p className="p-4 text-muted">No users match these filters.</p>}
          {users && users.length > 0 && (
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase text-muted">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === selfId;
                  return (
                    <tr className="border-b border-line last:border-0" key={user.id}>
                      <td className="px-4 py-3">
                        <p className="font-extrabold">{user.email}</p>
                        {isSelf && <p className="text-xs text-muted">This is you</p>}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className={selectClass}
                          value={user.role}
                          disabled={isSelf}
                          onChange={(e) => updateRole({ id: user.id, role: e.target.value })}
                        >
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[user.status]}`}>{user.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className={selectClass}
                          value={user.status}
                          disabled={isSelf}
                          onChange={(e) => updateStatus({ id: user.id, status: e.target.value })}
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>
                              {s === 'ACTIVE' ? 'Set active' : s === 'SUSPENDED' ? 'Suspend' : 'Block'}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
