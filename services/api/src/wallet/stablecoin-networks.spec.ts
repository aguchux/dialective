import { getNowPaymentsCurrencyCode, isValidStablecoinPair } from './stablecoin-networks';

describe('stablecoin-networks', () => {
  it.each([
    ['USDT', 'TRC20', true],
    ['USDT', 'ERC20', true],
    ['USDT', 'BEP20', true],
    ['USDT', 'SOL', true],
    ['USDT', 'POLYGON', true],
    ['USDC', 'ERC20', true],
    ['USDC', 'BEP20', true],
    ['USDC', 'SOL', true],
    ['USDC', 'POLYGON', true],
    ['USDC', 'TRC20', false],
  ])('isValidStablecoinPair(%s, %s) -> %s', (asset, network, expected) => {
    expect(isValidStablecoinPair(asset, network)).toBe(expected);
  });

  it('maps every valid pair to the confirmed NOWPayments currency code', () => {
    expect(getNowPaymentsCurrencyCode('USDT', 'TRC20')).toBe('usdttrc20');
    expect(getNowPaymentsCurrencyCode('USDT', 'ERC20')).toBe('usdterc20');
    expect(getNowPaymentsCurrencyCode('USDT', 'BEP20')).toBe('usdtbsc');
    expect(getNowPaymentsCurrencyCode('USDT', 'SOL')).toBe('usdtsol');
    expect(getNowPaymentsCurrencyCode('USDT', 'POLYGON')).toBe('usdtmatic');
    expect(getNowPaymentsCurrencyCode('USDC', 'ERC20')).toBe('usdc');
    expect(getNowPaymentsCurrencyCode('USDC', 'BEP20')).toBe('usdcbsc');
    expect(getNowPaymentsCurrencyCode('USDC', 'SOL')).toBe('usdcsol');
    expect(getNowPaymentsCurrencyCode('USDC', 'POLYGON')).toBe('usdcmatic');
  });

  it('throws for USDC on TRC20, which NOWPayments does not list', () => {
    expect(() => getNowPaymentsCurrencyCode('USDC', 'TRC20')).toThrow(
      'No NOWPayments currency code for USDC on TRC20',
    );
  });
});
