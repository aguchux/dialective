import { PrismaSamlCacheProvider } from './sso.service';

function setup() {
  const prisma: any = {
    ssoRequestCache: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  };
  const provider = new PrismaSamlCacheProvider(prisma as never);
  return { provider, prisma };
}

describe('PrismaSamlCacheProvider', () => {
  describe('saveAsync', () => {
    it('stores a new key and returns the CacheItem', async () => {
      const { provider, prisma } = setup();
      const createdAt = new Date();
      prisma.ssoRequestCache.create.mockResolvedValue({ key: 'req-1', value: 'issued', createdAt });

      const result = await provider.saveAsync('req-1', 'issued');

      expect(prisma.ssoRequestCache.create).toHaveBeenCalledWith({
        data: { key: 'req-1', value: 'issued' },
      });
      expect(result).toEqual({ value: 'issued', createdAt: createdAt.getTime() });
    });

    it('returns null on a key collision (first-write-wins, matches InMemoryCacheProvider)', async () => {
      const { provider, prisma } = setup();
      prisma.ssoRequestCache.create.mockRejectedValue(new Error('unique constraint'));

      const result = await provider.saveAsync('req-1', 'issued');

      expect(result).toBeNull();
    });
  });

  describe('getAsync', () => {
    it('returns the stored value for a fresh key', async () => {
      const { provider, prisma } = setup();
      prisma.ssoRequestCache.findUnique.mockResolvedValue({
        key: 'req-1',
        value: 'issued',
        createdAt: new Date(),
      });

      const result = await provider.getAsync('req-1');

      expect(result).toBe('issued');
    });

    it('returns null and deletes the row for an unknown key', async () => {
      const { provider, prisma } = setup();
      prisma.ssoRequestCache.findUnique.mockResolvedValue(null);

      const result = await provider.getAsync('missing');

      expect(result).toBeNull();
      expect(prisma.ssoRequestCache.delete).not.toHaveBeenCalled();
    });

    it('returns null and deletes an expired key (older than the TTL)', async () => {
      const { provider, prisma } = setup();
      prisma.ssoRequestCache.findUnique.mockResolvedValue({
        key: 'req-1',
        value: 'issued',
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min old, TTL is 5 min
      });
      prisma.ssoRequestCache.delete.mockResolvedValue({ key: 'req-1' });

      const result = await provider.getAsync('req-1');

      expect(result).toBeNull();
      expect(prisma.ssoRequestCache.delete).toHaveBeenCalledWith({ where: { key: 'req-1' } });
    });
  });

  describe('removeAsync', () => {
    it('deletes and returns the key when present', async () => {
      const { provider, prisma } = setup();
      prisma.ssoRequestCache.delete.mockResolvedValue({ key: 'req-1' });

      const result = await provider.removeAsync('req-1');

      expect(result).toBe('req-1');
    });

    it('returns null for a null key without touching the DB', async () => {
      const { provider, prisma } = setup();

      const result = await provider.removeAsync(null);

      expect(result).toBeNull();
      expect(prisma.ssoRequestCache.delete).not.toHaveBeenCalled();
    });

    it('returns null when the key does not exist (delete throws)', async () => {
      const { provider, prisma } = setup();
      prisma.ssoRequestCache.delete.mockRejectedValue(new Error('not found'));

      const result = await provider.removeAsync('missing');

      expect(result).toBeNull();
    });
  });
});
