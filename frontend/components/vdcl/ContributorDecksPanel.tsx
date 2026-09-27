'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Disc3, FileText, Globe, Info, Lock } from 'lucide-react';
import {
  normalizeErrorMessage,
  useGetMyVdclDecksQuery,
  usePublishVdclDeckMutation,
  type ContributorDeck,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatDuration } from '@/components/vdcl/vdcl-ui';

const cardClass = 'rounded-xl border border-line bg-surface';

/**
 * A contributor's dialect decks.
 *
 * One deck per dialect they have recorded in, derived from their signed
 * licence -- so a contributor who recorded Pidgin and later Igbo sees two.
 *
 * The distinction this panel has to communicate, because getting it wrong
 * either way misleads: signing the licence is what makes recordings available
 * to Stream, and that has already happened by the time any deck appears here.
 * Publishing a deck does not expose anything new. It groups a dialect into one
 * browsable unit so a subscriber can take the set instead of assembling it
 * clip by clip.
 *
 * Publishing is permanent, and the confirm copy says so plainly. There is no
 * unpublish, because withdrawing the licence is the lever that matters -- it
 * revokes subscribers' permission to use the data rather than removing it.
 */
export function ContributorDecksPanel({ vdclEnabled }: { vdclEnabled: boolean }) {
  // The endpoint sits behind VdclEnabledGuard, so calling it while licensing
  // is closed returns 403. Skip the request rather than render an error the
  // contributor can do nothing about.
  const { data, isLoading } = useGetMyVdclDecksQuery(undefined, { skip: !vdclEnabled });

  if (!vdclEnabled) {
    return (
      <EmptyState
        icon={<Lock className="size-5" aria-hidden="true" />}
        title="Licensing is not open yet"
        body="Your dialect decks appear here once contributor licensing opens and you have signed your licence."
      />
    );
  }

  if (isLoading) {
    return <div className={`${cardClass} p-6 text-muted`}>Loading your decks…</div>;
  }

  const decks = data?.decks ?? [];

  if (decks.length === 0) {
    return (
      <EmptyState
        icon={<Disc3 className="size-5" aria-hidden="true" />}
        title="No decks yet"
        body="Once your licence is signed and countersigned, your recordings appear here grouped by dialect — one deck for each dialect you record in."
        action={
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
            href="/dashboard/licence"
          >
            Go to My Licence
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Covered by licence <strong className="font-extrabold text-ink">{data?.licenceKey}</strong>
          {data?.version ? ` · version ${data.version}` : ''}
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {decks.map((deck) => (
          <DeckCard deck={deck} key={deck.dialectTag} />
        ))}
      </div>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        Your licensed recordings are already available to subscribers individually, found by dialect
        and never by name. Publishing a deck groups one dialect into a single collection a subscriber
        can browse as a unit. Either way, nothing identifies you as the contributor.
      </p>
    </div>
  );
}

function DeckCard({ deck }: { deck: ContributorDeck }) {
  const [publishDeck, { isLoading: isPublishing }] = usePublishVdclDeckMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const published = deck.deckId !== null;

  async function handlePublish() {
    setError('');
    try {
      await publishDeck({ dialectTag: deck.dialectTag }).unwrap();
      setConfirming(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not publish this deck.'));
    }
  }

  return (
    <article className={`${cardClass} p-5 md:p-6`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent">
          <Disc3 className="size-5" aria-hidden="true" />
        </span>
        {published ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-extrabold text-green-800">
            <Globe className="size-3" aria-hidden="true" /> Published
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-extrabold text-muted">
            Not grouped yet
          </span>
        )}
      </div>

      <h3 className="text-xl font-black">{deck.dialectName}</h3>
      <p className="mt-1 text-sm text-muted">
        {published ? `Deck ${deck.streamDeckKey}` : 'Dialect Deck'}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Stat label="Recordings" value={deck.recordingCount.toLocaleString()} />
        <Stat label="Audio" value={formatDuration(deck.totalDurationMs)} />
        <Stat
          label="With transcripts"
          value={`${deck.transcriptCount.toLocaleString()}/${deck.recordingCount.toLocaleString()}`}
        />
        <Stat
          label="Mean score"
          value={deck.meanCompositeScore === null ? '—' : deck.meanCompositeScore.toFixed(2)}
        />
      </dl>

      {deck.uncoveredCount > 0 ? (
        <p className="mt-5 flex gap-2 rounded-lg bg-surface-muted p-3 text-sm leading-relaxed text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {deck.uncoveredCount.toLocaleString()} newer{' '}
            {deck.uncoveredCount === 1 ? 'recording is' : 'recordings are'} not yet licensed. Sign a
            new licence version to include {deck.uncoveredCount === 1 ? 'it' : 'them'}.
          </span>
        </p>
      ) : null}

      {published ? (
        <p className="mt-5 text-sm leading-relaxed text-muted">
          Subscribers can browse this deck as one collection. Your name is not attached to it.
        </p>
      ) : confirming ? (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-start gap-2 font-extrabold text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Publishing cannot be undone
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-900">
            Your {deck.dialectName} recordings are already licensed and available to subscribers.
            This groups them into one deck that can be browsed as a collection, and that grouping is
            permanent. If you later withdraw your licence, subscribers lose permission to use the
            data — the deck itself stays.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
              onClick={handlePublish}
              pending={isPublishing}
              type="button"
            >
              <Globe className="size-4" aria-hidden="true" />
              Publish {deck.dialectName} deck
            </ActionButton>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-4 font-extrabold hover:border-accent"
              onClick={() => setConfirming(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 font-extrabold hover:border-accent"
          onClick={() => setConfirming(true)}
          type="button"
        >
          <Globe className="size-4" aria-hidden="true" />
          Publish as a deck
        </button>
      )}

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>
      ) : null}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-black">{value}</dd>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${cardClass} grid place-items-center gap-3 p-10 text-center`}>
      <span className="grid size-11 place-items-center rounded-lg bg-surface-muted text-muted">
        {icon}
      </span>
      <h3 className="text-lg font-black">{title}</h3>
      <p className="max-w-md leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}
