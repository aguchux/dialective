import { QRAC_CHECKLIST, nextQracVersion } from './qrac.util';

describe('nextQracVersion', () => {
  it('starts a first-ever signing at 1.0', () => {
    expect(nextQracVersion(null)).toBe('1.0');
  });

  it('increments the minor version', () => {
    expect(nextQracVersion('1.0')).toBe('1.1');
  });

  it('rolls over to the next major version after .9', () => {
    expect(nextQracVersion('1.9')).toBe('2.0');
  });

  it('keeps rolling over regardless of how large major already is', () => {
    expect(nextQracVersion('9.9')).toBe('10.0');
  });

  it('falls back to 1.0 for an unparseable previous version', () => {
    expect(nextQracVersion('garbage')).toBe('1.0');
  });
});

describe('QRAC_CHECKLIST', () => {
  it('is non-empty and every item is a non-empty string', () => {
    expect(QRAC_CHECKLIST.length).toBeGreaterThan(0);
    for (const item of QRAC_CHECKLIST) {
      expect(typeof item).toBe('string');
      expect(item.length).toBeGreaterThan(0);
    }
  });
});
