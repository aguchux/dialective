'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ClipboardCheck, FileQuestion, Trash2 } from 'lucide-react';
import { cardClass, EmptyPanel, formatDateTime } from '@/components/dashboard/shared';
import {
  normalizeErrorMessage,
  useAddValidatorDeckItemMutation,
  useGetValidatorDeckAuditLogQuery,
  useGetValidatorDeckQuery,
  useRemoveValidatorDeckItemMutation,
  useScoreValidatorDeckItemMutation,
  useSubmitValidatorDeckMutation,
  useUpdateValidatorDeckMutation,
  ValidatorItemStatus,
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

const STATUS_BADGE_STYLES: Record<string, string> = {
  DRAFT: 'bg-surface-muted text-muted',
  PENDING_L2: 'bg-amber-100 text-amber-700',
  PENDING_L3: 'bg-amber-100 text-amber-700',
  PENDING_ADMIN: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  ARCHIVED: 'bg-surface-muted text-muted',
};

const ITEM_STATUS_STYLES: Record<ValidatorItemStatus, string> = {
  UNSCORED: 'bg-surface-muted text-muted',
  VALID: 'bg-emerald-100 text-emerald-700',
  INVALID: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function ValidatorDeckDetailPage() {
  const params = useParams<{ id: string }>();
  const deckId = params.id;
  const { data: session } = useSession();
  const { data: deck, isLoading } = useGetValidatorDeckQuery(deckId, { skip: !deckId });
  const [addItem, { isLoading: adding }] = useAddValidatorDeckItemMutation();
  const [removeItem] = useRemoveValidatorDeckItemMutation();
  const [submitDeck, { isLoading: submitting }] = useSubmitValidatorDeckMutation();
  const [renaming, setRenaming] = useState(false);
  const [recordingId, setRecordingId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isOwner = deck && session?.user?.id === deck.ownerUserId;
  const canSubmit = isOwner && (deck?.status === 'DRAFT' || deck?.status === 'REJECTED');

  async function handleSubmit() {
    if (!deckId) return;
    setSubmitError(null);
    try {
      await submitDeck(deckId).unwrap();
    } catch (err) {
      setSubmitError(normalizeErrorMessage(err, 'Unable to submit this deck.'));
    }
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!recordingId.trim() || !deckId) return;
    await addItem({ id: deckId, recordingId: recordingId.trim() }).unwrap();
    setRecordingId('');
  }

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-4xl gap-6 p-4 sm:p-6">
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="mx-auto grid max-w-4xl gap-6 p-4 sm:p-6">
        <EmptyPanel icon={FileQuestion} title="Deck not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-4 sm:p-6">
      <Link className="inline-flex items-center gap-1 text-sm font-bold text-accent" href="/validator?view=decks">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Stream Decks
      </Link>

      <section className={`${cardClass} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {renaming ? (
              <RenameDeckForm deckId={deck.id} initialName={deck.name} onDone={() => setRenaming(false)} />
            ) : (
              <button
                className="text-left text-2xl font-black hover:underline"
                onClick={() => setRenaming(true)}
                type="button"
              >
                {deck.name}
              </button>
            )}
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE_STYLES[deck.status] ?? 'bg-surface-muted text-muted'}`}
            >
              {STATUS_LABELS[deck.status] ?? deck.status}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-muted">Expected earning</p>
            <p className="text-xl font-black">{deck.expectedEarning} DL</p>
          </div>
        </div>
        {canSubmit && (
          <div className="mt-4 border-t border-line pt-4">
            <button
              className="min-h-10 rounded-lg bg-accent px-4 font-extrabold text-white disabled:opacity-60"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {submitting ? 'Submitting…' : deck.status === 'REJECTED' ? 'Resubmit for approval' : 'Submit for approval'}
            </button>
            {submitError && <p className="mt-2 text-sm font-bold text-danger">{submitError}</p>}
          </div>
        )}
      </section>

      {deck.status === 'DRAFT' && (
        <form className={`${cardClass} flex flex-wrap items-end gap-3 p-4`} onSubmit={(e) => void handleAddItem(e)}>
          <label className="grid flex-1 gap-1 text-sm font-bold">
            Recording ID
            <input
              className="min-h-10 rounded-lg border border-line bg-surface px-3"
              onChange={(e) => setRecordingId(e.target.value)}
              placeholder="Paste a recording ID from Validations"
              value={recordingId}
            />
          </label>
          <button
            className="min-h-10 rounded-lg bg-accent px-4 font-extrabold text-white disabled:opacity-60"
            disabled={adding}
            type="submit"
          >
            Add to deck
          </button>
        </form>
      )}

      <section className="grid gap-2">
        <h2 className="text-lg font-black">{deck.items.length} recording{deck.items.length === 1 ? '' : 's'}</h2>
        {deck.items.length === 0 ? (
          <EmptyPanel icon={ClipboardCheck} title="No recordings in this deck yet" />
        ) : (
          <div className="grid gap-2">
            {deck.items.map((item) => (
              <DeckItemRow
                deckId={deck.id}
                editable={deck.status === 'DRAFT'}
                item={item}
                key={item.id}
                onRemove={() => void removeItem({ id: deck.id, recordingId: item.recordingId })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-black">Audit trail</h2>
        <DeckAuditTrail deckId={deck.id} />
      </section>
    </div>
  );
}

function DeckAuditTrail({ deckId }: { deckId: string }) {
  const { data: entries, isLoading } = useGetValidatorDeckAuditLogQuery(deckId);

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-lg bg-surface-muted" />;
  }
  if (!entries || entries.length === 0) {
    return <EmptyPanel icon={ClipboardCheck} title="No audit history yet" />;
  }

  return (
    <ol className={`${cardClass} grid gap-3 p-4`}>
      {entries.map((entry) => (
        <li className="grid gap-0.5 border-b border-line pb-3 text-sm last:border-0 last:pb-0" key={entry.id}>
          <span className="font-black">{entry.action}</span>
          {entry.fromStatus && entry.toStatus && (
            <span className="text-xs text-muted">
              {STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} &rarr;{' '}
              {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
            </span>
          )}
          <span className="text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
          {entry.reason && <p className="mt-1 text-xs text-muted">&ldquo;{entry.reason}&rdquo;</p>}
        </li>
      ))}
    </ol>
  );
}

function RenameDeckForm({
  deckId,
  initialName,
  onDone,
}: {
  deckId: string;
  initialName: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [updateDeck, { isLoading }] = useUpdateValidatorDeckMutation();

  async function commit() {
    if (name.trim() && name.trim() !== initialName) {
      await updateDeck({ id: deckId, body: { name: name.trim() } }).unwrap();
    }
    onDone();
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
    >
      <input
        autoFocus
        className="min-h-10 rounded-lg border border-line bg-surface px-3 text-xl font-black"
        onBlur={() => void commit()}
        onChange={(e) => setName(e.target.value)}
        value={name}
      />
      <button className="text-sm font-bold text-accent" disabled={isLoading} type="submit">
        Save
      </button>
    </form>
  );
}

function DeckItemRow({
  deckId,
  editable,
  item,
  onRemove,
}: {
  deckId: string;
  editable: boolean;
  item: { id: string; recordingId: string; validationStatus: ValidatorItemStatus; validatorScore: string | null; validatorNotes: string | null; scoredAt: string | null };
  onRemove: () => void;
}) {
  const [scoreItem, { isLoading }] = useScoreValidatorDeckItemMutation();
  const [scoreOpen, setScoreOpen] = useState(false);

  return (
    <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-3`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{item.recordingId}</p>
        {item.scoredAt && (
          <p className="text-xs text-muted">Scored {formatDateTime(item.scoredAt)}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ITEM_STATUS_STYLES[item.validationStatus]}`}>
          {item.validationStatus}
          {item.validatorScore ? ` · ${item.validatorScore}` : ''}
        </span>
        {editable && (
          <>
            <button
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold hover:bg-surface-muted"
              onClick={() => setScoreOpen(true)}
              type="button"
            >
              Score
            </button>
            <button
              className="rounded-lg border border-line p-1.5 text-red-600 hover:bg-red-50"
              onClick={onRemove}
              type="button"
              aria-label="Remove from deck"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {scoreOpen && (
        <ScoreItemDialog
          deckId={deckId}
          initialNotes={item.validatorNotes}
          initialScore={item.validatorScore}
          initialStatus={item.validationStatus}
          onClose={() => setScoreOpen(false)}
          onSubmit={async (body) => {
            await scoreItem({ id: deckId, recordingId: item.recordingId, body }).unwrap();
            setScoreOpen(false);
          }}
          submitting={isLoading}
        />
      )}
    </div>
  );
}

function ScoreItemDialog({
  initialNotes,
  initialScore,
  initialStatus,
  onClose,
  onSubmit,
  submitting,
}: {
  deckId: string;
  initialNotes: string | null;
  initialScore: string | null;
  initialStatus: ValidatorItemStatus;
  onClose: () => void;
  onSubmit: (body: { status: ValidatorItemStatus; score?: number; notes?: string }) => Promise<void>;
  submitting: boolean;
}) {
  const [status, setStatus] = useState<ValidatorItemStatus>(initialStatus);
  const [score, setScore] = useState(initialScore ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      status,
      score: score.trim() ? Number(score) : undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form className={`${cardClass} grid w-full max-w-sm gap-3 p-5`} onSubmit={(e) => void handleSubmit(e)}>
        <h2 className="text-lg font-black">Score recording</h2>
        <label className="grid gap-1 text-sm font-bold">
          Status
          <select
            className="min-h-10 rounded-lg border border-line bg-surface px-3"
            onChange={(e) => setStatus(e.target.value as ValidatorItemStatus)}
            value={status}
          >
            <option value="UNSCORED">Unscored</option>
            <option value="VALID">Valid</option>
            <option value="INVALID">Invalid</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Score (0-100, optional)
          <input
            className="min-h-10 rounded-lg border border-line bg-surface px-3"
            onChange={(e) => setScore(e.target.value)}
            type="number"
            min={0}
            max={100}
            value={score}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Notes (optional)
          <textarea
            className="min-h-20 rounded-lg border border-line bg-surface px-3 py-2"
            onChange={(e) => setNotes(e.target.value)}
            value={notes}
          />
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <button className="min-h-10 rounded-lg border border-line px-3 font-bold" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="min-h-10 rounded-lg bg-accent px-4 font-extrabold text-white disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
