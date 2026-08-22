import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, SubscriptionPoolStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import {
  CreateSubscriptionPoolDto,
  UpdateSubscriptionPoolDto,
} from './dto/create-subscription-pool.dto';
import { ListSubscriptionPoolsDto } from './dto/list-subscription-pools.dto';

/**
 * The Reward/Bonus Pool: admin-managed subscriber funding that pays trainer
 * training-payout bonuses. Never shown to trainers (see
 * TrainerDashboard.tsx's Training tab, which has no pool figures at all) --
 * this is purely an admin surface. Deliberately its own module, not folded
 * into WalletController (already large and entirely about the separate
 * Utility Token Pool) -- see docs/Dialectiva_Business_Plan.md §5 and
 * AGENTS.md "Wallet / token pool" for the two-pool distinction.
 */
@Controller('admin/pools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PoolsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateSubscriptionPoolDto) {
    return this.prisma.subscriptionPool.create({
      data: {
        subscriberName: body.subscriberName,
        subscriberEmail: body.subscriberEmail,
        organization: body.organization,
        usdAmount: body.usdAmount,
        note: body.note,
        dataAccessLeadId: body.dataAccessLeadId,
        openedByUserId: req.user.sub,
      },
    });
  }

  @Get()
  async list(@Query() query: ListSubscriptionPoolsDto) {
    const where = query.status ? { status: query.status } : undefined;
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.subscriptionPool.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.subscriptionPool.count({ where }),
    ]);

    return {
      items: items.map((pool) => ({ ...pool, usdAmount: pool.usdAmount.toString() })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /**
   * "Total reward pool available" = SUM(usdAmount) of ACTIVE pools,
   * converted to tokens at the current tokenUsdRate, minus tokens already
   * settled out via Submission.payoutTokenAmount. This is a computed read,
   * not a cached balance -- admin-only, low-QPS. Can be negative: the
   * no-loss payout guarantee is unconditional (see computeTrainingPayout in
   * @dialectiva/db), so settlement never blocks on pool availability -- a
   * negative figure here is a visibility signal to open more subscriptions,
   * not an error state.
   */
  @Get('summary')
  async summary() {
    const [activeAgg, activeCount, settledSubmissionAgg, settledWordAgg] = await Promise.all([
      this.prisma.subscriptionPool.aggregate({
        where: { status: SubscriptionPoolStatus.ACTIVE },
        _sum: { usdAmount: true },
      }),
      this.prisma.subscriptionPool.count({ where: { status: SubscriptionPoolStatus.ACTIVE } }),
      this.prisma.submission.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.prisma.wordRecording.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
    ]);

    const rate = await this.platformSettings.getTokenUsdRate();
    const totalAvailableUsd = Number(activeAgg._sum.usdAmount ?? 0);
    const totalSettledTokens =
      Number(settledSubmissionAgg._sum.payoutTokenAmount ?? 0) +
      Number(settledWordAgg._sum.payoutTokenAmount ?? 0);
    const totalAvailableTokens = totalAvailableUsd / rate - totalSettledTokens;

    return {
      totalAvailableTokens: totalAvailableTokens.toString(),
      totalAvailableUsd: totalAvailableUsd.toString(),
      activePoolCount: activeCount,
      totalSettledTokens: totalSettledTokens.toString(),
    };
  }

  @Patch(':id/close')
  async close(@Param('id') id: string) {
    const pool = await this.prisma.subscriptionPool.findUnique({ where: { id } });
    if (!pool) {
      throw new NotFoundException('Subscription pool not found');
    }
    if (pool.status !== SubscriptionPoolStatus.ACTIVE) {
      throw new UnprocessableEntityException('Subscription pool is not active');
    }

    const closed = await this.prisma.subscriptionPool.update({
      where: { id },
      data: { status: SubscriptionPoolStatus.CLOSED, closedAt: new Date() },
    });
    return { ...closed, usdAmount: closed.usdAmount.toString() };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateSubscriptionPoolDto) {
    const pool = await this.prisma.subscriptionPool.findUnique({ where: { id } });
    if (!pool) {
      throw new NotFoundException('Subscription pool not found');
    }

    const updated = await this.prisma.subscriptionPool.update({
      where: { id },
      data: {
        subscriberName: body.subscriberName,
        subscriberEmail: body.subscriberEmail,
        organization: body.organization,
        usdAmount: body.usdAmount,
        note: body.note,
        dataAccessLeadId: body.dataAccessLeadId,
      },
    });
    return { ...updated, usdAmount: updated.usdAmount.toString() };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const pool = await this.prisma.subscriptionPool.findUnique({ where: { id } });
    if (!pool) {
      throw new NotFoundException('Subscription pool not found');
    }
    await this.prisma.subscriptionPool.delete({ where: { id } });
    return { id };
  }
}
