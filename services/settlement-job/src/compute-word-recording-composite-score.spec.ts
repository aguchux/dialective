import { Prisma } from '@dialectiva/db';
import { computeWordRecordingCompositeScore } from './settlement.service';

const decimal = (n: number) => new Prisma.Decimal(n);
const SCORE_RANGE = { min: 0, max: 100 };

describe('computeWordRecordingCompositeScore', () => {
  it('an asrMatch weight of 0 does not move the blend, regardless of the ASR match score value', () => {
    const weights = { consensus: 60, noise: 15, quality: 10, liveness: 15 };
    const realScore = decimal(80);
    const noiseScore = decimal(90);
    const qualityScore = decimal(70);
    const livenessScore = decimal(85);
    // (80*60 + 90*15 + 70*10 + 85*15) / 100 = 81.25
    const expected = 81.25;

    const withGoodAsrMatch = computeWordRecordingCompositeScore(
      realScore,
      noiseScore,
      qualityScore,
      livenessScore,
      decimal(100),
      { ...weights, asrMatch: 0 },
      SCORE_RANGE,
    );
    const withBadAsrMatch = computeWordRecordingCompositeScore(
      realScore,
      noiseScore,
      qualityScore,
      livenessScore,
      decimal(0), // even a bad ASR match score must not move the blend when its weight is 0
      { ...weights, asrMatch: 0 },
      SCORE_RANGE,
    );

    expect(withGoodAsrMatch).toBe(expected);
    expect(withBadAsrMatch).toBe(expected);
  });

  it("falls back to neutral 100 for a null asrMatchScore (ASR hasn't landed yet)", () => {
    const weights = { consensus: 50, noise: 0, quality: 0, liveness: 0, asrMatch: 50 };
    const result = computeWordRecordingCompositeScore(
      decimal(60),
      null,
      null,
      null,
      null,
      weights,
      SCORE_RANGE,
    );
    // (60*50 + 100*50) / 100 = 80
    expect(result).toBe(80);
  });

  it('blends a real asrMatchScore proportionally to its weight', () => {
    const weights = { consensus: 50, noise: 0, quality: 0, liveness: 0, asrMatch: 50 };
    const result = computeWordRecordingCompositeScore(
      decimal(100),
      null,
      null,
      null,
      decimal(0),
      weights,
      SCORE_RANGE,
    );
    // (100*50 + 0*50) / 100 = 50 -- a perfect typed-answer score dragged down by a total ASR mismatch
    expect(result).toBe(50);
  });

  it('clamps into [scoreRange.min, scoreRange.max]', () => {
    const weights = { consensus: 100, noise: 0, quality: 0, liveness: 0, asrMatch: 0 };
    const result = computeWordRecordingCompositeScore(decimal(5), null, null, null, null, weights, {
      min: 10,
      max: 30,
    });
    expect(result).toBe(10);
  });

  it('falls back to the raw score when every weight (including asrMatch) is 0', () => {
    const weights = { consensus: 0, noise: 0, quality: 0, liveness: 0, asrMatch: 0 };
    const result = computeWordRecordingCompositeScore(
      decimal(42),
      decimal(0),
      decimal(0),
      decimal(0),
      decimal(0),
      weights,
      SCORE_RANGE,
    );
    expect(result).toBe(42);
  });
});
