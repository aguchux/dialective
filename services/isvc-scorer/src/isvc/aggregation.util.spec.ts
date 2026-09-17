import { IsvcConfidence } from '@dialectiva/db';
import {
  computeAgreement,
  computeConfidence,
  countOutliers,
  mean,
  stdDev,
} from './aggregation.util';

describe('mean / stdDev', () => {
  it('mean of an empty array is 0', () => {
    expect(mean([])).toBe(0);
  });

  it('computes mean and stdDev of a known set', () => {
    const values = [90, 92, 94];
    expect(mean(values)).toBeCloseTo(92, 5);
    expect(stdDev(values, mean(values))).toBeCloseTo(1.633, 2);
  });
});

describe('computeAgreement', () => {
  it('is 100 when every org agrees exactly', () => {
    const values = [90, 90, 90];
    expect(computeAgreement(values, mean(values))).toBeCloseTo(100, 5);
  });

  it('is lower when orgs disagree, scale-invariant across score magnitude', () => {
    const lowScale = computeAgreement([40, 50, 60], mean([40, 50, 60]));
    const highScale = computeAgreement([80, 100, 120], mean([80, 100, 120]));
    // Same relative spread (stdDev/mean) at different absolute scales should
    // produce roughly the same agreement -- this is the whole point of using
    // coefficient of variation rather than raw stdDev.
    expect(Math.abs(lowScale - highScale)).toBeLessThan(1);
  });

  it('never goes below 0', () => {
    const wild = [0, 100, 200];
    expect(computeAgreement(wild, mean(wild))).toBeGreaterThanOrEqual(0);
  });
});

describe('countOutliers', () => {
  it('flags no orgs when stdDev is 0', () => {
    expect(countOutliers([90, 90, 90], 90, 0)).toBe(0);
  });

  it('flags an org more than 2 stddev from the mean', () => {
    const values = [90, 90, 91, 91, 90, 10]; // 10 is a wild outlier against 5 tightly-clustered orgs
    const m = mean(values);
    const sd = stdDev(values, m);
    expect(countOutliers(values, m, sd)).toBe(1);
  });

  it('never excludes outliers from the input set (caller still averages them in)', () => {
    // countOutliers only counts -- it must not mutate or filter the array.
    const values = [90, 90, 91, 91, 90, 10];
    const before = [...values];
    countOutliers(values, mean(values), stdDev(values, mean(values)));
    expect(values).toEqual(before);
  });
});

describe('computeConfidence', () => {
  it('is EMERGING below 3 organizations', () => {
    expect(computeConfidence(1, 100)).toBe(IsvcConfidence.EMERGING);
    expect(computeConfidence(2, 100)).toBe(IsvcConfidence.EMERGING);
  });

  it('is ESTABLISHED at 3-4 organizations regardless of agreement', () => {
    expect(computeConfidence(3, 100)).toBe(IsvcConfidence.ESTABLISHED);
    expect(computeConfidence(4, 50)).toBe(IsvcConfidence.ESTABLISHED);
  });

  it('is HIGH at 5-9 organizations only with agreement >= 80', () => {
    expect(computeConfidence(5, 80)).toBe(IsvcConfidence.HIGH);
    expect(computeConfidence(9, 79)).toBe(IsvcConfidence.ESTABLISHED);
  });

  it('is VERY_HIGH at 10+ organizations only with agreement >= 85', () => {
    expect(computeConfidence(10, 85)).toBe(IsvcConfidence.VERY_HIGH);
    expect(computeConfidence(20, 84)).toBe(IsvcConfidence.ESTABLISHED);
  });

  it('does not grant VERY_HIGH confidence to a single high score over many low-agreement orgs', () => {
    // product plan section 19: "a score of 97 from one organization should
    // not be treated as stronger evidence than a score of 94 from 20
    // organizations with very high agreement" -- the inverse must also
    // hold: 20 orgs with LOW agreement must not outrank fewer orgs with
    // high agreement.
    expect(computeConfidence(20, 40)).not.toBe(IsvcConfidence.VERY_HIGH);
  });
});
