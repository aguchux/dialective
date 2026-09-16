import { NotFoundException } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pm-1',
    countryCode: 'NG',
    type: 'BANK',
    name: 'GTBank',
    description: null,
    logoKey: null,
    bankCode: '058',
    enabled: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const prisma = {
    paymentMethodCatalog: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const storage = {
    getPublicObjectUrl: jest.fn().mockReturnValue('https://cdn.example/logo.png'),
    createPresignedUploadUrl: jest.fn().mockResolvedValue({
      url: 'https://upload.example/put',
      key: 'pm-1/logo.png',
      expiresInSeconds: 900,
    }),
  };
  const service = new PaymentMethodsService(prisma as never, storage as never);
  return { service, prisma, storage };
}

describe('PaymentMethodsService.list', () => {
  it('filters to enabled rows for the requested country, uppercasing the code', async () => {
    const { service, prisma } = setup();
    prisma.paymentMethodCatalog.findMany.mockResolvedValue([makeRow()]);

    const result = await service.list({ countryCode: 'ng' });

    expect(prisma.paymentMethodCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ countryCode: 'NG', enabled: true }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('GTBank');
  });

  it('omits a logoUrl when no logoKey is set', async () => {
    const { service, prisma } = setup();
    prisma.paymentMethodCatalog.findMany.mockResolvedValue([makeRow({ logoKey: null })]);

    const [result] = await service.list({ countryCode: 'NG' });

    expect(result.logoUrl).toBeNull();
  });

  it('resolves a public logoUrl when logoKey is set', async () => {
    const { service, prisma, storage } = setup();
    prisma.paymentMethodCatalog.findMany.mockResolvedValue([makeRow({ logoKey: 'pm-1/logo.png' })]);

    const [result] = await service.list({ countryCode: 'NG' });

    expect(result.logoUrl).toBe('https://cdn.example/logo.png');
    expect(storage.getPublicObjectUrl).toHaveBeenCalled();
  });
});

describe('PaymentMethodsService admin CRUD', () => {
  it('creates a catalog row, uppercasing the country code', async () => {
    const { service, prisma } = setup();
    prisma.paymentMethodCatalog.create.mockResolvedValue(makeRow());

    await service.create({ countryCode: 'ng', type: 'BANK' as never, name: 'GTBank' });

    expect(prisma.paymentMethodCatalog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ countryCode: 'NG' }) }),
    );
  });

  it('throws NotFoundException updating a missing row', async () => {
    const { service, prisma } = setup();
    prisma.paymentMethodCatalog.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing row', async () => {
    const { service, prisma } = setup();
    prisma.paymentMethodCatalog.findUnique.mockResolvedValue(makeRow());
    prisma.paymentMethodCatalog.delete.mockResolvedValue(makeRow());

    const result = await service.delete('pm-1');

    expect(result).toEqual({ id: 'pm-1', deleted: true });
  });
});

describe('PaymentMethodsService logo upload', () => {
  it('issues a public-read presigned upload URL scoped under the row id', async () => {
    const { service, prisma, storage } = setup();
    prisma.paymentMethodCatalog.findUnique.mockResolvedValue(makeRow());

    const result = await service.createLogoUploadUrl('pm-1', { contentType: 'image/png' });

    expect(result.uploadUrl).toBe('https://upload.example/put');
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/^pm-1\//),
      'image/png',
      true,
    );
  });

  it('rejects an upload-url request for a missing row', async () => {
    const { service, prisma } = setup();
    prisma.paymentMethodCatalog.findUnique.mockResolvedValue(null);

    await expect(
      service.createLogoUploadUrl('missing', { contentType: 'image/png' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('confirms an upload by saving the logoKey', async () => {
    const { service, prisma } = setup();
    prisma.paymentMethodCatalog.findUnique.mockResolvedValue(makeRow());
    prisma.paymentMethodCatalog.update.mockResolvedValue(makeRow({ logoKey: 'pm-1/logo.png' }));

    const result = await service.confirmLogoUpload('pm-1', 'pm-1/logo.png');

    expect(prisma.paymentMethodCatalog.update).toHaveBeenCalledWith({
      where: { id: 'pm-1' },
      data: { logoKey: 'pm-1/logo.png' },
    });
    expect(result.logoUrl).toBe('https://cdn.example/logo.png');
  });
});
