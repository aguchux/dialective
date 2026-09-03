import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ListSentencesAdminDto } from './dto/list-sentences-admin.dto';

/**
 * Admin: generated sentence bank -- read/curate the Sentence table.
 * word-generator-job is the sole writer (see WordsService.pickSentenceSource
 * for the trainer-facing picker); admins review/delete from here, mirroring
 * WordsController's admin word-bank endpoints.
 */
@Controller('sentences')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SentencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('admin')
  async listSentencesForAdmin(@Query() query: ListSentencesAdminDto) {
    const { page, pageSize, search } = query;
    const where = search ? { text: { contains: search, mode: 'insensitive' as const } } : {};
    const [items, total] = await Promise.all([
      this.prisma.sentence.findMany({
        where,
        include: { translations: { orderBy: { dialectTag: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sentence.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  @Delete('admin/:id')
  async deleteSentence(@Param('id') id: string) {
    try {
      await this.prisma.sentence.delete({ where: { id } });
      return { id, deleted: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundException('Sentence not found');
        if (err.code === 'P2003')
          throw new UnprocessableEntityException(
            'Sentence still has recordings or assignments referencing it',
          );
      }
      throw err;
    }
  }
}
