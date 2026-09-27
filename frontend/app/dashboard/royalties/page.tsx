'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { VdclPageShell } from '@/components/vdcl/VdclPageShell';
import { RoyaltiesPanel } from '@/components/vdcl/RoyaltiesPanel';

/**
 * A contributor's Stream revenue-sharing screen.
 *
 * Reuses VdclPageShell, which is the right gate as well as the right chrome:
 * royalties only ever accrue on recordings covered by a signed licence, so a
 * contributor who cannot reach the licence flow has nothing to see here either.
 * The panel gates again on `royaltiesEnabled` from its own authenticated read --
 * two different switches, checked where each belongs.
 */
export default function RoyaltiesPage() {
  return (
    <VdclPageShell>
      <div className="mb-5">
        <Link
          href="/dashboard/licence"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Your licence
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-ink md:text-2xl">Stream royalties</h1>
        <p className="mt-1 text-sm text-muted">
          What your licensed recordings have earned from subscribers streaming them.
        </p>
      </div>
      <RoyaltiesPanel />
    </VdclPageShell>
  );
}
