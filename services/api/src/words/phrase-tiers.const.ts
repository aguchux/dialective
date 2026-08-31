/**
 * Lifetime WordRecording-count thresholds -> target phrase word-count
 * range for PHRASE_TO_DIALECT escalation (see WordsService.getTrainerPhraseTier).
 * Tier boundaries are PROPOSED, pending final product-owner sign-off --
 * only the shape (threshold, wordCountMin, wordCountMax) is confirmed
 * design, not these exact numbers.
 *
 * Ordered ascending by threshold; a trainer whose lifetime count is below
 * PHRASE_TIERS[0].threshold has no tier (getPhraseTier returns null) and
 * nextAssignment's existing single-word ENGLISH_TO_DIALECT path is
 * unchanged for them.
 */
export interface PhraseTier {
  threshold: number; // lifetime WordRecording count >= this to qualify
  wordCountMin: number;
  wordCountMax: number;
}

export const PHRASE_TIERS: PhraseTier[] = [
  { threshold: 100, wordCountMin: 2, wordCountMax: 3 },
  { threshold: 200, wordCountMin: 3, wordCountMax: 5 },
  { threshold: 400, wordCountMin: 5, wordCountMax: 8 },
  { threshold: 600, wordCountMin: 8, wordCountMax: 12 },
  { threshold: 1000, wordCountMin: 12, wordCountMax: 15 },
];

/** Highest tier whose threshold the count meets, or null if count is below every tier's threshold. */
export function getPhraseTier(count: number): PhraseTier | null {
  let match: PhraseTier | null = null;
  for (const tier of PHRASE_TIERS) {
    if (count >= tier.threshold) match = tier;
  }
  return match;
}
