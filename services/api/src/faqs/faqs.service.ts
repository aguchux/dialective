import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

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

  async update(id: string, dto: UpdateFaqDto) {
    await this.getExisting(id);
    try {
      return await this.prisma.faq.update({ where: { id }, data: dto, select: faqSelect });
    } catch (error) {
      this.throwDuplicateQuestion(error);
    }
  }

  async remove(id: string) {
    await this.getExisting(id);
    await this.prisma.faq.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async nextSortOrder() {
    const last = await this.prisma.faq.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  private async getExisting(id: string) {
    const faq = await this.prisma.faq.findUnique({ where: { id }, select: { id: true } });
    if (!faq) throw new NotFoundException('FAQ not found');
    return faq;
  }

  private throwDuplicateQuestion(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new ConflictException('An FAQ with this question already exists');
    }
    throw error;
  }
}
