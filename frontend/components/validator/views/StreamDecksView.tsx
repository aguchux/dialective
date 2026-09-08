'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus } from 'lucide-react';
import { cardClass, EmptyPanel, formatDate } from '@/components/dashboard/shared';
import { useCreateValidatorDeckMutation, useGetValidatorDecksQuery } from '@/store/api';

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

function CreateDeckDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [dialectTag, setDialectTag] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [createDeck, { isLoading, error }] = useCreateValidatorDeckMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createDeck({
      name: name.trim(),
      dialectTag: dialectTag.trim() || undefined,
      countryCode: countryCode.trim() || undefined,
    }).unwrap();
    onClose();
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
            className="min-h-10 rounded-lg border border-line bg-surface px-3"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Dialect (optional)
          <input
            className="min-h-10 rounded-lg border border-line bg-surface px-3"
            onChange={(e) => setDialectTag(e.target.value)}
            value={dialectTag}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Country (optional)
          <input
            className="min-h-10 rounded-lg border border-line bg-surface px-3"
            onChange={(e) => setCountryCode(e.target.value)}
            value={countryCode}
          />
        </label>
        {Boolean(error) && <p className="text-sm font-bold text-red-600">Unable to create the deck.</p>}
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
