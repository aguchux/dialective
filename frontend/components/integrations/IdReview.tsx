'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ArrowLeft, LoaderCircle, ScanFace, ShieldCheck } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass, formatDateTime } from '@/components/dashboard/shared';
import { DocumentMagnifier } from '@/components/integrations/DocumentMagnifier';
import {
  PeerReviewSubject,
  normalizeErrorMessage,
  useClaimPeerReviewMutation,
  useLazyGetPeerReviewEvidenceImageQuery,
  useListMyPeerReviewsQuery,
  useListPeerReviewQueueQuery,
  useReleasePeerReviewMutation,
  useSubmitPeerReviewMutation,
} from '@/store/api';

/**
 * ID Review -- the reviewer's side of the p2p-kyc-review integration.
 *
 * Two tabs: documents waiting to be checked, and this reviewer's own
 * history. Claiming one opens it under a magnifier; the reviewer confirms
 * the name matches the account, types the number they can read, and
 * approves or declines. Two agreeing verdicts send it to an admin, who
 * makes the actual decision.
 *
 * A CERTIFIED reviewer is the platform's own trained staff: they see the
 * document plainly rather than through the magnifier, and their single
 * verdict settles the verification with no second reviewer and no admin
 * step. The copy changes to say so, because someone whose click is final
 * should know that before they click.
 */
export function IdReview() {
  const pathname = usePathname();
  const basePath = pathname?.startsWith('/distributor')
    ? '/distributor/integrations'
    : '/dashboard/integrations';
  const [tab, setTab] = useState<'queue' | 'mine'>('queue');
  const [subject, setSubject] = useState<PeerReviewSubject | null>(null);
  const [error, setError] = useState('');

  const { data: queue, isLoading, refetch } = useListPeerReviewQueueQuery({ pageSize: 20 });
  const [claim, { isLoading: claiming }] = useClaimPeerReviewMutation();
  const [release] = useReleasePeerReviewMutation();

  async function open(id: string) {
    setError('');
    try {
      setSubject(await claim(id).unwrap());
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not open that document'));
      void refetch();
    }
  }

  async function close() {
    if (subject) await release(subject.id).unwrap().catch(() => undefined);
    setSubject(null);
    void refetch();
  }

  if (subject) {
    return <ReviewOne subject={subject} onDone={() => void close()} />;
  }

  return (
    <div>
      <Link
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-extrabold text-muted hover:text-ink"
        href={basePath}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to integrations
      </Link>

      <h1 className="mt-3 flex items-center gap-2 text-2xl font-black tracking-normal md:text-3xl">
        <ScanFace className="size-7 text-accent" aria-hidden="true" /> ID Review
      </h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Check that the name on a member&rsquo;s ID matches their account. Two reviewers who agree
        send it to an admin, who makes the final decision. Certified reviewers decide on their
        own.
      </p>

      <div className="mb-4 flex gap-2">
        {(['queue', 'mine'] as const).map((value) => (
          <button
            className={`min-h-10 rounded-lg px-4 text-sm font-extrabold ${
              tab === value ? 'bg-accent text-white' : 'border border-line hover:bg-surface-muted'
            }`}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {value === 'queue' ? 'Waiting for review' : 'My reviews'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {tab === 'mine' ? (
        <MyReviews />
      ) : isLoading ? (
        <div className="grid place-items-center gap-3 py-16 text-center">
          <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
          <p className="font-bold text-muted">Loading the queue...</p>
        </div>
      ) : !queue || queue.items.length === 0 ? (
        <div className={`${cardClass} p-6 text-center`}>
          <p className="font-black">Nothing waiting right now.</p>
          <p className="mt-1 text-sm text-muted">Check back later — new documents arrive daily.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {queue.items.map((item) => (
            <div className={`${cardClass} flex flex-wrap items-center gap-3 p-4`} key={item.id}>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{item.accountName || 'Unnamed account'}</p>
                <p className="text-xs text-muted">
                  {item.documentType ?? 'ID document'} · submitted{' '}
                  {formatDateTime(item.submittedAt)}
                  {item.reviewsSoFar > 0 && ` · ${item.reviewsSoFar} review so far`}
                </p>
              </div>
              <ActionButton
                className="min-h-10 rounded-lg bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-50"
                onClick={() => void open(item.id)}
                pending={claiming}
                pendingLabel="Opening"
                type="button"
              >
                Review
              </ActionButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One document, under the magnifier, with the verdict form. */
function ReviewOne({ subject, onDone }: { subject: PeerReviewSubject; onDone: () => void }) {
  const [fetchImage, { data: imageUrl, isFetching }] = useLazyGetPeerReviewEvidenceImageQuery();
  const [submit, { isLoading: submitting }] = useSubmitPeerReviewMutation();
  const [evidenceIndex, setEvidenceIndex] = useState(0);
  const [documentNumber, setDocumentNumber] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const evidence = subject.evidence[evidenceIndex];

  useEffect(() => {
    if (!evidence) return;
    void fetchImage({ verificationId: subject.id, evidenceId: evidence.id });
  }, [evidence, fetchImage, subject.id]);

  // Blob URLs leak unless revoked when the image changes or the page goes.
  useEffect(() => {
    if (previousUrlRef.current && previousUrlRef.current !== imageUrl) {
      URL.revokeObjectURL(previousUrlRef.current);
    }
    previousUrlRef.current = imageUrl ?? null;
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
    };
  }, [imageUrl]);

  async function send(verdict: 'APPROVE' | 'DECLINE') {
    setError('');
    if (!documentNumber.trim()) {
      setError('Type the document number you can read on the card.');
      return;
    }
    if (verdict === 'DECLINE' && !declineReason.trim()) {
      setError('Say why you are declining.');
      return;
    }
    try {
      const tally = await submit({
        id: subject.id,
        verdict,
        documentNumber: documentNumber.trim(),
        declineReason: verdict === 'DECLINE' ? declineReason.trim() : undefined,
      }).unwrap();
      setDone(
        tally.decidedByCertifiedReviewer
          ? verdict === 'APPROVE'
            ? 'Approved. This member’s KYC is now verified.'
            : 'Declined. The member has been notified.'
          : tally.readyForAdmin
            ? 'Thanks — this document now has enough reviews and is with an admin.'
            : 'Thanks — another reviewer will look at this one too.',
      );
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not submit your review'));
    }
  }

  if (done) {
    return (
      <div className={`${cardClass} grid gap-4 p-6 text-center`}>
        <ShieldCheck className="mx-auto size-10 text-emerald-700" aria-hidden="true" />
        <p className="font-black">{done}</p>
        <div>
          <button
            className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white"
            onClick={onDone}
            type="button"
          >
            Review another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <button
        className="inline-flex min-h-10 w-fit items-center gap-1.5 text-sm font-extrabold text-muted hover:text-ink"
        onClick={onDone}
        type="button"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Put this back in the queue
      </button>

      <div className={`${cardClass} grid gap-4 p-5`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Name on account</p>
          <p className="text-xl font-black">{subject.accountName || '—'}</p>
          <p className="mt-1 text-sm text-muted">
            At least two of these names must appear on the document.
          </p>
        </div>

        {subject.evidence.length > 1 && (
          <div className="flex gap-2">
            {subject.evidence.map((item, index) => (
              <button
                className={`min-h-9 rounded-lg px-3 text-sm font-extrabold ${
                  index === evidenceIndex
                    ? 'bg-accent text-white'
                    : 'border border-line hover:bg-surface-muted'
                }`}
                key={item.id}
                onClick={() => setEvidenceIndex(index)}
                type="button"
              >
                {item.kind === 'DOCUMENT_BACK' ? 'Back' : 'Front'}
              </button>
            ))}
          </div>
        )}

        {isFetching && !imageUrl ? (
          <div className="grid place-items-center gap-2 py-12">
            <LoaderCircle className="size-7 animate-spin text-accent" aria-hidden="true" />
            <p className="text-sm font-bold text-muted">Loading the document...</p>
          </div>
        ) : imageUrl ? (
          subject.certifiedReviewer ? (
            /* Certified reviewers are trained staff making the actual
               decision, so they see the document as captured. The blur
               that de-identifies it for a community reviewer would hide
               the detail that decision depends on. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Identity document under review"
              className="w-full rounded-lg border border-line"
              src={imageUrl}
            />
          ) : (
            <DocumentMagnifier alt="Identity document under review" src={imageUrl} />
          )
        ) : (
          <p className="text-sm text-muted">This document could not be loaded.</p>
        )}

        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
          This is someone&rsquo;s identity document. Every time you open one it is recorded against
          your account. Do not photograph, copy or share it.
          {subject.certifiedReviewer && (
            <>
              {' '}
              You are a certified reviewer: your decision is final and takes effect immediately,
              with no second reviewer and no admin check.
            </>
          )}
        </p>

        <label className="grid gap-1.5 text-sm font-bold">
          Document number, exactly as printed
          <input
            className="min-h-11 rounded-lg border border-line bg-bg px-3 font-mono"
            maxLength={64}
            onChange={(e) => setDocumentNumber(e.target.value)}
            placeholder="Read it under the magnifier"
            value={documentNumber}
          />
        </label>

        {declining && (
          <label className="grid gap-1.5 text-sm font-bold">
            What is wrong with it?
            <textarea
              autoFocus
              className="min-h-20 rounded-lg border border-line bg-bg p-2 text-sm"
              maxLength={500}
              onChange={(e) => setDeclineReason(e.target.value)}
              value={declineReason}
            />
          </label>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!declining && (
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white disabled:opacity-50"
              onClick={() => void send('APPROVE')}
              pending={submitting}
              pendingLabel="Submitting"
              type="button"
            >
              {subject.certifiedReviewer ? 'Approve this KYC' : 'Name matches — approve'}
            </ActionButton>
          )}
          <ActionButton
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 px-5 font-extrabold text-red-700 hover:bg-red-50 disabled:opacity-50"
            onClick={() => (declining ? void send('DECLINE') : setDeclining(true))}
            pending={submitting && declining}
            pendingLabel="Submitting"
            type="button"
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
            {declining ? 'Submit decline' : 'Decline'}
          </ActionButton>
          {declining && (
            <button
              className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted"
              onClick={() => {
                setDeclining(false);
                setDeclineReason('');
                setError('');
              }}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MyReviews() {
  const { data, isLoading } = useListMyPeerReviewsQuery({ pageSize: 20 });

  if (isLoading) return <p className="text-sm font-bold text-muted">Loading your reviews...</p>;
  if (!data || data.items.length === 0) {
    return (
      <div className={`${cardClass} p-6 text-center`}>
        <p className="font-black">You haven&rsquo;t reviewed anything yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {data.items.map((review) => (
        <div className={`${cardClass} flex flex-wrap items-center gap-3 p-4`} key={review.id}>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              You {review.verdict === 'APPROVE' ? 'approved' : 'declined'} a document
            </p>
            <p className="text-xs text-muted">{formatDateTime(review.createdAt)}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-black ${
              review.paidAt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {review.paidAt ? 'Paid' : 'Awaiting admin'}
          </span>
        </div>
      ))}
    </div>
  );
}
