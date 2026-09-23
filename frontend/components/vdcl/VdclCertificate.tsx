'use client';

import { useState } from 'react';
import { AlertCircle, BadgeCheck, FileText, Image as ImageIcon, QrCode } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { alertTone, secondaryButton } from '@/components/vdcl/vdcl-ui';
import {
  normalizeErrorMessage,
  useLazyGetVdclDocumentLinkQuery,
  type VdclVersionSummary,
} from '@/store/api';

/**
 * The finished licence.
 *
 * Only rendered for a licence that is ACTIVE and carries both signatures
 * -- the caller checks that, because the documents are issued at
 * countersignature and simply do not exist before it.
 *
 * The confirmation and the downloads are one card rather than a banner
 * above a separate panel. Someone who has just been told their licence is
 * active is looking for the document; putting it two cards further down
 * was an invented step.
 *
 * Links are fetched on demand, never rendered into the page: the presigned
 * URL is short-lived, so a baked-in link works on load and silently fails
 * when clicked ten minutes later.
 */
export function VdclCertificate({ licence }: { licence: VdclVersionSummary }) {
  const [fetchLink] = useLazyGetVdclDocumentLinkQuery();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);

  async function open(kind: 'pdf' | 'png') {
    setError(null);
    setBusy(kind);
    try {
      const result = await fetchLink({ id: licence.versionId, kind }).unwrap();
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(
        normalizeErrorMessage(err, 'Could not open that document. It may not have been issued yet.'),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-accent/30 bg-accent-soft"
      id="vdcl-certificate"
    >
      <div className="p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-black text-accent">
          <BadgeCheck className="size-5" aria-hidden="true" />
          Your licence is active
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          <span className="font-mono font-bold text-ink">{licence.licenceKey}</span> covers{' '}
          {licence.recordingCount ?? 0} recordings
          {licence.countersignedAt
            ? `, countersigned ${new Date(licence.countersignedAt).toLocaleDateString()}`
            : ''}
          .
        </p>

        {error ? (
          <p
            className={`mt-3 flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.danger}`}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2.5">
          <ActionButton
            className={secondaryButton}
            disabled={busy !== null}
            onClick={() => open('pdf')}
            pending={busy === 'pdf'}
            pendingLabel="Opening..."
          >
            <span className="inline-flex items-center gap-2">
              <FileText className="size-4" aria-hidden="true" />
              Signed licence (PDF)
            </span>
          </ActionButton>
          <ActionButton
            className={secondaryButton}
            disabled={busy !== null}
            onClick={() => open('png')}
            pending={busy === 'png'}
            pendingLabel="Opening..."
          >
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="size-4" aria-hidden="true" />
              Certificate (PNG)
            </span>
          </ActionButton>
        </div>

        <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-muted">
          <QrCode className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            The certificate is a shareable summary carrying a QR code anyone can scan to confirm the
            licence is genuine. Scanning it shows the licence status and dataset size —{' '}
            <strong className="font-bold text-ink">never your name</strong>.
          </span>
        </p>
      </div>
    </section>
  );
}
