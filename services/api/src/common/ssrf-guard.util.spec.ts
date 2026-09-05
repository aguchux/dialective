import { lookup } from 'dns/promises';
import { assertPublicHostname } from './ssrf-guard.util';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('assertPublicHostname', () => {
  afterEach(() => jest.resetAllMocks());

  it('allows a public IPv4 literal', async () => {
    await expect(assertPublicHostname('8.8.8.8')).resolves.toBeUndefined();
  });

  it.each([
    ['loopback', '127.0.0.1'],
    ['RFC1918 10.x', '10.1.2.3'],
    ['RFC1918 172.16-31.x', '172.20.0.1'],
    ['RFC1918 192.168.x', '192.168.1.1'],
    ['link-local / cloud metadata', '169.254.169.254'],
    ['multicast', '224.0.0.1'],
    ['reserved', '255.255.255.255'],
  ])('rejects a %s IPv4 literal (%s)', async (_label, ip) => {
    await expect(assertPublicHostname(ip)).rejects.toThrow(/non-public/);
  });

  it('rejects an IPv6 loopback literal', async () => {
    await expect(assertPublicHostname('::1')).rejects.toThrow(/non-public/);
  });

  it('rejects an IPv6 unique-local literal', async () => {
    await expect(assertPublicHostname('fd00::1')).rejects.toThrow(/non-public/);
  });

  it('rejects an IPv4-mapped IPv6 address embedding a private IPv4', async () => {
    await expect(assertPublicHostname('::ffff:169.254.169.254')).rejects.toThrow(/non-public/);
  });

  it('allows a hostname when every resolved address is public', async () => {
    mockLookup.mockResolvedValue([{ address: '203.0.113.5', family: 4 }] as never);

    await expect(assertPublicHostname('example.com')).resolves.toBeUndefined();
  });

  it('rejects a hostname when any resolved address is private (DNS rebinding)', async () => {
    mockLookup.mockResolvedValue([
      { address: '203.0.113.5', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ] as never);

    await expect(assertPublicHostname('rebinding.example.com')).rejects.toThrow(/non-public/);
  });

  it('rejects a hostname that resolves to nothing', async () => {
    mockLookup.mockResolvedValue([] as never);

    await expect(assertPublicHostname('nowhere.example.com')).rejects.toThrow(/Could not resolve/);
  });
});
