import { Prisma } from '@dialectiva/db';
import { computeCompositeScore, QualityWeights } from './settlement.service';

const decimal = (value: number) => new Prisma.Decimal(value);

const evenWeights: QualityWeights = { consensus: 25, noise: 25, quality: 25, liveness: 25 };
const defaultRange = { min: 10, max: 30 };
const wideRange = { min: 0, max: 100 };

describe('computeCompositeScore', () => {
  it('blends all four signals via a weighted average', () => {
    const result = computeCompositeScore(decimal(100), decimal(100), decimal(100), decimal(0), evenWeights, wideRange);
    // (100*25 + 100*25 + 100*25 + 0*25) / 100 = 75
    expect(result).toBeCloseTo(75, 5);
  });

  it('weights consensus/exact-match score most heavily under default 60/15/10/15 weights', () => {
    const weights: QualityWeights = { consensus: 60, noise: 15, quality: 10, liveness: 15 };
    const result = computeCompositeScore(decimal(100), decimal(0), decimal(0), decimal(0), weights, wideRange);
    expect(result).toBeCloseTo(60, 5);
  });

  it('clamps a high blended score down to maxScoreRange', () => {
    const result = computeCompositeScore(decimal(100), decimal(100), decimal(100), decimal(100), evenWeights, defaultRange);
    expect(result).toBe(defaultRange.max);
  });

  it('clamps a low blended score up to minScoreRange', () => {
    const result = computeCompositeScore(decimal(0), decimal(0), decimal(0), decimal(0), evenWeights, defaultRange);
    expect(result).toBe(defaultRange.min);
  });

  it('never randomizes -- calling twice with identical inputs returns identical output', () => {
    const a = computeCompositeScore(decimal(72), decimal(88), decimal(64), decimal(91), evenWeights, wideRange);
    const b = computeCompositeScore(decimal(72), decimal(88), decimal(64), decimal(91), evenWeights, wideRange);
    expect(a).toBe(b);
  });

  it('falls back to neutral 100 for null noise/quality/liveness scores so absence never penalizes a trainer', () => {
    const withNulls = computeCompositeScore(decimal(50), null, null, null, evenWeights, wideRange);
    // (50*25 + 100*25 + 100*25 + 100*25) / 100 = 87.5
    expect(withNulls).toBeCloseTo(87.5, 5);
  });

  it('falls back to the raw real score when weights sum to zero', () => {
    const zeroWeights: QualityWeights = { consensus: 0, noise: 0, quality: 0, liveness: 0 };
    const result = computeCompositeScore(decimal(42), decimal(0), decimal(0), decimal(0), zeroWeights, wideRange);
    expect(result).toBe(42);
  });
});
