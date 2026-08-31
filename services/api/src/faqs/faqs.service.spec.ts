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
        create: jest.fn().mockResolvedValue({ id: 'faq-1', question: 'How do I train?' }),
        update: jest.fn().mockResolvedValue({ id: 'faq-1', visible: false }),
        delete: jest.fn().mockResolvedValue({ id: 'faq-1' }),
      },
      assistantMessage: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
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

  it('surfaces a not-found response when updating or deleting a missing FAQ', async () => {
    prisma.faq.update.mockRejectedValue({ code: 'P2025' });
    prisma.faq.delete.mockRejectedValue({ code: 'P2025' });

    await expect(service.update('missing', { visible: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('creating an FAQ from an AI-conversation message', () => {
    const dto = {
      question: 'How do I train?',
      answer: 'Open Training.',
      sourceMessageId: 'msg-1',
    };

    it('creates the FAQ and marks the source message converted, in one transaction', async () => {
      prisma.assistantMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        role: 'user',
        convertedToFaqId: null,
      });
      prisma.assistantMessage.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.create('admin-1', dto);

      expect(result).toEqual({ id: 'faq-1', question: 'How do I train?' });
      expect(prisma.assistantMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'msg-1', convertedToFaqId: null },
        data: { convertedToFaqId: 'faq-1' },
      });
    });

    it('rejects when the source message does not exist', async () => {
      prisma.assistantMessage.findUnique.mockResolvedValue(null);

      await expect(service.create('admin-1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.faq.create).not.toHaveBeenCalled();
    });

    it('rejects when the source message is not a user message', async () => {
      prisma.assistantMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        role: 'assistant',
        convertedToFaqId: null,
      });

      await expect(service.create('admin-1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.faq.create).not.toHaveBeenCalled();
    });

    it('rejects when the source message was already converted (read-time check)', async () => {
      prisma.assistantMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        role: 'user',
        convertedToFaqId: 'faq-existing',
      });

      await expect(service.create('admin-1', dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.faq.create).not.toHaveBeenCalled();
    });

    it('rolls back and rejects when a concurrent conversion wins the race', async () => {
      prisma.assistantMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        role: 'user',
        convertedToFaqId: null,
      });
      // Passed the read-time check, but another request converted the
      // message first: the guarded updateMany inside the transaction
      // matches zero rows.
      prisma.assistantMessage.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create('admin-1', dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
