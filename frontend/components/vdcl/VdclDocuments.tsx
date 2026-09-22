'use client';

import { useState } from 'react';
import { AlertCircle, FileText, Image as ImageIcon, QrCode } from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { alertTone, secondaryButton } from '@/components/vdcl/vdcl-ui';
import { normalizeErrorMessage, useLazyGetVdclDocumentLinkQuery } from '@/store/api';

/**
 * Licence document downloads.
 *
 * Links are fetched on demand rather than rendered into the page, because
 * the presigned URL is short-lived: baking one into the markup would give
 * a link that works when the page loads and silently 404s when someone
 * clicks it ten minutes later.
 */
export function VdclDocuments({ versionId }: { versionId: string }) {
  const [fetchLink] = useLazyGetVdclDocumentLinkQuery();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);

  async function open(kind: 'pdf' | 'png') {
    setError(null);
    setBusy(kind);
    try {
      const result = await fetchLink({ id: versionId, kind }).unwrap();
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          'Could not open that document. It may not have been issued yet.',
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${cardClass} p-5`}>
      <h2 className="text-lg font-black text-ink">Your licence documents</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Issued once Dialect Library countersigns. Only you and Dialect Library can download them.
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
          onClick={() => open('pdf')}
          disabled={busy !== null}
          pending={busy === 'pdf'}
          pendingLabel="Opening..."
          className={secondaryButton}
        >
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4" aria-hidden="true" />
            Signed licence (PDF)
          </span>
        </ActionButton>
        <ActionButton
          onClick={() => open('png')}
          disabled={busy !== null}
          pending={busy === 'png'}
          pendingLabel="Opening..."
          className={secondaryButton}
        >
          <span className="inline-flex items-center gap-2">
            <ImageIcon className="size-4" aria-hidden="true" />
            Certificate (PNG)
          </span>
        </ActionButton>
      </div>

      <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface-muted px-3.5 py-3 text-sm leading-relaxed text-muted">
        <QrCode className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <span>
          The certificate is a shareable summary carrying a QR code anyone can scan to confirm the
          licence is genuine. Scanning it shows the licence status and dataset size —{' '}
          <strong className="font-bold text-ink">never your name</strong>.
        </span>
      </p>
    </section>
  );
}
