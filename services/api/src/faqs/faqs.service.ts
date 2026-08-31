import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

const P2002_UNIQUE_CONSTRAINT = 'P2002';
const P2025_RECORD_NOT_FOUND = 'P2025';

class AlreadyConvertedError extends Error {}

const faqSelect = {
  id: true,
  question: true,
  answer: true,
  visible: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.FaqSelect;

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.faq.findMany({
      where: { visible: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, question: true, answer: true, updatedAt: true },
    });
  }

  listAdmin() {
    return this.prisma.faq.findMany({
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      select: faqSelect,
    });
  }

  async create(adminId: string, dto: CreateFaqDto) {
    if (dto.sourceMessageId) {
      return this.createFromMessage(adminId, dto, dto.sourceMessageId);
    }
    const sortOrder = await this.nextSortOrder();
    try {
      return await this.prisma.faq.create({
        data: { question: dto.question, answer: dto.answer, sortOrder, createdById: adminId },
        select: faqSelect,
      });
    } catch (error) {
      this.throwDuplicateQuestion(error);
    }
  }

  private async createFromMessage(adminId: string, dto: CreateFaqDto, sourceMessageId: string) {
    const message = await this.prisma.assistantMessage.findUnique({
      where: { id: sourceMessageId },
      select: { id: true, role: true, convertedToFaqId: true },
    });
    if (!message || message.role !== 'user') {
      throw new NotFoundException('Source message not found');
    }
    if (message.convertedToFaqId) {
      throw new ConflictException('This question has already been turned into an FAQ');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const sortOrder = await this.nextSortOrder(tx);
        const faq = await tx.faq.create({
          data: { question: dto.question, answer: dto.answer, sortOrder, createdById: adminId },
          select: faqSelect,
        });
        // Guarded by the convertedToFaqId: null filter: a concurrent second
        // conversion of the same message races here, and the loser updates
        // zero rows (count === 0), which is treated as already-converted
        // below and rolls back this transaction (including its own
        // freshly created, now-orphaned Faq row).
        const { count } = await tx.assistantMessage.updateMany({
          where: { id: sourceMessageId, convertedToFaqId: null },
          data: { convertedToFaqId: faq.id },
        });
        if (count === 0) {
          throw new AlreadyConvertedError();
        }
        return faq;
      });
    } catch (error) {
      if (error instanceof AlreadyConvertedError) {
        throw new ConflictException('This question has already been turned into an FAQ');
      }
      this.throwDuplicateQuestion(error);
    }
  }

  async update(id: string, dto: UpdateFaqDto) {
    try {
      return await this.prisma.faq.update({ where: { id }, data: dto, select: faqSelect });
    } catch (error) {
      if (this.isNotFound(error)) throw new NotFoundException('FAQ not found');
      this.throwDuplicateQuestion(error);
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.faq.delete({ where: { id } });
    } catch (error) {
      if (this.isNotFound(error)) throw new NotFoundException('FAQ not found');
      throw error;
    }
    return { id, deleted: true };
  }

  private async nextSortOrder(client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const last = await client.faq.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  private isNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === P2025_RECORD_NOT_FOUND
    );
  }

  private throwDuplicateQuestion(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === P2002_UNIQUE_CONSTRAINT
    ) {
      throw new ConflictException('An FAQ with this question already exists');
    }
    throw error;
  }
}
