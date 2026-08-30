import { UnprocessableEntityException } from '@nestjs/common';
import { GeoController } from './geo.controller';

function setup(keyboardLayoutMaxLength = 1000) {
  const prisma: any = {
    country: { findUnique: jest.fn().mockResolvedValue({ id: 'country-1' }) },
    dialect: {
      create: jest.fn().mockResolvedValue({ id: 'dialect-1' }),
      update: jest.fn().mockResolvedValue({ id: 'dialect-1' }),
    },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  const platformSettings = {
    getForAdmin: jest.fn().mockResolvedValue({ keyboardLayoutMaxLength }),
  };
  const llm = {};
  const controller = new GeoController(prisma as never, platformSettings as never, llm as never);
  return { controller, prisma, platformSettings };
}

describe('GeoController keyboardLayout validation', () => {
  it('rejects a keyboardLayout longer than the configured max on create', async () => {
    const { controller } = setup(5);

    await expect(
      controller.createDialect({
        tag: 'ig',
        name: 'Igbo',
        countryId: 'country-1',
        keyboardLayout: 'á à â ã ā ç ñ',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a keyboardLayout longer than the configured max on update', async () => {
    const { controller } = setup(5);

    await expect(
      controller.updateDialect('dialect-1', { keyboardLayout: 'á à â ã ā ç ñ' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('allows a keyboardLayout within the configured max', async () => {
    const { controller, prisma } = setup(1000);

    await expect(
      controller.createDialect({
        tag: 'ig',
        name: 'Igbo',
        countryId: 'country-1',
        keyboardLayout: 'á à â',
      }),
    ).resolves.toEqual({ id: 'dialect-1' });
    expect(prisma.dialect.create).toHaveBeenCalled();
  });

  it('skips validation entirely when keyboardLayout is not provided', async () => {
    const { controller, prisma, platformSettings } = setup(5);

    await expect(
      controller.updateDialect('dialect-1', { name: 'Igbo (renamed)' }),
    ).resolves.toEqual({ id: 'dialect-1' });
    expect(platformSettings.getForAdmin).not.toHaveBeenCalled();
    expect(prisma.dialect.update).toHaveBeenCalled();
  });
});
