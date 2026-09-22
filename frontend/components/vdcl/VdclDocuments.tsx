'use client';

import { useState } from 'react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
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
    <div className={`${cardClass} space-y-3`}>
      <div>
        <h2 className="text-base font-bold text-ink">Your licence documents</h2>
        <p className="text-sm text-muted">
          Issued once Dialect Library countersigns. Only you and Dialect Library can download
          them.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={() => open('pdf')} disabled={busy !== null}>
          {busy === 'pdf' ? 'Opening...' : 'Signed licence (PDF)'}
        </ActionButton>
        <ActionButton onClick={() => open('png')} disabled={busy !== null}>
          {busy === 'png' ? 'Opening...' : 'Certificate (PNG)'}
        </ActionButton>
      </div>

      <p className="text-xs text-muted">
        The certificate is a shareable summary and carries a QR code anyone can scan to confirm
        the licence is genuine. Scanning it shows the licence status and dataset size — never your
        name.
      </p>
    </div>
  );
}
