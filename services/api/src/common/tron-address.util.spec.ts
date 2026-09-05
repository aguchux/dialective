import { isTronAddress } from './tron-address.util';

describe('isTronAddress', () => {
  it('accepts a well-formed 34-character Tron address starting with T', () => {
    expect(isTronAddress('TXYZabc123456789XYZabc123456789XYZ')).toBe(true);
  });

  it('rejects an Ethereum-style 0x address', () => {
    expect(isTronAddress('0x0000000000000000000000000000000000dEaD')).toBe(false);
  });

  it('rejects a string not starting with T', () => {
    expect(isTronAddress('AXYZabc1234567890XYZabc1234567890X')).toBe(false);
  });

  it('rejects a string of the wrong length', () => {
    expect(isTronAddress('TXYZabc1234567890')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isTronAddress(12345)).toBe(false);
    expect(isTronAddress(null)).toBe(false);
    expect(isTronAddress(undefined)).toBe(false);
  });
});
