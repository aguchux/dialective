import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LedgerEntryType, Prisma, Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDistributorAllocationDto, UpdateDistributorSettingsDto } from './dto/distributor.dto';

const { Decimal } = Prisma;

@Injectable()
export class DistributorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    return this.serializeSettings(await this.settingsRow());
  }

  async updateSettings(dto: UpdateDistributorSettingsDto) {
    const data = { ...dto };
    const rates = [
      data.level1Rate,
      data.level2Rate,
      data.level3Rate,
      data.level4Rate,
      data.level5Rate,
    ].filter((value): value is number => value !== undefined);
    if (rates.some((rate) => rate < 0 || rate > 1)) {
      throw new BadRequestException('Distributor referral rates must be between 0 and 1');
    }

    const existing = await this.settingsRow();
    const effectiveRates = [
      data.level1Rate ?? existing.level1Rate.toNumber(),
      data.level2Rate ?? existing.level2Rate.toNumber(),
      data.level3Rate ?? existing.level3Rate.toNumber(),
      data.level4Rate ?? existing.level4Rate.toNumber(),
      data.level5Rate ?? existing.level5Rate.toNumber(),
    ];
    const maxDepth = data.maxReferralDepth ?? existing.maxReferralDepth;
    const total = effectiveRates.slice(0, maxDepth).reduce((sum, rate) => sum + rate, 0);
    if (total > 1) {
      throw new BadRequestException('Enabled distributor referral levels cannot sum above 100%');
    }

    const row = await this.prisma.distributorSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    return this.serializeSettings(row);
  }

  async allocateTokens(adminId: string, distributorId: string, dto: CreateDistributorAllocationDto) {
    const settings = await this.settingsRow();
    if (!settings.enabled || !settings.bulkAllocationEnabled) {
      throw new UnprocessableEntityException('Distributor bulk allocation is disabled');
    }

    const distributor = await this.prisma.user.findUnique({ where: { id: distributorId }, include: { wallet: true } });
    if (!distributor || distributor.role !== Role.DISTRIBUTOR) {
      throw new NotFoundException('Distributor not found');
    }

    const tokenAmount = new Decimal(dto.tokenAmount);
    const discountRate = new Decimal(dto.discountRate ?? settings.defaultBulkDiscountRate);
    const allocationId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet =
        distributor.wallet ??
        (await tx.wallet.create({
          data: { userId: distributor.id },
        }));
      const allocation = await tx.distributorAllocation.create({
        data: {
          id: allocationId,
          distributorId: distributor.id,
          grantedById: adminId,
          tokenAmount,
          discountRate,
          note: dto.note?.trim() || null,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.DISTRIBUTOR_BULK_ALLOCATION,
          amount: tokenAmount,
          reference: allocation.id,
        },
      });
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: tokenAmount } } });
      return allocation;
    });

    return this.serializeAllocation(result);
  }

  /**
   * Admin-facing audit view -- every bulk grant across every distributor,
   * newest first, with enough of the distributor/admin identity to make
   * sense of the row (name/email), not just raw ids. grantedById is never
   * client-suppliable (see allocateTokens's @Roles(ADMIN) + req.user.sub),
   * so this list is a trustworthy record of who minted what and when.
   */
  async listAllocations(params: { distributorId?: string; page: number; pageSize: number }) {
    const where = params.distributorId ? { distributorId: params.distributorId } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.distributorAllocation.count({ where }),
      this.prisma.distributorAllocation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          distributor: { select: { id: true, firstName: true, lastName: true, email: true } },
          grantedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.serializeAllocation(row),
        distributor: { id: row.distributor.id, name: displayName(row.distributor), email: row.distributor.email },
        grantedBy: { id: row.grantedBy.id, name: displayName(row.grantedBy), email: row.grantedBy.email },
      })),
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async dashboard(userId: string) {
    const [settings, user, allocations, sellOffers, buyRequests, releasedTrades] = await Promise.all([
      this.settingsRow(),
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true },
      }),
      this.prisma.distributorAllocation.findMany({
        where: { distributorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.p2PTokenOffer.count({ where: { userId, type: 'SELL', status: { in: ['ACTIVE', 'RESERVED'] } } }),
      this.prisma.p2PTokenOffer.count({ where: { userId, type: 'BUY', status: { in: ['ACTIVE', 'RESERVED'] } } }),
      this.prisma.p2PTokenTrade.count({ where: { sellerId: userId, status: 'RELEASED' } }),
    ]);
    if (!user || user.role !== Role.DISTRIBUTOR) {
      throw new NotFoundException('Distributor not found');
    }
    const network = await this.network(userId);
    const bonusEntries = await this.prisma.ledgerEntry.findMany({
      where: {
        wallet: { userId },
        type: { in: [LedgerEntryType.DISTRIBUTOR_FUNDING_BONUS, LedgerEntryType.DISTRIBUTOR_PAYOUT_BONUS] },
      },
      select: { amount: true, reference: true },
    });
    const bonusByLevel = summarizeBonusesByLevel(bonusEntries);
    const totalBonuses = bonusByLevel.reduce((sum, level) => sum.add(new Decimal(level.amount)), new Decimal(0));

    return {
      settings: this.serializeSettings(settings),
      profile: {
        id: user.id,
        name: displayName(user),
        email: user.email,
        referralCode: user.referralCode,
      },
      wallet: {
        balance: user.wallet?.balance.toString() ?? '0',
        lockedBalance: user.wallet?.lockedBalance.toString() ?? '0',
      },
      metrics: {
        networkMembers: network.totalMembers,
        networkTokenBalance: network.totalTokenBalance,
        directReferrals: network.directMembers,
        referralBonuses: totalBonuses.toString(),
        activeSellOffers: sellOffers,
        activeBuyRequests: buyRequests,
        completedSales: releasedTrades,
      },
      referralBonusesByLevel: bonusByLevel,
      allocations: allocations.map((allocation) => this.serializeAllocation(allocation)),
      network,
    };
  }

  async network(userId: string) {
    const root = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!root || root.role !== Role.DISTRIBUTOR) {
      throw new NotFoundException('Distributor not found');
    }
    // The network view (and its totalTokenBalance) is gated to the same
    // maxReferralDepth an admin sets for the commission chain -- a
    // distributor should never see (or have their cumulative balance
    // inflated by) downline levels admin hasn't enabled commissions for.
    // Falls back to 0 when the whole distributor system is off, so the view
    // reads as "no network" rather than silently showing 5 levels anyway.
    const settings = await this.settingsRow();
    const maxDepth = settings.enabled && settings.multiLevelReferralEnabled ? Math.min(5, Math.max(0, settings.maxReferralDepth)) : 0;
    const tree = maxDepth > 0 ? await this.loadNetworkLevels(userId, maxDepth) : [];
    const flat = flattenNetwork(tree);
    const totalTokenBalance = flat.reduce((sum, node) => sum.add(new Decimal(node.tokenBalance)), new Decimal(0));
    return {
      maxDepth,
      directMembers: tree.length,
      totalMembers: flat.length,
      totalTokenBalance: totalTokenBalance.toString(),
      tree,
      allMembers: flat,
    };
  }

  /**
   * One query per depth level (not one per node) -- fetches every user
   * whose referredById is in the previous level's id set, then groups the
   * results back onto their parent in memory. A distributor with N
   * downline members costs O(maxDepth) round trips instead of O(N).
   */
  private async loadNetworkLevels(rootId: string, maxDepth: number): Promise<NetworkNode[]> {
    const byParentId = new Map<string, NetworkNode[]>();
    let parentIds = [rootId];

    for (let level = 1; level <= maxDepth && parentIds.length > 0; level += 1) {
      const users = await this.prisma.user.findMany({
        where: { referredById: { in: parentIds } },
        include: { wallet: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { createdAt: 'desc' }],
      });
      for (const user of users) {
        const node: NetworkNode = {
          id: user.id,
          name: displayName(user),
          level,
          tokenBalance: user.wallet?.balance.toString() ?? '0',
          children: [],
        };
        const siblings = byParentId.get(user.referredById!) ?? [];
        siblings.push(node);
        byParentId.set(user.referredById!, siblings);
      }
      parentIds = users.map((user) => user.id);
    }

    const attachChildren = (nodes: NetworkNode[]): NetworkNode[] =>
      nodes.map((node) => ({ ...node, children: attachChildren(byParentId.get(node.id) ?? []) }));

    return attachChildren(byParentId.get(rootId) ?? []);
  }

  private settingsRow() {
    return this.prisma.distributorSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  private serializeSettings(row: Awaited<ReturnType<DistributorsService['settingsRow']>>) {
    return {
      id: row.id,
      enabled: row.enabled,
      bulkAllocationEnabled: row.bulkAllocationEnabled,
      defaultBulkDiscountRate: row.defaultBulkDiscountRate.toString(),
      multiLevelReferralEnabled: row.multiLevelReferralEnabled,
      maxReferralDepth: row.maxReferralDepth,
      level1Rate: row.level1Rate.toString(),
      level2Rate: row.level2Rate.toString(),
      level3Rate: row.level3Rate.toString(),
      level4Rate: row.level4Rate.toString(),
      level5Rate: row.level5Rate.toString(),
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  private serializeAllocation(row: { id: string; distributorId: string; grantedById: string; tokenAmount: Prisma.Decimal; discountRate: Prisma.Decimal; note: string | null; createdAt: Date }) {
    return {
      id: row.id,
      distributorId: row.distributorId,
      grantedById: row.grantedById,
      tokenAmount: row.tokenAmount.toString(),
      discountRate: row.discountRate.toString(),
      note: row.note,
      createdAt: row.createdAt,
    };
  }
}

// Deliberately no `role` field -- the network view is spec'd as "names and
// token balances only," and a downline member's role is not part of that
// (a distributor's own sub-distributors would otherwise be distinguishable
// from trainers in their network, which is more than "name + balance").
type NetworkNode = {
  id: string;
  name: string;
  level: number;
  tokenBalance: string;
  children: NetworkNode[];
};

function flattenNetwork(nodes: NetworkNode[]): Omit<NetworkNode, 'children'>[] {
  return nodes.flatMap((node) => {
    const { children, ...self } = node;
    return [self, ...flattenNetwork(children)];
  });
}

// Falls back to "Member" rather than an email local-part -- a first/last
// name is fine to show (the person set it themselves for this purpose), but
// deriving a name from someone's email address leaks a fragment of their
// actual PII into a view otherwise spec'd as "name + balance only."
function displayName(user: { firstName: string | null; lastName: string | null }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || 'Member';
}

// Every DISTRIBUTOR_FUNDING_BONUS/DISTRIBUTOR_PAYOUT_BONUS ledger entry's
// reference is "<original reference>:L<level>" (see packages/db/src/
// payouts.ts's buildDistributorReferralBonuses callers) -- parsing that
// suffix back out is how the per-level breakdown is reconstructed without
// a separate level column on LedgerEntry itself.
function summarizeBonusesByLevel(entries: { amount: Prisma.Decimal; reference: string }[]) {
  const totals = new Map<number, Prisma.Decimal>();
  for (const entry of entries) {
    const match = /:L(\d+)$/.exec(entry.reference);
    const level = match ? Number(match[1]) : 0;
    totals.set(level, (totals.get(level) ?? new Decimal(0)).add(entry.amount));
  }
  return Array.from(totals.entries())
    .filter(([level]) => level > 0)
    .sort(([a], [b]) => a - b)
    .map(([level, amount]) => ({ level, amount: amount.toString() }));
}
