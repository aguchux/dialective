'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus } from 'lucide-react';
import { cardClass, EmptyPanel, formatDate } from '@/components/dashboard/shared';
import {
  normalizeErrorMessage,
  useCreateValidatorDeckMutation,
  useGetDialectVariantsQuery,
  useGetMyValidatorDialectsQuery,
  useGetValidatorDecksQuery,
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

export function StreamDecksView() {
  const [filter, setFilter] = useState<'mine' | 'all'>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const { data: decks, isLoading } = useGetValidatorDecksQuery({ filter });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-surface p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-bold ${filter === 'mine' ? 'bg-accent text-white' : 'text-muted'}`}
            onClick={() => setFilter('mine')}
            type="button"
          >
            My decks
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-bold ${filter === 'all' ? 'bg-accent text-white' : 'text-muted'}`}
            onClick={() => setFilter('all')}
            type="button"
          >
            All validators
          </button>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-extrabold text-white"
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          <Plus className="size-4" aria-hidden="true" />
          New deck
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div className="h-28 animate-pulse rounded-lg bg-surface-muted" key={i} />
          ))}
        </div>
      ) : decks && decks.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <Link
              className={`${cardClass} block p-4 hover:border-accent`}
              href={`/validator/decks/${deck.id}`}
              key={deck.id}
            >
              <p className="truncate font-black">{deck.name}</p>
              <p className="mt-1 text-xs font-bold text-muted">
                {STATUS_LABELS[deck.status] ?? deck.status}
              </p>
              <p className="mt-3 text-sm text-muted">
                {deck._count.items} recording{deck._count.items === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs text-muted">Updated {formatDate(deck.updatedAt)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyPanel
          icon={Layers}
          title={filter === 'mine' ? "You haven't created a deck yet" : 'No decks yet'}
          actionLabel={filter === 'mine' ? 'Create your first deck' : undefined}
        />
      )}

      {createOpen && <CreateDeckDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

const selectClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink dark:bg-surface-muted';
const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink dark:bg-surface-muted';

function CreateDeckDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [dialectId, setDialectId] = useState('');
  const [dialectVariantId, setDialectVariantId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: myDialects, isLoading: isLoadingDialects } = useGetMyValidatorDialectsQuery();
  const { data: dialectVariants } = useGetDialectVariantsQuery(dialectId, { skip: !dialectId });
  const [createDeck, { isLoading, error }] = useCreateValidatorDeckMutation();

  const selectedDialect = myDialects?.find((d) => d.dialectId === dialectId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !selectedDialect) {
      setFormError('Enter a name and choose a dialect to continue.');
      return;
    }
    try {
      await createDeck({
        name: name.trim(),
        countryId: selectedDialect.countryId,
        dialectId: selectedDialect.dialectId,
        dialectVariantId: dialectVariantId || undefined,
      }).unwrap();
      onClose();
    } catch (err) {
      setFormError(normalizeErrorMessage(err, 'Unable to create the deck.'));
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form
        className={`${cardClass} grid w-full max-w-sm gap-3 p-5`}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h2 className="text-lg font-black">New Stream Deck</h2>
        <label className="grid gap-1 text-sm font-bold">
          Name
          <input
            className={inputClass}
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Dialect
          <select
            className={selectClass}
            disabled={isLoadingDialects}
            onChange={(e) => {
              setDialectId(e.target.value);
              setDialectVariantId('');
            }}
            required
            value={dialectId}
          >
            <option value="">
              {isLoadingDialects ? 'Loading…' : 'Select a dialect'}
            </option>
            {myDialects?.map((d) => (
              <option key={d.dialectId} value={d.dialectId}>
                {d.dialectName} ({d.countryName})
              </option>
            ))}
          </select>
          {!isLoadingDialects && myDialects?.length === 0 && (
            <span className="text-xs font-medium text-muted">
              You are not yet onboarded to any dialect &mdash; ask an admin to assign one.
            </span>
          )}
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Sub-dialect (optional)
          <select
            className={selectClass}
            disabled={!dialectId || !dialectVariants?.length}
            onChange={(e) => setDialectVariantId(e.target.value)}
            value={dialectVariantId}
          >
            <option value="">None</option>
            {dialectVariants?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {(formError || Boolean(error)) && (
          <p className="text-sm font-bold text-red-600">
            {formError ?? 'Unable to create the deck.'}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button
            className="min-h-10 rounded-lg border border-line px-3 font-bold"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-lg bg-accent px-4 font-extrabold text-white disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
