'use client';

import Link from 'next/link';
import { Disc3, FileText, Info, Lock } from 'lucide-react';
import { useGetMyVdclDecksQuery } from '@/store/api';
import { formatDuration } from '@/components/vdcl/vdcl-ui';

const cardClass = 'rounded-xl border border-line bg-surface';

/**
 * A contributor's Stream Decks.
 *
 * One deck per dialect they have recorded in, derived from their signed
 * licence -- so a contributor who recorded Pidgin and later Igbo sees two.
 *
 * Every deck is PRIVATE and this panel is read-only. Publishing is not a
 * visibility toggle here: a contributor's deck is covered by exactly one
 * agreement, so a subscriber browsing it would learn that every recording in
 * it came from one person. Publishing pools a contributor's recordings into
 * a multi-contributor dialect deck instead, which is separate work -- until
 * it exists, promising a publish button here would promise the wrong thing.
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
        body="Your Stream Decks appear here once contributor licensing opens and you have signed your licence."
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
        body="Your recordings become Stream Decks — one for each dialect you record in — once your licence is signed and countersigned."
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
          <article className={`${cardClass} p-5 md:p-6`} key={deck.dialectTag}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent">
                <Disc3 className="size-5" aria-hidden="true" />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-extrabold text-muted">
                <Lock className="size-3" aria-hidden="true" /> Private
              </span>
            </div>

            <h3 className="text-xl font-black">{deck.dialectName}</h3>
            <p className="mt-1 text-sm text-muted">Dialect Deck</p>

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
                  {deck.uncoveredCount === 1 ? 'recording is' : 'recordings are'} not yet licensed.
                  Sign a new licence version to include{' '}
                  {deck.uncoveredCount === 1 ? 'it' : 'them'}.
                </span>
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        Your decks are private. Publishing to Stream is not available yet — when it opens, your
        recordings join a shared dialect dataset rather than being listed under your own name, so
        subscribers can never trace a deck back to you.
      </p>
    </div>
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
