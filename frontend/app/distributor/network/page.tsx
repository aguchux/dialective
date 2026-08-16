'use client';

import { type FormEvent, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { formatTokens } from '@/components/distributor/format';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import {
  normalizeErrorMessage,
  useGetDistributorDashboardQuery,
  useGetDistributorNetworkQuery,
  useSendReferralInviteMutation,
  type DistributorNetworkNode,
} from '@/store/api';

type FlatMember = Omit<DistributorNetworkNode, 'children'>;

export default function DistributorNetworkPage() {
  const { data: network, isLoading } = useGetDistributorNetworkQuery();
  const { data: dashboard } = useGetDistributorDashboardQuery();
  const [view, setView] = useState<'tree' | 'all'>('tree');

  const columns: DataTableColumn<FlatMember>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (m) => <span className="font-black text-ink">{m.name}</span>,
      sortValue: (m) => m.name,
    },
    {
      key: 'level',
      header: 'Level',
      render: (m) => <span className="text-muted">Level {m.level}</span>,
      sortValue: (m) => m.level,
    },
    {
      key: 'tokenBalance',
      header: 'DL balance',
      render: (m) => <span className="font-black text-ink">{formatTokens(m.tokenBalance)} DL</span>,
      sortValue: (m) => Number(m.tokenBalance),
    },
  ];

  return (
    <DistributorShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-3xl font-black">Network</h1>
            <p className="text-muted">
              Names and DL balances of your referred members, up to {network?.maxDepth ?? 0} downline level
              {network?.maxDepth === 1 ? '' : 's'}.
            </p>
          </div>
          {dashboard?.profile.referralCode && <InviteButton referralCode={dashboard.profile.referralCode} />}
        </div>

        {isLoading && <p className="text-muted">Loading network...</p>}

        {network && (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Metric label="Direct referrals" value={network.directMembers.toLocaleString()} />
              <Metric label="Total members" value={network.totalMembers.toLocaleString()} />
              <Metric label="Total DL balance" value={`${formatTokens(network.totalTokenBalance)} DL`} />
            </section>

            {network.maxDepth === 0 && (
              <p className="rounded-lg border border-line bg-surface p-6 text-center font-bold text-muted">
                Multi-level referrals are currently disabled by admin.
              </p>
            )}

            {network.maxDepth > 0 && (
              <>
                <div className="inline-flex w-fit rounded-lg border border-line bg-surface p-1">
                  <button
                    className={`rounded-md px-3 py-1.5 text-sm font-extrabold ${view === 'tree' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
                    onClick={() => setView('tree')}
                    type="button"
                  >
                    By referral
                  </button>
                  <button
                    className={`rounded-md px-3 py-1.5 text-sm font-extrabold ${view === 'all' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
                    onClick={() => setView('all')}
                    type="button"
                  >
                    See all ({network.totalMembers})
                  </button>
                </div>

                {view === 'tree' &&
                  (network.tree.length === 0 ? (
                    <p className="rounded-lg border border-line bg-surface p-6 text-center font-bold text-muted">No referred members yet.</p>
                  ) : (
                    <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
                      {network.tree.map((node) => (
                        <NetworkNodeView key={node.id} node={node} />
                      ))}
                    </div>
                  ))}

                {view === 'all' && (
                  <DataTable
                    columns={columns}
                    rows={network.allMembers}
                    rowKey={(m) => m.id}
                    emptyMessage="No referred members yet."
                    searchPlaceholder="Search members..."
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </DistributorShell>
  );
}

function InviteButton({ referralCode }: { referralCode: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendReferralInvite, { isLoading: isSending }] = useSendReferralInviteMutation();

  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${referralCode}` : '';

  async function copyLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await sendReferralInvite({ firstName: firstName.trim(), email: email.trim() }).unwrap();
      setMessage('Invitation sent successfully.');
      setFirstName('');
      setEmail('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to send invitation right now.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark" type="button">
        Invite
      </DialogTrigger>
      <DialogContent title="Invite to your network" description="Send an email invite, or copy your referral link.">
        <div className="grid gap-1">
          <p className="text-sm font-bold text-ink">Referral link</p>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-muted p-2 pl-3">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{referralLink}</span>
            <button className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-white" onClick={copyLink} type="button" title="Copy referral link">
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              <span className="sr-only">{copied ? 'Copied' : 'Copy referral link'}</span>
            </button>
          </div>
        </div>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-sm font-bold text-ink" htmlFor="invite-first-name">
              First name
            </label>
            <input
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted"
              id="invite-first-name"
              maxLength={80}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              required
              type="text"
              value={firstName}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-bold text-ink" htmlFor="invite-email">
              Email
            </label>
            <input
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted"
              id="invite-email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          {message && (
            <p className="text-sm font-bold text-emerald-700" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="text-sm font-bold text-danger" role="alert">
              {error}
            </p>
          )}
          <ActionButton
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            pending={isSending}
            pendingLabel="Sending"
            type="submit"
          >
            Send invite
          </ActionButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  );
}

function NetworkNodeView({ node }: { node: DistributorNetworkNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-surface-muted p-3">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span>
          <span className="block font-black">{node.name}</span>
          <span className="text-xs font-bold uppercase text-muted">Level {node.level}</span>
        </span>
        <span className="font-black">{formatTokens(node.tokenBalance)} DL</span>
      </button>
      {open && node.children.length > 0 && (
        <div className="mt-3 grid gap-2 border-l border-line pl-3">
          {node.children.map((child) => (
            <NetworkNodeView key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}
