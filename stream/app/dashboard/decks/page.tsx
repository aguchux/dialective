'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus } from 'lucide-react';
import { useCreateStreamDeckMutation, useListStreamDecksQuery } from '@/store/api';
import { Card, ErrorText, FieldLabel, PageHeading, PrimaryButton, TextInput } from '@/components/ui';

export default function StreamDecksPage() {
  const { data: decks, isLoading } = useListStreamDecksQuery();
  const [createDeck, { isLoading: creating }] = useCreateStreamDeckMutation();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createDeck({ name }).unwrap();
      setName('');
      setShowForm(false);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to create this Stream Deck.');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          subtitle="Private, curated collections of voice recordings ready to stream."
          title="Stream Decks"
        />
        <PrimaryButton onClick={() => setShowForm((s) => !s)} type="button">
          <Plus aria-hidden="true" className="size-4" />
          New deck
        </PrimaryButton>
      </div>

      {showForm && (
        <Card className="mb-6 p-5">
          <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
            <div className="flex-1">
              <FieldLabel>Deck name</FieldLabel>
              <TextInput onChange={(e) => setName(e.target.value)} required value={name} />
            </div>
            <PrimaryButton disabled={creating} type="submit">
              {creating ? 'Creating...' : 'Create'}
            </PrimaryButton>
          </form>
          {error && <div className="mt-3">{<ErrorText>{error}</ErrorText>}</div>}
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : decks && decks.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {decks.map((deck) => (
            <Link href={`/dashboard/decks/${deck.id}`} key={deck.id}>
              <Card className="p-5 transition-shadow hover:shadow-md">
                <Layers aria-hidden="true" className="mb-2 size-5 text-accent" />
                <p className="font-bold text-ink">{deck.name}</p>
                <p className="mt-1 text-xs text-muted">{deck.deckKey}</p>
                <p className="mt-2 text-sm text-muted">{deck._count?.items ?? 0} recordings</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            You haven&apos;t created a Stream Deck yet. Create one, then add recordings from
            Explore Voice Data.
          </p>
        </Card>
      )}
    </div>
  );
}
