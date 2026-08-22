import { ApiAccessTokensService } from './api-access-tokens.service';

function setup() {
  process.env.API_TOKEN_ENCRYPTION_KEY = 'test-passphrase-do-not-use-in-prod';
  const prisma = {
    apiAccessToken: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new ApiAccessTokensService(prisma as never);
  return { service, prisma };
}

describe('ApiAccessTokensService.list', () => {
  it('lists every known key even when none are configured', async () => {
    const { service, prisma } = setup();
    prisma.apiAccessToken.findMany.mockResolvedValue([]);

    const result = await service.list();

    expect(result).toEqual([{ key: 'huggingface', isSet: false, lastFour: null, updatedAt: null, updatedByEmail: null }]);
  });

  it('reports isSet with the masked last-4 for a configured key', async () => {
    const { service, prisma } = setup();
    const updatedAt = new Date('2026-08-22T00:00:00Z');
    prisma.apiAccessToken.findMany.mockResolvedValue([
      { key: 'huggingface', lastFour: 'a1b2', updatedAt, updatedBy: { email: 'admin@example.com' } },
    ]);

    const result = await service.list();

    expect(result).toEqual([
      { key: 'huggingface', isSet: true, lastFour: 'a1b2', updatedAt, updatedByEmail: 'admin@example.com' },
    ]);
  });
});

describe('ApiAccessTokensService.set', () => {
  it('rejects an empty/whitespace-only value without touching the database', async () => {
    const { service, prisma } = setup();

    await expect(service.set('huggingface', '   ', 'admin-1')).rejects.toThrow('Token value must not be empty');
    expect(prisma.apiAccessToken.upsert).not.toHaveBeenCalled();
  });

  it('encrypts the value and never returns it in plaintext', async () => {
    const { service, prisma } = setup();
    prisma.apiAccessToken.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({ ...create, updatedAt: new Date(), updatedBy: { email: 'admin@example.com' } }),
    );

    const result = await service.set('huggingface', 'hf_abcdef1234', 'admin-1');

    expect(result.lastFour).toBe('1234');
    expect(result).not.toHaveProperty('value');
    expect(JSON.stringify(result)).not.toContain('hf_abcdef1234');
    const [[{ create }]] = prisma.apiAccessToken.upsert.mock.calls;
    expect(create.encryptedValue).not.toContain('hf_abcdef1234');
  });
});

describe('ApiAccessTokensService.getDecrypted', () => {
  it('returns null when the key has never been set', async () => {
    const { service, prisma } = setup();
    prisma.apiAccessToken.findUnique.mockResolvedValue(null);

    await expect(service.getDecrypted('huggingface')).resolves.toBeNull();
  });

  it('decrypts a previously-set value back to its original plaintext', async () => {
    const { service, prisma } = setup();
    let stored: Record<string, unknown> | null = null;
    prisma.apiAccessToken.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => {
      stored = create;
      return Promise.resolve({ ...create, updatedAt: new Date(), updatedBy: null });
    });
    await service.set('huggingface', 'hf_real_token', 'admin-1');
    prisma.apiAccessToken.findUnique.mockResolvedValue(stored);

    await expect(service.getDecrypted('huggingface')).resolves.toBe('hf_real_token');
  });
});
