/**
 * Local copy of services/api/src/words/phrase-tiers.const.ts's PHRASE_TIERS
 * array -- word-generator-job is a separate deployable with no
 * shared-constants package to the api service (only @dialectiva/db is
 * shared), so this is duplicated by hand. Keep the two arrays in sync
 * manually on any tier-number change; api's copy is the source of truth
 * (it drives assignment), this one only drives pool pre-population.
 */
export interface PhraseTier {
  threshold: number;
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
