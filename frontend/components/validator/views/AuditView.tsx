'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { cardClass, EmptyPanel, formatDateTime } from '@/components/dashboard/shared';
import {
  normalizeErrorMessage,
  useApproveValidatorDeckMutation,
  useGetValidatorDeckAuditLogQuery,
  useGetValidatorDecksQuery,
  useRejectValidatorDeckMutation,
  type ValidatorDeckSummary,
} from '@/store/api';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_L2: 'Pending L2 approval',
  PENDING_L3: 'Pending L3 approval',
  PENDING_ADMIN: 'Pending admin approval',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

/**
 * Phase 2 (docs/validators.md): the approval queue for the caller's own
 * tier (via the pendingMyApproval filter -- the backend resolves this to
 * PENDING_L2/PENDING_L3/PENDING_ADMIN or empty depending on the caller's
 * current role/validatorLevel) plus the caller's own submission history
 * with an expandable audit trail per deck.
 */
export function AuditView() {
  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h2 className="text-lg font-black">Awaiting your approval</h2>
        <PendingApprovalQueue />
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-black">Your submissions</h2>
        <MySubmissions />
      </section>
    </div>
  );
}

function PendingApprovalQueue() {
  const { data: decks, isLoading } = useGetValidatorDecksQuery({ filter: 'pendingMyApproval' });

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {[0, 1].map((i) => (
          <div className="h-20 animate-pulse rounded-lg bg-surface-muted" key={i} />
        ))}
      </div>
    );
  }

  if (!decks || decks.length === 0) {
    return <EmptyPanel icon={ShieldCheck} title="Nothing is waiting on your approval right now" />;
  }

  return (
    <div className="grid gap-2">
      {decks.map((deck) => (
        <PendingApprovalRow deck={deck} key={deck.id} />
      ))}
    </div>
  );
}

function PendingApprovalRow({ deck }: { deck: ValidatorDeckSummary }) {
  const [approve, { isLoading: approving }] = useApproveValidatorDeckMutation();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    try {
      await approve(deck.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to approve this deck.'));
    }
  }

  return (
    <div className={`${cardClass} grid gap-2 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link className="truncate font-black hover:underline" href={`/validator/decks/${deck.id}`}>
            {deck.name}
          </Link>
          <p className="text-xs font-bold text-muted">
            {STATUS_LABELS[deck.status] ?? deck.status} &middot; {deck._count.items} recording
            {deck._count.items === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className="min-h-9 rounded-lg bg-accent px-3.5 text-sm font-extrabold text-white disabled:opacity-60"
            disabled={approving}
            onClick={() => void handleApprove()}
            type="button"
          >
            {approving ? 'Approving…' : 'Approve'}
          </button>
          <button
            className="min-h-9 rounded-lg border border-red-300 px-3.5 text-sm font-bold text-red-600 hover:bg-red-50"
            onClick={() => setRejectOpen(true)}
            type="button"
          >
            Reject
          </button>
        </div>
      </div>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
      {rejectOpen && <RejectDeckDialog deckId={deck.id} deckName={deck.name} onClose={() => setRejectOpen(false)} />}
    </div>
  );
}

function RejectDeckDialog({
  deckId,
  deckName,
  onClose,
}: {
  deckId: string;
  deckName: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rejectDeck, { isLoading }] = useRejectValidatorDeckMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setError(null);
    try {
      await rejectDeck({ id: deckId, reason: reason.trim() }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to reject this deck.'));
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form className={`${cardClass} grid w-full max-w-sm gap-3 p-5`} onSubmit={(e) => void handleSubmit(e)}>
        <h2 className="text-lg font-black">Reject &ldquo;{deckName}&rdquo;</h2>
        <p className="text-sm text-muted">
          A reason is required so the owner knows what to fix before resubmitting.
        </p>
        <label className="grid gap-1 text-sm font-bold">
          Reason
          <textarea
            autoFocus
            className="min-h-24 rounded-lg border border-line bg-surface px-3 py-2"
            onChange={(e) => setReason(e.target.value)}
            required
            value={reason}
          />
        </label>
        {error && <p className="text-sm font-bold text-danger">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button className="min-h-10 rounded-lg border border-line px-3 font-bold" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="min-h-10 rounded-lg border border-red-300 bg-red-50 px-4 font-extrabold text-red-700 disabled:opacity-60"
            disabled={isLoading || !reason.trim()}
            type="submit"
          >
            {isLoading ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MySubmissions() {
  const { data: decks, isLoading } = useGetValidatorDecksQuery({ filter: 'mine' });
  const [expandedDeckId, setExpandedDeckId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <div className="h-16 animate-pulse rounded-lg bg-surface-muted" key={i} />
        ))}
      </div>
    );
  }

  if (!decks || decks.length === 0) {
    return <EmptyPanel icon={ShieldCheck} title="You haven't created any decks yet" />;
  }

  return (
    <div className="grid gap-2">
      {decks.map((deck) => (
        <div className={`${cardClass} p-4`} key={deck.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link className="truncate font-black hover:underline" href={`/validator/decks/${deck.id}`}>
                {deck.name}
              </Link>
              <p className="text-xs font-bold text-muted">{STATUS_LABELS[deck.status] ?? deck.status}</p>
            </div>
            <button
              className="min-h-8 shrink-0 rounded-lg border border-line px-3 text-xs font-bold hover:bg-surface-muted"
              onClick={() => setExpandedDeckId(expandedDeckId === deck.id ? null : deck.id)}
              type="button"
            >
              {expandedDeckId === deck.id ? 'Hide history' : 'View history'}
            </button>
          </div>
          {expandedDeckId === deck.id && <DeckAuditTrail deckId={deck.id} />}
        </div>
      ))}
    </div>
  );
}

function DeckAuditTrail({ deckId }: { deckId: string }) {
  const { data: entries, isLoading } = useGetValidatorDeckAuditLogQuery(deckId);

  if (isLoading) {
    return <div className="mt-3 h-16 animate-pulse rounded-lg bg-surface-muted" />;
  }
  if (!entries || entries.length === 0) {
    return <p className="mt-3 text-xs text-muted">No audit history yet.</p>;
  }

  return (
    <ol className="mt-3 grid gap-2 border-t border-line pt-3">
      {entries.map((entry) => (
        <li className="text-xs" key={entry.id}>
          <span className="font-bold">{entry.action}</span>
          {entry.fromStatus && entry.toStatus && (
            <span className="text-muted">
              {' '}
              &middot; {STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} &rarr;{' '}
              {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
            </span>
          )}
          <span className="text-muted"> &middot; {formatDateTime(entry.createdAt)}</span>
          {entry.reason && <p className="mt-0.5 text-muted">&ldquo;{entry.reason}&rdquo;</p>}
        </li>
      ))}
    </ol>
  );
}
