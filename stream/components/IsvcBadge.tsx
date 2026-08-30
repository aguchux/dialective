import type { IsvcConfidence } from '@/store/api';

const CONFIDENCE_STYLE: Record<IsvcConfidence, string> = {
  EMERGING: 'bg-surface-muted text-muted',
  ESTABLISHED: 'bg-accent-soft text-accent-dark',
  HIGH: 'bg-accent-soft text-accent-dark',
  VERY_HIGH: 'bg-success/10 text-success',
};

export function IsvcBadge({
  isvs,
  confidence,
  organizationCount,
}: {
  isvs: string | null;
  confidence: IsvcConfidence | null;
  organizationCount: number | null;
}) {
  if (isvs === null || confidence === null) {
    return <span className="text-xs text-muted">No independent validation yet</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${CONFIDENCE_STYLE[confidence]}`}
    >
      ISVS {isvs} · {confidence.replace('_', ' ')} · {organizationCount} orgs
    </span>
  );
}
