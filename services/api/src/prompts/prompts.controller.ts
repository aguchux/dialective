import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { countPromptWords } from '../common/prompt-length.util';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * Trainer-scoped dictation prompt picker -- deliberately separate from
   * `random` above, which is unauthenticated, query-param-driven scaffolding
   * for the landing-page ASR smoke test (see AGENTS.md "ASR pipeline test
   * flow": don't add auth to that route "as a fix", it's meant to stay
   * reachable without login). This route resolves the trainer's OWN dialect
   * server-side (same pattern as WordsService.getTrainer), never trusting a
   * client-supplied dialectTag for what content to serve.
   */
  @Get('next')
  @UseGuards(JwtAuthGuard)
  async getNext(@Req() req: AuthenticatedRequest) {
    const trainer = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        dialect: { select: { tag: true, active: true } },
        dialectVariant: { select: { active: true } },
      },
    });
    if (
      !trainer?.dialect ||
      trainer.dialect.active === false ||
      trainer.dialectVariant?.active === false
    ) {
      throw new UnprocessableEntityException('Complete dialect onboarding before dictation');
    }
    // Trainer's real dialect -- returned to the client and used for
    // routing/upload-key/Submission.dialectTag downstream. Source text
    // itself is always English (see submissions.controller.ts's identical
    // comment): the trainer reads/records it in their own dialect from
    // their own fluency, so prompt selection below always queries en-us.
    const dialectTag = trainer.dialect.tag;

    const count = await this.prisma.prompt.count({ where: { dialectTag: 'en-us', active: true } });
    if (count === 0) {
      throw new NotFoundException('NO_PROMPTS_AVAILABLE');
    }

    const skip = Math.floor(Math.random() * count);
    const [prompt] = await this.prisma.prompt.findMany({
      where: { dialectTag: 'en-us', active: true },
      skip,
      take: 1,
    });

    const wordCount = countPromptWords(prompt.text);
    const maxRecordingSeconds =
      await this.platformSettings.getDictationMaxRecordingSeconds(wordCount);

    return { promptId: prompt.id, dialectTag, text: prompt.text, wordCount, maxRecordingSeconds };
  }

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
    const { page, pageSize, dialectTag, search } = query;
    const where = {
      ...(dialectTag ? { dialectTag } : {}),
      ...(search ? { text: { contains: search, mode: 'insensitive' as const } } : {}),
    };
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
