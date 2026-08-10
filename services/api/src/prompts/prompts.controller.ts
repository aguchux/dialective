import { Controller, Get, Query, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      throw new UnprocessableEntityException(`Unsupported dialect: ${dialectTag}`);
    }

    const skip = Math.floor(Math.random() * count);
    const [prompt] = await this.prisma.prompt.findMany({
      where: { dialectTag, active: true },
      skip,
      take: 1,
    });

    return { promptId: prompt.id, dialectTag, text: prompt.text };
  }
}
