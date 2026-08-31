import type { QualityTier } from '@/store/api';

const TIER_STYLE: Record<QualityTier, string> = {
  standard: 'bg-surface-muted text-muted',
  high: 'bg-accent-soft text-accent-dark',
  premium_verified: 'bg-success/10 text-success',
};

const TIER_LABEL: Record<QualityTier, string> = {
  standard: 'Standard',
  high: 'High Confidence',
  premium_verified: 'Premium Verified',
};

export function QualityTierBadge({ tier }: { tier: QualityTier }) {
  if (tier === 'standard') return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${TIER_STYLE[tier]}`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
