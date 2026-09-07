'use client';

import { FormEvent, useState } from 'react';
import { useSession } from 'next-auth/react';
import { UserPlus } from 'lucide-react';
import {
  useInviteMemberMutation,
  useListMembersQuery,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from '@/store/api';
import type { SubscriberOrgRole } from '@/lib/api-client';
import {
  Card,
  ErrorText,
  FieldLabel,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/components/ui';

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

export default function TeamPage() {
  const { data: session } = useSession();
  const canManage = session?.user.orgRole ? CAN_MANAGE.includes(session.user.orgRole) : false;

  const { data: members, isLoading } = useListMembersQuery();
  const [inviteMember, { isLoading: inviting }] = useInviteMemberMutation();
  const [updateRole] = useUpdateMemberRoleMutation();
  const [removeMember] = useRemoveMemberMutation();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SubscriberOrgRole>('DATASET_MANAGER');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submitInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await inviteMember({ email, role }).unwrap();
      setEmail('');
      setSuccess('Invite sent.');
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to send this invite.');
    }
  }

  async function handleRoleChange(memberId: string, nextRole: SubscriberOrgRole) {
    setError(null);
    setSuccess(null);
    try {
      await updateRole({ id: memberId, role: nextRole }).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to change this member’s role.');
    }
  }

  async function handleRemove(memberId: string) {
    setError(null);
    setSuccess(null);
    try {
      await removeMember(memberId).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to remove this member.');
    }
  }

  return (
    <div>
      <PageHeading subtitle="Manage who has access to your organization." title="Team" />

      {canManage && (
        <Card className="mb-6 p-5">
          <form className="flex flex-wrap items-end gap-3" onSubmit={submitInvite}>
            <div className="flex-1">
              <FieldLabel>Email</FieldLabel>
              <TextInput
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div>
              <FieldLabel>Role</FieldLabel>
              <select
                className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm"
                onChange={(e) => setRole(e.target.value as SubscriberOrgRole)}
                value={role}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <PrimaryButton disabled={inviting} type="submit">
              <UserPlus aria-hidden="true" className="size-4" />
              {inviting ? 'Sending...' : 'Send invite'}
            </PrimaryButton>
          </form>
          {error && <div className="mt-3">{<ErrorText>{error}</ErrorText>}</div>}
          {success && <p className="mt-3 text-sm font-bold text-success">{success}</p>}
        </Card>
      )}

      <Card>
        {isLoading ? (
          <p className="p-5 text-sm text-muted">Loading...</p>
        ) : members && members.length > 0 ? (
          <div className="divide-y divide-line">
            {members.map((member) => (
              <div className="flex items-center justify-between gap-3 p-4" key={member.id}>
                <div>
                  <p className="font-bold text-ink">
                    {member.user.firstName} {member.user.lastName}
                  </p>
                  <p className="text-xs text-muted">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <select
                      className="min-h-9 rounded-lg border border-line bg-white px-2 text-sm"
                      onChange={(e) =>
                        void handleRoleChange(member.id, e.target.value as SubscriberOrgRole)
                      }
                      value={member.role}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm font-bold text-muted">{member.role}</span>
                  )}
                  {canManage && (
                    <SecondaryButton onClick={() => void handleRemove(member.id)} type="button">
                      Remove
                    </SecondaryButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">No members yet.</p>
        )}
        {canManage && (error || success) && (
          <div className="border-t border-line p-4">
            {error && <ErrorText>{error}</ErrorText>}
            {success && <p className="text-sm font-bold text-success">{success}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
