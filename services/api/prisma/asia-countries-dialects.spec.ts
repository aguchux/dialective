import { ASIA_COUNTRIES } from './asia-countries-dialects';

describe('ASIA_COUNTRIES seed catalogue', () => {
  it('contains unique country codes and globally unique dialect tags', () => {
    const countryCodes = ASIA_COUNTRIES.map((country) => country.code);
    const dialectTags = ASIA_COUNTRIES.flatMap((country) => country.dialects.map((dialect) => dialect.tag));

    expect(new Set(countryCodes).size).toBe(countryCodes.length);
    expect(new Set(dialectTags).size).toBe(dialectTags.length);
    expect(ASIA_COUNTRIES.length).toBeGreaterThanOrEqual(45);
  });

  it('includes broad India and China coverage', () => {
    const india = ASIA_COUNTRIES.find((country) => country.code === 'IN');
    const china = ASIA_COUNTRIES.find((country) => country.code === 'CN');

    expect(india?.dialects.map((dialect) => dialect.name)).toEqual(
      expect.arrayContaining(['Hindi', 'Bengali', 'Tamil', 'Telugu', 'Punjabi', 'Malayalam']),
    );
    expect(china?.dialects.map((dialect) => dialect.name)).toEqual(
      expect.arrayContaining(['Mandarin Chinese', 'Cantonese', 'Wu Chinese', 'Uyghur', 'Tibetan']),
    );
  });
});
