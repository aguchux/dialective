'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Clock3, Mail, Search, Shield, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import {
  useInviteMemberMutation,
  useListMembersQuery,
  useListOrgActivityQuery,
  useListPendingInvitesQuery,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
  type OrgActivityEvent,
  type SubscriberMember,
} from '@/store/api';
import type { SubscriberOrgRole } from '@/lib/api-client';
import { Skeleton } from './primitives';

const ROLES: SubscriberOrgRole[] = [
  'OWNER',
  'ADMIN',
  'DATASET_MANAGER',
  'VALIDATOR',
  'API_DEVELOPER',
  'BILLING_MANAGER',
  'AUDITOR',
];

const CAN_MANAGE: SubscriberOrgRole[] = ['OWNER', 'ADMIN'];

const ROLE_LABEL: Record<SubscriberOrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Org Admin',
  DATASET_MANAGER: 'Dataset Manager',
  VALIDATOR: 'Validator',
  API_DEVELOPER: 'API Developer',
  BILLING_MANAGER: 'Billing Manager',
  AUDITOR: 'Auditor',
};

const ROLE_BADGE_CLASS: Record<SubscriberOrgRole, string> = {
  OWNER: 'bg-catalogue-blue/20 text-catalogue-blue-bright ring-catalogue-blue/40',
  ADMIN: 'bg-catalogue-blue/20 text-catalogue-blue-bright ring-catalogue-blue/40',
  DATASET_MANAGER: 'bg-catalogue-green/15 text-catalogue-green ring-catalogue-green/35',
  VALIDATOR: 'bg-catalogue-green/15 text-catalogue-green ring-catalogue-green/35',
  API_DEVELOPER: 'bg-catalogue-yellow/15 text-catalogue-yellow ring-catalogue-yellow/35',
  BILLING_MANAGER: 'bg-catalogue-yellow/15 text-catalogue-yellow ring-catalogue-yellow/35',
  AUDITOR: 'bg-catalogue-surface-hover text-catalogue-muted ring-catalogue-line-strong',
};

const ACTIVITY_LABEL: Record<
  OrgActivityEvent['eventType'],
  (m: Record<string, unknown>) => string
> = {
  MEMBER_INVITED: (m) => `Invited ${m.email ?? 'a new member'} as ${roleLabel(m.role)}`,
  MEMBER_ROLE_CHANGED: (m) =>
    `Changed a member's role from ${roleLabel(m.oldRole)} to ${roleLabel(m.newRole)}`,
  MEMBER_REMOVED: () => 'Removed a member from the organization',
  KEY_CREATED: () => 'Created a new stream key',
  KEY_ROTATED: () => 'Rotated a stream key',
  KEY_REVOKED: () => 'Revoked a stream key',
  OAUTH_CLIENT_CREATED: () => 'Created an OAuth client',
  OAUTH_CLIENT_REVOKED: () => 'Revoked an OAuth client',
  SUBSCRIPTION_PLAN_CHANGED: () => 'Changed the subscription plan',
  DECK_CREATED: () => 'Created a stream deck',
  DECK_RENAMED: () => 'Renamed a stream deck',
  DECK_DELETED: () => 'Deleted a stream deck',
  DECK_ITEM_ADDED: () => 'Added an item to a stream deck',
  DECK_ITEM_REMOVED: () => 'Removed an item from a stream deck',
  DECK_VISIBILITY_CHANGED: () => 'Changed a stream deck’s visibility',
  SSO_CONFIGURED: () => 'Configured SSO',
  SSO_DISABLED: () => 'Disabled SSO',
  SSO_LOGIN: () => 'Signed in via SSO',
  SECURITY_POLICY_UPDATED: () => 'Updated the security policy',
  SECURITY_POLICY_REMOVED: () => 'Removed the security policy',
};

function roleLabel(value: unknown): string {
  if (typeof value !== 'string') return 'a role';
  return ROLE_LABEL[value as SubscriberOrgRole] ?? value;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RoleBadge({ role }: { role: SubscriberOrgRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${ROLE_BADGE_CLASS[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function TeamView() {
  const { data: session } = useSession();
  const canManage = session?.user.orgRole ? CAN_MANAGE.includes(session.user.orgRole) : false;

  const { data: members, isLoading: membersLoading } = useListMembersQuery();
  const { data: invites, isLoading: invitesLoading } = useListPendingInvitesQuery(undefined, {
    skip: !canManage,
  });
  const { data: activity, isLoading: activityLoading } = useListOrgActivityQuery(undefined, {
    skip: !canManage,
  });

  const [updateRole] = useUpdateMemberRoleMutation();
  const [removeMember] = useRemoveMemberMutation();
  const [inviteMember, { isLoading: inviting }] = useInviteMemberMutation();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<SubscriberOrgRole | 'ALL'>('ALL');
  const [selectedMember, setSelectedMember] = useState<SubscriberMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<SubscriberOrgRole>('DATASET_MANAGER');
  const [error, setError] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    const term = searchTerm.trim().toLowerCase();
    return members.filter((member) => {
      const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;
      const matchesSearch =
        !term ||
        `${member.user.firstName} ${member.user.lastName}`.toLowerCase().includes(term) ||
        member.user.email.toLowerCase().includes(term);
      return matchesRole && matchesSearch;
    });
  }, [members, roleFilter, searchTerm]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await inviteMember({ email: inviteEmail, role: inviteRole }).unwrap();
      setInviteEmail('');
      setInviteOpen(false);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to send this invite.');
    }
  }

  async function handleRoleChange(memberId: string, role: SubscriberOrgRole) {
    setError(null);
    try {
      await updateRole({ id: memberId, role }).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to change this member’s role.');
    }
  }

  async function handleRemove(member: SubscriberMember) {
    setError(null);
    try {
      await removeMember(member.id).unwrap();
      if (selectedMember?.id === member.id) setSelectedMember(null);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to remove this member.');
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<UsersRound aria-hidden="true" className="size-4" />}
          label="Total Members"
          loading={membersLoading}
          value={members?.length ?? 0}
        />
        <StatCard
          icon={<Mail aria-hidden="true" className="size-4" />}
          label="Pending Invites"
          loading={canManage && invitesLoading}
          value={canManage ? (invites?.length ?? 0) : '—'}
        />
      </div>

      {error && (
        <p
          className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-catalogue-dim"
          />
          <input
            className="min-h-9 w-full min-w-[180px] rounded-lg border border-catalogue-line bg-catalogue-surface pl-9 pr-3 text-sm text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:outline-none focus:ring-2 focus:ring-catalogue-blue/25"
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search team members..."
            type="text"
            value={searchTerm}
          />
        </div>
        <select
          className="min-h-9 shrink-0 rounded-lg border border-catalogue-line bg-catalogue-surface px-3 text-sm text-catalogue-ink focus:border-catalogue-blue focus:outline-none"
          onChange={(e) => setRoleFilter(e.target.value as SubscriberOrgRole | 'ALL')}
          value={roleFilter}
        >
          <option value="ALL">All Roles</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
        {canManage && (
          <button
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-catalogue-blue px-3 text-sm font-semibold text-white transition-colors hover:bg-catalogue-blue-bright"
            onClick={() => setInviteOpen(true)}
            type="button"
          >
            <UserPlus aria-hidden="true" className="size-4" />
            Invite Member
          </button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-catalogue-line bg-catalogue-surface">
          <div className="stream-catalogue-scrollbar overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-catalogue-line text-left text-[11px] font-bold uppercase tracking-wide text-catalogue-dim">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Joined</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {membersLoading ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <tr className="border-b border-catalogue-line last:border-0" key={index}>
                      <td className="px-4 py-3" colSpan={4}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-catalogue-muted" colSpan={4}>
                      No members match your search.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr
                      className="cursor-pointer border-b border-catalogue-line last:border-0 hover:bg-catalogue-surface-hover"
                      key={member.id}
                      onClick={() => setSelectedMember(member)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-catalogue-blue/20 text-xs font-bold text-catalogue-blue-bright">
                            {initials(member.user.firstName, member.user.lastName)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-catalogue-ink">
                              {member.user.firstName} {member.user.lastName}
                            </p>
                            <p className="truncate text-xs text-catalogue-dim">
                              {member.user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {canManage ? (
                          <select
                            className="min-h-8 rounded-md border border-catalogue-line bg-catalogue-bg px-2 text-xs font-semibold text-catalogue-ink focus:border-catalogue-blue focus:outline-none"
                            onChange={(e) =>
                              void handleRoleChange(member.id, e.target.value as SubscriberOrgRole)
                            }
                            onClick={(e) => e.stopPropagation()}
                            value={member.role}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-catalogue-muted">
                        {new Date(member.invitedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canManage && (
                          <button
                            aria-label={`Remove ${member.user.firstName} ${member.user.lastName}`}
                            className="inline-grid size-7 place-items-center rounded-md text-catalogue-dim transition-colors hover:bg-danger/15 hover:text-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRemove(member);
                            }}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {members && (
            <p className="border-t border-catalogue-line px-4 py-2.5 text-xs text-catalogue-dim">
              Showing {filteredMembers.length} of {members.length} members
            </p>
          )}
        </div>

        <div className="grid min-w-0 gap-5">
          {selectedMember && (
            <MemberDetailsPanel member={selectedMember} onClose={() => setSelectedMember(null)} />
          )}
          {canManage ? (
            <ActivityPanel activity={activity} loading={activityLoading} />
          ) : (
            !selectedMember && (
              <div className="rounded-lg border border-dashed border-catalogue-line-strong bg-catalogue-surface/60 p-5 text-center">
                <UsersRound aria-hidden="true" className="mx-auto size-6 text-catalogue-dim" />
                <p className="mt-2 text-sm text-catalogue-muted">
                  Select a member to view their details.
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {inviteOpen && (
        <InviteDialog
          email={inviteEmail}
          onClose={() => setInviteOpen(false)}
          onEmailChange={setInviteEmail}
          onRoleChange={setInviteRole}
          onSubmit={handleInvite}
          pending={inviting}
          role={inviteRole}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  loading,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-catalogue-line bg-catalogue-surface p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-catalogue-muted">{label}</p>
        <span className="text-catalogue-dim">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-catalogue-ink">{value}</p>
      )}
    </div>
  );
}

function MemberDetailsPanel({
  member,
  onClose,
}: {
  member: SubscriberMember;
  onClose: () => void;
}) {
  return (
    <div className="rounded-lg border border-catalogue-line bg-catalogue-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-catalogue-ink">Member Details</p>
        <button
          aria-label="Close member details"
          className="grid size-6 place-items-center rounded-md text-catalogue-dim hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-catalogue-blue/20 text-sm font-bold text-catalogue-blue-bright">
          {initials(member.user.firstName, member.user.lastName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-catalogue-ink">
            {member.user.firstName} {member.user.lastName}
          </p>
          <p className="truncate text-xs text-catalogue-dim">{member.user.email}</p>
        </div>
      </div>
      <div className="mt-3">
        <RoleBadge role={member.role} />
      </div>
      <dl className="mt-4 grid gap-2.5 border-t border-catalogue-line pt-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-catalogue-muted">Joined</dt>
          <dd className="font-semibold text-catalogue-ink">
            {new Date(member.invitedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-catalogue-muted">Status</dt>
          <dd className="font-semibold text-catalogue-ink">
            {member.acceptedAt ? 'Active' : 'Invite pending'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ActivityPanel({ activity, loading }: { activity?: OrgActivityEvent[]; loading: boolean }) {
  return (
    <div className="rounded-lg border border-catalogue-line bg-catalogue-surface p-4">
      <div className="flex items-center gap-2">
        <Shield aria-hidden="true" className="size-4 text-catalogue-dim" />
        <p className="text-sm font-bold text-catalogue-ink">Recent Access Changes</p>
      </div>
      <div className="mt-3 grid gap-3">
        {loading ? (
          Array.from({ length: 4 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)
        ) : !activity || activity.length === 0 ? (
          <p className="text-sm text-catalogue-muted">No access changes yet.</p>
        ) : (
          activity.slice(0, 8).map((event) => (
            <div className="flex items-start gap-2.5" key={event.id}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-catalogue-surface-hover text-[10px] font-bold text-catalogue-muted">
                {event.actor ? (
                  initials(event.actor.firstName, event.actor.lastName)
                ) : (
                  <Clock3 aria-hidden="true" className="size-3.5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs leading-snug text-catalogue-ink">
                  {ACTIVITY_LABEL[event.eventType]?.(event.metadata) ?? event.eventType}
                </p>
                <p className="mt-0.5 text-[11px] text-catalogue-dim">
                  {formatRelativeTime(event.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InviteDialog({
  email,
  onClose,
  onEmailChange,
  onRoleChange,
  onSubmit,
  pending,
  role,
}: {
  email: string;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: SubscriberOrgRole) => void;
  onSubmit: (e: FormEvent) => void;
  pending: boolean;
  role: SubscriberOrgRole;
}) {
  return (
    <div
      aria-labelledby="invite-member-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      role="dialog"
    >
      <button
        aria-label="Close invite dialog"
        className="fixed inset-0 bg-black/70"
        onClick={onClose}
        type="button"
      />
      <form
        className="relative z-10 w-full max-w-[380px] rounded-lg border border-catalogue-line bg-catalogue-surface p-5"
        onSubmit={onSubmit}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-catalogue-ink" id="invite-member-title">
            Invite Member
          </h2>
          <button
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-catalogue-dim hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-catalogue-muted"
              htmlFor="invite-email"
            >
              Email
            </label>
            <input
              className="min-h-9 w-full rounded-lg border border-catalogue-line bg-catalogue-bg px-3 text-sm text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:outline-none"
              id="invite-email"
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="colleague@company.com"
              required
              type="email"
              value={email}
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-catalogue-muted"
              htmlFor="invite-role"
            >
              Role
            </label>
            <select
              className="min-h-9 w-full rounded-lg border border-catalogue-line bg-catalogue-bg px-3 text-sm text-catalogue-ink focus:border-catalogue-blue focus:outline-none"
              id="invite-role"
              onChange={(e) => onRoleChange(e.target.value as SubscriberOrgRole)}
              value={role}
            >
              {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="mt-4 inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-catalogue-blue text-sm font-semibold text-white transition-colors hover:bg-catalogue-blue-bright disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Sending invite...' : 'Send invite'}
        </button>
      </form>
    </div>
  );
}
