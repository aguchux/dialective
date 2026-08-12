import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Prisma, Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListPromptsAdminDto } from './dto/list-prompts-admin.dto';
import { UpdatePromptAdminDto } from './dto/update-prompt-admin.dto';

/**
 * Real, Postgres-backed prompt picker (services/api/prisma/schema.prisma's
 * Prompt model, seeded from services/api/prisma/seed.ts). Replaces the old
 * in-memory PROMPTS_BY_DIALECT bank, which minted a fresh random promptId on
 * every call -- meaning a prompt/dialect cluster could never reach quorum,
 * since no two submissions ever shared the same promptId. Returning a
 * stable, real prompt row is what lets consensus-scorer group submissions
 * into clusters at all.
 */
@Controller('prompts')
export class PromptsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('random')
  async getRandom(@Query('dialectTag') dialectTagRaw?: string) {
    const dialectTag = dialectTagRaw ?? 'en-us';
    const count = await this.prisma.prompt.count({ where: { dialectTag, active: true } });
    if (count === 0) {
      // Distinct, stable message the frontend matches on to show a "check
      // back later" empty state instead of a generic error banner -- see
      // NO_WORDS_AVAILABLE in WordsService.nextAssignment for the same
      // pattern. No per-prompt usage cap: the same prompt can be assigned
      // to the same trainer again later, so empty only means zero rows for
      // this dialect, not "this trainer used them all."
      throw new NotFoundException('NO_PROMPTS_AVAILABLE');
    }

    const skip = Math.floor(Math.random() * count);
    const [prompt] = await this.prisma.prompt.findMany({
      where: { dialectTag, active: true },
      skip,
      take: 1,
    });

    return { promptId: prompt.id, dialectTag, text: prompt.text };
  }

  // --- Admin: generated prompt bank ---------------------------------------
  // Read/curate the Prompt table -- word-generator-job is the primary
  // writer for en-us source rows and their dialect translations now (see
  // prisma/seed.ts, whose PROMPTS_BY_DIALECT array is bootstrap-only going
  // forward), admins review/toggle-active from here.

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listPromptsForAdmin(@Query() query: ListPromptsAdminDto) {
    const { page, pageSize, dialectTag } = query;
    const where = dialectTag ? { dialectTag } : {};
    const [items, total] = await Promise.all([
      this.prisma.prompt.findMany({
        where,
        include: { translations: { orderBy: { dialectTag: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.prompt.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updatePromptForAdmin(@Param('id') id: string, @Body() dto: UpdatePromptAdminDto) {
    try {
      return await this.prisma.prompt.update({ where: { id }, data: { active: dto.active } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Prompt not found');
      }
      throw err;
    }
  }
}
