import { formatDurationLong, formatDurationShort } from './vdcl-duration.util';

/**
 * The bug these lock down: a real contributor's 42 recordings totalled ~92
 * seconds (single words, ~2s each), and the product told them three
 * different things about it depending on where they looked.
 */
describe('VDCL duration formatting', () => {
  const NINETY_TWO_SECONDS = '92000';

  it('keeps the seconds that truncation used to discard', () => {
    // Was "1m" -- a third of this dataset was missing from the figure a
    // contributor signs against.
    expect(formatDurationShort(NINETY_TWO_SECONDS)).toBe('1m 32s');
  });

  it('says the same thing on the screen and on the licence', () => {
    // The screen said "1m" while the PDF said "2 minutes" for this exact
    // dataset. Same source, same answer, whatever the wording.
    expect(formatDurationShort(NINETY_TWO_SECONDS)).toBe('1m 32s');
    expect(formatDurationLong(NINETY_TWO_SECONDS)).toBe('1 minute 32 seconds');
  });

  it('never claims a licensed dataset is zero minutes long', () => {
    // The document formatter rounded to whole minutes with no seconds
    // branch, so anything under 30s printed "0 minutes" on a signed licence.
    expect(formatDurationLong('8000')).toBe('8 seconds');
    expect(formatDurationShort('8000')).toBe('8s');
    expect(formatDurationLong('29000')).not.toMatch(/^0 minutes/);
  });

  it('handles hours', () => {
    expect(formatDurationShort(String(3_600_000 + 4 * 60_000))).toBe('1h 4m');
    expect(formatDurationLong(String(3_600_000 + 4 * 60_000))).toBe('1 hour 4 minutes');
    expect(formatDurationLong(String(2 * 3_600_000 + 60_000))).toBe('2 hours 1 minute');
  });

  it('carries seconds into minutes rather than reporting both from the raw value', () => {
    // 59.6s must not read as "59s" in one component and round up in
    // another -- the parts are derived from one rounded total.
    expect(formatDurationShort('59600')).toBe('1m 0s');
    expect(formatDurationShort('59400')).toBe('59s');
  });

  it('treats missing, zero and nonsense as zero without throwing', () => {
    for (const bad of [null, undefined, '0', '-5', 'abc', '']) {
      expect(formatDurationShort(bad)).toBe('0s');
      expect(formatDurationLong(bad)).toBe('0 seconds');
    }
  });

  it('accepts the BigInt-as-string the manifest actually stores', () => {
    expect(formatDurationShort(92_000)).toBe('1m 32s');
    expect(formatDurationShort('92000')).toBe('1m 32s');
  });
});
