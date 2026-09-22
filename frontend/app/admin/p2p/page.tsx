'use client';

import { useState } from 'react';
import { AlertTriangle, MessageCircle, ShieldAlert } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { TradeChatPanel } from '@/components/p2p/TradeChatPanel';
import { waLink } from '@/components/WhatsAppContactLink';
import {
  normalizeErrorMessage,
  P2PDispute,
  P2PDisputeParty,
  P2PTrade,
  P2PTradeStatus,
  useGetMeQuery,
  useListAdminP2PDisputesQuery,
  useListAdminP2PTradesQuery,
  useResolveP2PDisputeMutation,
} from '@/store/api';

const PAGE_SIZE = 5;
const TERMINAL_TRADE_STATUSES = new Set<P2PTradeStatus>(['RELEASED', 'CANCELLED', 'EXPIRED']);

function partyName(party: P2PDisputeParty): string {
  return [party.firstName, party.lastName].filter(Boolean).join(' ') || party.email;
}

function counterpartyName(party: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  return [party.firstName, party.lastName].filter(Boolean).join(' ') || party.email;
}

function tradeLabel(trade: P2PTrade): string {
  return `${trade.tokenAmount} DL · ${Number(trade.fiatAmount).toLocaleString()} ${trade.fiatCurrency}`;
}

/**
 * Which side of the trade a dispute party is on.
 *
 * "Reporter" and "defaulter" say who complained, not who is owed the
 * tokens -- and either side can raise a dispute, so neither label implies
 * buyer or seller. Resolving releases to the BUYER or refunds the SELLER,
 * so an admin reading only reporter/defaulter has to work out the mapping
 * in their head on every row. That inference is what produced a real
 * mis-resolution (a dispute released to the buyer when it should have
 * gone back to the seller), so the side is now derived and shown
 * explicitly rather than left to be worked out.
 */
function partySide(dispute: P2PDispute, party: P2PDisputeParty): 'buyer' | 'seller' | null {
  if (party.id === dispute.trade.buyerId) return 'buyer';
  if (party.id === dispute.trade.sellerId) return 'seller';
  return null;
}

/** The trade's buyer/seller display names, for the release confirmation. */
function tradePartyName(trade: P2PTrade, side: 'buyer' | 'seller'): string {
  return counterpartyName(side === 'buyer' ? trade.buyer : trade.seller);
}

/** "Xm"/"Xh"/"Xd" elapsed since `iso` -- deliberately short (no "ago"/"since" suffix baked in, callers add their own context word) so it reads as a compact, at-a-glance duration next to a timestamp. */
function elapsedSince(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Red "time open" indicator -- flags how long a dispute/trade has been sitting unresolved so an admin can triage the oldest ones first, matching the danger-red styling used for the dispute defaulter dot elsewhere on this page. */
function TimeOpenBadge({ since, suffix }: { since: string; suffix: string }) {
  return (
    <p className="text-xs font-bold text-danger">
      {elapsedSince(since)} {suffix}
    </p>
  );
}

export default function AdminP2PPage() {
  const { data: me } = useGetMeQuery();
  const { data: trades = [], isLoading: tradesLoading } = useListAdminP2PTradesQuery();
  const { data: disputes = [], isLoading: disputesLoading } = useListAdminP2PDisputesQuery({
    status: 'OPEN',
  });
  const [resolveDispute, { isLoading: resolving }] = useResolveP2PDisputeMutation();
  const [error, setError] = useState('');
  const [chatTrade, setChatTrade] = useState<P2PTrade | null>(null);
  const [pendingResolution, setPendingResolution] = useState<{
    dispute: P2PDispute;
    winner: 'buyer' | 'seller';
  } | null>(null);

  async function resolve(dispute: P2PDispute, winner: 'buyer' | 'seller') {
    setError('');
    try {
      await resolveDispute({
        id: dispute.id,
        winner,
        resolutionNote: `Resolved to ${winner}`,
      }).unwrap();
      setPendingResolution(null);
    } catch (err) {
      // Deliberately leaves the dialog open on failure, so the admin sees
      // the error against the decision they were making rather than being
      // dropped back to the list wondering whether it went through.
      setError(normalizeErrorMessage(err, 'Unable to resolve dispute'));
    }
  }

  const disputeColumns: DataTableColumn<P2PDispute>[] = [
    {
      key: 'reason',
      header: 'Dispute',
      sortValue: (d) => d.reason,
      searchable: true,
      render: (d) => (
        <div className="min-w-0">
          <p className="font-black">{d.reason}</p>
          <p className="text-sm text-muted">{tradeLabel(d.trade)}</p>
        </div>
      ),
      className: 'min-w-56',
    },
    {
      key: 'reporter',
      header: 'Reporter',
      sortValue: (d) => partyName(d.raisedBy),
      searchable: true,
      render: (d) => <PartyBadge dispute={d} party={d.raisedBy} role="reporter" />,
    },
    {
      key: 'defaulter',
      header: 'Defaulter',
      sortValue: (d) => partyName(d.defaulter),
      searchable: true,
      render: (d) => <PartyBadge dispute={d} party={d.defaulter} role="defaulter" />,
    },
    {
      key: 'raisedAt',
      header: 'Raised',
      sortValue: (d) => d.createdAt,
      render: (d) => (
        <div>
          <span className="text-sm text-muted">{new Date(d.createdAt).toLocaleString()}</span>
          <TimeOpenBadge since={d.createdAt} suffix="since trade" />
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) => (
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-9 rounded-lg border border-line px-3 text-sm font-extrabold hover:bg-surface-muted disabled:opacity-60"
            onClick={() => setChatTrade(d.trade)}
            type="button"
          >
            View conversation
          </button>
          {/* Both actions name the person who receives the tokens, and
              both confirm first -- these move real balances and are not
              reversible from this screen. */}
          <button
            className="min-h-9 rounded-lg bg-accent px-3 py-1.5 text-left text-sm font-extrabold text-white disabled:opacity-60"
            disabled={resolving}
            onClick={() => setPendingResolution({ dispute: d, winner: 'buyer' })}
            type="button"
          >
            Release to buyer
            <span className="block truncate text-[11px] font-bold opacity-90">
              {tradePartyName(d.trade, 'buyer')}
            </span>
          </button>
          <button
            className="min-h-9 rounded-lg border border-line px-3 py-1.5 text-left text-sm font-extrabold hover:bg-surface-muted disabled:opacity-60"
            disabled={resolving}
            onClick={() => setPendingResolution({ dispute: d, winner: 'seller' })}
            type="button"
          >
            Refund seller
            <span className="block truncate text-[11px] font-bold text-muted">
              {tradePartyName(d.trade, 'seller')}
            </span>
          </button>
        </div>
      ),
    },
  ];

  const tradeColumns: DataTableColumn<P2PTrade>[] = [
    {
      key: 'status',
      header: 'Status',
      sortValue: (t) => t.status,
      searchable: true,
      render: (t) => (
        <div>
          <span className="font-black">{t.status}</span>
          {!TERMINAL_TRADE_STATUSES.has(t.status) && (
            <TimeOpenBadge since={t.createdAt} suffix="open" />
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortValue: (t) => t.offerType,
      searchable: true,
      render: (t) => t.offerType,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortValue: (t) => Number(t.tokenAmount),
      render: (t) => (
        <span className="whitespace-nowrap">
          {t.tokenAmount} DL · {Number(t.fiatAmount).toLocaleString()} {t.fiatCurrency}
        </span>
      ),
    },
    {
      key: 'buyer',
      header: 'Buyer',
      sortValue: (t) => counterpartyName(t.buyer),
      searchable: true,
      render: (t) => <TraderCell trader={t.buyer} />,
    },
    {
      key: 'seller',
      header: 'Seller',
      sortValue: (t) => counterpartyName(t.seller),
      searchable: true,
      render: (t) => <TraderCell trader={t.seller} />,
    },
    {
      key: 'deadline',
      header: 'Deadline',
      sortValue: (t) => t.paymentDeadlineAt,
      render: (t) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {new Date(t.paymentDeadlineAt).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-black">P2P Market</h1>
          <p className="mt-2 text-muted">
            Monitor escrow trades, cancellation states, and open disputes.
          </p>
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            {error}
          </p>
        )}

        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-danger" aria-hidden="true" />
            <h2 className="text-xl font-black">Open disputes</h2>
          </div>
          <DataTable
            columns={disputeColumns}
            rows={disputes}
            rowKey={(d) => d.id}
            isLoading={disputesLoading}
            emptyMessage="No open disputes."
            pageSize={PAGE_SIZE}
            searchPlaceholder="Search reason, reporter, or defaulter…"
          />
        </section>

        <section className="grid gap-3">
          <h2 className="text-xl font-black">Recent trades</h2>
          <DataTable
            columns={tradeColumns}
            rows={trades}
            rowKey={(t) => t.id}
            isLoading={tradesLoading}
            emptyMessage="No P2P trades yet."
            pageSize={PAGE_SIZE}
            searchPlaceholder="Search status, type, buyer, or seller…"
          />
        </section>
      </div>
      {chatTrade && (
        <TradeChatPanel
          isViewerAdmin
          onClose={() => setChatTrade(null)}
          trade={chatTrade}
          viewerId={me?.id}
        />
      )}
      <Dialog
        open={pendingResolution !== null}
        onOpenChange={(open) => {
          if (!open && !resolving) {
            setPendingResolution(null);
            setError('');
          }
        }}
      >
        {pendingResolution && (
          <ResolveDisputeConfirmation
            dispute={pendingResolution.dispute}
            error={error}
            onCancel={() => {
              setPendingResolution(null);
              setError('');
            }}
            onConfirm={() => void resolve(pendingResolution.dispute, pendingResolution.winner)}
            resolving={resolving}
            winner={pendingResolution.winner}
          />
        )}
      </Dialog>
    </AdminShell>
  );
}

/**
 * Last check before tokens move. Restates the decision in full -- who
 * receives them, how much, and what happens to the other party -- because
 * the two actions sit next to each other in a dense table and the row
 * itself gives no second chance: resolving is not reversible from this
 * screen (undoing one means a manual ledger correction against production).
 */
function ResolveDisputeConfirmation({
  dispute,
  error,
  onCancel,
  onConfirm,
  resolving,
  winner,
}: {
  dispute: P2PDispute;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  resolving: boolean;
  winner: 'buyer' | 'seller';
}) {
  const recipient = tradePartyName(dispute.trade, winner);
  const loser = tradePartyName(dispute.trade, winner === 'buyer' ? 'seller' : 'buyer');
  const action = winner === 'buyer' ? 'Release to buyer' : 'Refund seller';

  return (
    <DialogContent
      title={action}
      description="This moves tokens immediately and cannot be undone from this screen."
    >
      <div className="grid gap-4">
        <div className="grid gap-2 rounded-lg border border-line bg-surface-muted p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-muted">Amount</span>
            <span className="font-black">{tradeLabel(dispute.trade)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-muted">
              {winner === 'buyer' ? 'Buyer receives' : 'Seller keeps'}
            </span>
            <span className="text-right font-black text-accent">{recipient}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-muted">
              {winner === 'buyer' ? 'Seller forfeits' : 'Buyer receives nothing'}
            </span>
            <span className="text-right font-bold">{loser}</span>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted">
          Dispute raised by <span className="font-bold text-ink">{partyName(dispute.raisedBy)}</span>
          {partySide(dispute, dispute.raisedBy)
            ? ` (the ${partySide(dispute, dispute.raisedBy)})`
            : ''}
          : &ldquo;{dispute.reason}&rdquo;
        </p>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted disabled:opacity-60"
            disabled={resolving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-lg bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-60"
            disabled={resolving}
            onClick={onConfirm}
            type="button"
          >
            {resolving ? 'Resolving…' : `${action} — ${recipient}`}
          </button>
        </div>
      </div>
    </DialogContent>
  );
}

/** Buyer/seller cell in the trades table -- name + email, same identity info as the dispute table's reporter/defaulter badges, just without the red/green role coloring since a trade row has no defaulter concept on its own. */
function TraderCell({
  trader,
}: {
  trader: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string | null;
  };
}) {
  return (
    <div className="min-w-0">
      <p className="truncate font-bold">{counterpartyName(trader)}</p>
      <p className="truncate text-xs text-muted">{trader.email}</p>
      {trader.phoneNumber && (
        <a
          className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-dark"
          href={waLink(trader.phoneNumber)}
          rel="noreferrer"
          target="_blank"
        >
          <MessageCircle className="size-3" aria-hidden="true" /> {trader.phoneNumber}
        </a>
      )}
    </div>
  );
}

/**
 * Reporter (green) / defaulter (red) identity badge for a dispute row --
 * name, email, and a WhatsApp click-to-chat link carrying a message
 * pre-filled with the dispute's context, worded from THIS party's
 * perspective, so an admin never has to retype who's who before reaching
 * out (see WhatsAppContactLink's doc comment for the shared wa.me pattern).
 */
function PartyBadge({
  dispute,
  party,
  role,
}: {
  dispute: P2PDispute;
  party: P2PDisputeParty;
  role: 'reporter' | 'defaulter';
}) {
  const name = partyName(party);
  const trade = tradeLabel(dispute.trade);
  const otherPartyName =
    role === 'reporter' ? partyName(dispute.defaulter) : partyName(dispute.raisedBy);
  const message =
    role === 'reporter'
      ? `You raised a dispute against ${otherPartyName} for the trade ${trade}.`
      : `${otherPartyName} has raised a dispute against you for the trade ${trade}.`;
  const dotClassName = role === 'reporter' ? 'bg-emerald-500' : 'bg-danger';
  const side = partySide(dispute, party);
  const roleLabel = role === 'reporter' ? 'Reporter' : 'Defaulter';

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        aria-label={roleLabel}
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dotClassName}`}
        title={roleLabel}
      />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-bold">{name}</span>
          {/* The side, not the role, is what decides which action is
              correct -- so it is spelled out on the row rather than
              inferred from who complained. */}
          {side && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${
                side === 'seller'
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                  : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
              }`}
            >
              {side}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted">{party.email}</p>
        {party.phoneNumber ? (
          <a
            className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-dark"
            href={waLink(party.phoneNumber, message)}
            rel="noreferrer"
            target="_blank"
          >
            <MessageCircle className="size-3" aria-hidden="true" /> {party.phoneNumber}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <AlertTriangle className="size-3" aria-hidden="true" /> No phone on file
          </span>
        )}
      </div>
    </div>
  );
}
