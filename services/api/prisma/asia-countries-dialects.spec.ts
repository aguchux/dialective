import { AFRICA_COUNTRIES } from './africa-countries-dialects';
import { ASIA_COUNTRIES } from './asia-countries-dialects';

/**
 * Jurisdictions Stripe's Restricted Businesses list prohibits dealings
 * with. Listing one as a selectable country reads as offering services
 * there, which paused payouts on the account in October 2026.
 */
const SANCTIONED_COUNTRY_CODES = ['CU', 'IR', 'KP', 'SY'];

describe('ASIA_COUNTRIES seed catalogue', () => {
  it('contains unique country codes and globally unique dialect tags', () => {
    const countryCodes = ASIA_COUNTRIES.map((country) => country.code);
    const dialectTags = ASIA_COUNTRIES.flatMap((country) => country.dialects.map((dialect) => dialect.tag));

    expect(new Set(countryCodes).size).toBe(countryCodes.length);
    expect(new Set(dialectTags).size).toBe(dialectTags.length);
    expect(ASIA_COUNTRIES.length).toBeGreaterThanOrEqual(45);
  });

  // Across every catalogue, not just this one: the next region file added
  // must not quietly reintroduce one of these.
  it('lists no sanctioned jurisdiction in any seed catalogue', () => {
    const allCodes = [...AFRICA_COUNTRIES, ...ASIA_COUNTRIES].map((country) => country.code);

    expect(allCodes.filter((code) => SANCTIONED_COUNTRY_CODES.includes(code))).toEqual([]);
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
