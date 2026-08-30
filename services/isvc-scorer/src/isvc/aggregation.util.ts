import { IsvcConfidence } from '@dialectiva/db';

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stdDev(values: number[], meanValue: number): number {
  if (values.length === 0) return 0;
  const variance = mean(values.map((v) => (v - meanValue) ** 2));
  return Math.sqrt(variance);
}

/**
 * Coefficient-of-variation-based, so agreement is scale-invariant --
 * disagreement among orgs scoring around 40 reduces agreement the same way
 * disagreement among orgs scoring around 90 does (product plan section 20:
 * "high disagreement should reduce confidence even where the average score
 * remains high"). meanValue is floored at 1 to avoid a divide-by-zero blow-up
 * when every org somehow scored 0.
 */
export function computeAgreement(orgScores: number[], meanValue: number): number {
  const cv = stdDev(orgScores, meanValue) / Math.max(meanValue, 1);
  return Math.max(0, 100 - Math.min(100, cv * 100));
}

/**
 * Same ">2 stddev from the cluster mean" rule as consensus-scorer's
 * isOutlier (services/consensus-scorer/src/consensus/consensus.service.ts) --
 * flagged for visibility, never excluded from the mean (this repo's
 * established "flag for QA, never silently drop" posture; also directly
 * matches the product plan section 19's outlier-ratio-as-confidence-input,
 * not an exclusion rule).
 */
export function countOutliers(orgScores: number[], meanValue: number, stdDevValue: number): number {
  if (stdDevValue <= 0) return 0;
  return orgScores.filter((score) => Math.abs(score - meanValue) > 2 * stdDevValue).length;
}

/**
 * Confidence bucket from (organization count, agreement). Directly
 * implements product plan section 19's invariant: "a score of 97 from one
 * organization should not be treated as stronger evidence than a score of
 * 94 from 20 organizations with very high agreement" -- high org count
 * alone isn't enough for VERY_HIGH/HIGH if agreement is too low; the tier
 * falls back one level rather than granting confidence the evidence
 * doesn't support.
 */
export function computeConfidence(organizationCount: number, agreement: number): IsvcConfidence {
  if (organizationCount < 3) return IsvcConfidence.EMERGING;
  if (organizationCount < 5) return IsvcConfidence.ESTABLISHED;
  if (organizationCount < 10) {
    return agreement >= 80 ? IsvcConfidence.HIGH : IsvcConfidence.ESTABLISHED;
  }
  return agreement >= 85 ? IsvcConfidence.VERY_HIGH : IsvcConfidence.ESTABLISHED;
}
