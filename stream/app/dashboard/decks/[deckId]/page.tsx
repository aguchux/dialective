'use client';

import { useParams, useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import {
  useDeleteStreamDeckMutation,
  useGetStreamDeckQuery,
  useRemoveStreamDeckItemMutation,
} from '@/store/api';
import { Card, PageHeading, SecondaryButton } from '@/components/ui';

export default function StreamDeckDetailPage() {
  const params = useParams<{ deckId: string }>();
  const router = useRouter();
  const { data: deck, isLoading } = useGetStreamDeckQuery(params.deckId);
  const [removeItem] = useRemoveStreamDeckItemMutation();
  const [deleteDeck, { isLoading: deleting }] = useDeleteStreamDeckMutation();

  if (isLoading || !deck) {
    return <p className="text-sm text-muted">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading subtitle={deck.deckKey} title={deck.name} />
        <SecondaryButton
          disabled={deleting}
          onClick={async () => {
            await deleteDeck(deck.id).unwrap();
            router.push('/dashboard/decks');
          }}
          type="button"
        >
          Delete deck
        </SecondaryButton>
      </div>

      <Card>
        {deck.items && deck.items.length > 0 ? (
          <div className="divide-y divide-line">
            {deck.items.map((item) => (
              <div className="flex items-center justify-between gap-3 p-4" key={item.id}>
                <div>
                  <p className="font-mono text-sm text-ink">{item.recordingId}</p>
                  <p className="text-xs text-muted">
                    Added {new Date(item.addedAt).toLocaleDateString()}
                  </p>
                </div>
                <SecondaryButton
                  onClick={() => void removeItem({ deckId: deck.id, itemId: item.id })}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Remove
                </SecondaryButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">
            No recordings yet. Add some from Explore Voice Data.
          </p>
        )}
      </Card>
    </div>
  );
}
