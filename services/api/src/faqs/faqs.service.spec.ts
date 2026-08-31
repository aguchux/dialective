import { ConflictException, NotFoundException } from '@nestjs/common';
import { FaqsService } from './faqs.service';

describe('FaqsService', () => {
  let prisma: any;
  let service: FaqsService;

  beforeEach(() => {
    prisma = {
      faq: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ sortOrder: 2 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'faq-1' }),
        create: jest.fn().mockResolvedValue({ id: 'faq-1', question: 'How do I train?' }),
        update: jest.fn().mockResolvedValue({ id: 'faq-1', visible: false }),
        delete: jest.fn().mockResolvedValue({ id: 'faq-1' }),
      },
    };
    service = new FaqsService(prisma);
  });

  it('returns only visible entries from the public endpoint', async () => {
    await service.listPublic();

    expect(prisma.faq.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { visible: true } }),
    );
  });

  it('creates an FAQ with the next display order and records its author', async () => {
    await service.create('admin-1', { question: 'How do I train?', answer: 'Open Training.' });

    expect(prisma.faq.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: 'admin-1', sortOrder: 3 }),
      }),
    );
  });

  it('rejects a duplicate FAQ question with a clear conflict response', async () => {
    prisma.faq.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create('admin-1', { question: 'How do I train?', answer: 'Open Training.' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not update or delete an FAQ that does not exist', async () => {
    prisma.faq.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { visible: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
