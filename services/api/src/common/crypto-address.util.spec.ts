import { isValidAddressForNetwork } from './crypto-address.util';

describe('isValidAddressForNetwork', () => {
  it.each([
    ['TRC20', 'TQn9Y2khEsLMG6XRfmZk2Yh6JS6gY5w1zV', true],
    ['TRC20', '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', false],
    ['ERC20', '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', true],
    ['ERC20', 'TQn9Y2khEsLMG6XRfmZk2Yh6JS6gY5w1zV', false],
    ['BEP20', '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', true],
    ['POLYGON', '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', true],
    ['SOL', '5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2akWo', true],
    ['SOL', '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', false],
  ])('%s address %s -> %s', (network, address, expected) => {
    expect(isValidAddressForNetwork(address, network)).toBe(expected);
  });

  it('rejects an unknown network', () => {
    expect(isValidAddressForNetwork('TQn9Y2khEsLMG6XRfmZk2Yh6JS6gY5w1zV', 'BITCOIN')).toBe(false);
  });

  it('is case-insensitive on the network name', () => {
    expect(isValidAddressForNetwork('TQn9Y2khEsLMG6XRfmZk2Yh6JS6gY5w1zV', 'trc20')).toBe(true);
  });
});
