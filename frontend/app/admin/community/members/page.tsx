'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  AdminCommunityMember,
  CommunityMemberRole,
  CommunityMemberStatus,
  normalizeErrorMessage,
  useBanCommunityMemberMutation,
  useGetAdminCommunityMemberQuery,
  useGetAdminCommunityMembersQuery,
  useRestoreCommunityMemberMutation,
  useSuspendCommunityMemberMutation,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink dark:bg-surface-muted';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function StatusBadge({ status }: { status: CommunityMemberStatus }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950'
      : status === 'SUSPENDED'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950'
        : 'bg-red-50 text-danger dark:bg-red-950';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

export default function AdminCommunityMembersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CommunityMemberStatus | ''>('');
  const [role, setRole] = useState<CommunityMemberRole | ''>('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useGetAdminCommunityMembersQuery({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    status: status || undefined,
    role: role || undefined,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, role]);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Community Members</h1>
          <p className="leading-relaxed text-muted">
            Search and manage every trainer with a Community profile.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              className={`${inputClass} pl-9`}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              type="search"
              value={search}
            />
          </div>
          <select
            className={`${inputClass} w-auto`}
            onChange={(e) => setStatus(e.target.value as CommunityMemberStatus | '')}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="BANNED">Banned</option>
          </select>
          <select
            className={`${inputClass} w-auto`}
            onChange={(e) => setRole(e.target.value as CommunityMemberRole | '')}
            value={role}
          >
            <option value="">All roles</option>
            <option value="MEMBER">Member</option>
            <option value="MODERATOR">Moderator</option>
            <option value="STAFF">Staff</option>
          </select>
        </div>

        <section className="grid gap-4 overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          {isLoading ? (
            <p className="p-5 text-muted">Loading...</p>
          ) : isError ? (
            <div className="grid gap-3 p-5 text-center">
              <p className="font-extrabold">Could not load members.</p>
              <button className={secondaryButtonClass} onClick={() => void refetch()} type="button">
                Try again
              </button>
            </div>
          ) : data && data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 border-collapse text-left text-sm">
                <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3.5" scope="col">
                      Member
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Role
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Status
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Posts
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Replies
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((member) => (
                    <tr
                      className="cursor-pointer hover:bg-surface-muted"
                      key={member.id}
                      onClick={() => setSelectedId(member.id)}
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-extrabold">{member.displayName}</p>
                        <p className="text-xs text-muted">{member.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-muted">{member.role}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="px-5 py-3.5 text-muted">{member.postCount}</td>
                      <td className="px-5 py-3.5 text-muted">{member.replyCount}</td>
                      <td className="px-5 py-3.5 text-muted">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-muted">
              {debouncedSearch ? `No members match "${debouncedSearch}".` : 'No members yet.'}
            </p>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
              <p className="text-sm text-muted">
                Page {data.page} of {data.totalPages} {isFetching ? '· refreshing…' : ''}
              </p>
              <div className="flex gap-2">
                <button
                  className={secondaryButtonClass}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedId && <MemberDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />}
    </AdminShell>
  );
}

function MemberDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: member, isLoading, isError } = useGetAdminCommunityMemberQuery(id);
  const [suspend, { isLoading: isSuspending }] = useSuspendCommunityMemberMutation();
  const [ban, { isLoading: isBanning }] = useBanCommunityMemberMutation();
  const [restore, { isLoading: isRestoring }] = useRestoreCommunityMemberMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: 'suspend' | 'ban' | 'restore') {
    setError(null);
    try {
      if (action === 'suspend') await suspend({ id }).unwrap();
      else if (action === 'ban') await ban({ id }).unwrap();
      else await restore(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this member.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={member?.displayName ?? 'Member'}>
        {isLoading ? (
          <p className="text-muted">Loading...</p>
        ) : isError || !member ? (
          <p className="text-danger">Could not load this member.</p>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={member.status} />
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-bold text-muted">
                {member.role}
              </span>
              {member.badge && (
                <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
                  {member.badge === 'VERIFIED_TRAINER' ? 'Verified Trainer' : 'Distributor'}
                </span>
              )}
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Account email</dt>
                <dd className="font-bold">{member.email}</dd>
              </div>
              {member.accountName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Account name</dt>
                  <dd className="font-bold">{member.accountName}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Posts / Replies / Bookmarks</dt>
                <dd className="font-bold">
                  {member.postCount} / {member.replyCount} / {member.bookmarkCount}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Joined</dt>
                <dd className="font-bold">{new Date(member.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>

            {member.spaces.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-bold">Spaces joined</p>
                <div className="flex flex-wrap gap-1.5">
                  {member.spaces.map((space) => (
                    <span
                      className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-bold text-muted"
                      key={space.id}
                    >
                      {space.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {member.moderationHistory.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-bold">Moderation history</p>
                <ul className="grid gap-1.5 text-sm">
                  {member.moderationHistory.map((entry) => (
                    <li className="rounded-lg bg-surface-muted p-2.5" key={entry.id}>
                      <span className="font-bold">{entry.action}</span>{' '}
                      <span className="text-muted">
                        by {entry.moderator.firstName ?? entry.moderator.email} ·{' '}
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </span>
                      {entry.reason && <p className="mt-1 text-muted">{entry.reason}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose className={secondaryButtonClass}>Close</DialogClose>
              {member.status !== 'ACTIVE' && (
                <ActionButton
                  className={secondaryButtonClass}
                  onClick={() => handleAction('restore')}
                  pending={isRestoring}
                  pendingLabel="Restoring"
                  type="button"
                >
                  Restore
                </ActionButton>
              )}
              {member.status !== 'SUSPENDED' && (
                <ActionButton
                  className={dangerButtonClass}
                  onClick={() => handleAction('suspend')}
                  pending={isSuspending}
                  pendingLabel="Suspending"
                  type="button"
                >
                  Suspend
                </ActionButton>
              )}
              {member.status !== 'BANNED' && (
                <ActionButton
                  className={dangerButtonClass}
                  onClick={() => handleAction('ban')}
                  pending={isBanning}
                  pendingLabel="Banning"
                  type="button"
                >
                  Ban
                </ActionButton>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
