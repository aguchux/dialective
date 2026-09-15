import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationDto, ListIntegrationsDto, UpdateIntegrationDto } from './dto/integrations.dto';

/**
 * "P2P & Integrations" marketplace catalog -- admin-managed rows so new
 * peer-fulfilled products (WhatsApp Validator today, others later) can be
 * added/gated/repriced without a schema change. Subscribing is a simple
 * opt-in (no approval workflow); it's a prerequisite for claiming/fulfilling
 * requests on a given integration, not for browsing the catalog itself.
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public-facing list -- disabled integrations are excluded here (see listAllForAdmin for the unfiltered admin view). */
  async list(userId: string, query: ListIntegrationsDto) {
    const search = query.search?.trim();
    const where: Prisma.IntegrationWhereInput = {
      enabled: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
              { category: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? 'sortOrder';
    const sortDir = query.sortDir ?? 'asc';
    const orderBy: Prisma.IntegrationOrderByWithRelationInput =
      sortBy === 'sortOrder' ? { sortOrder: sortDir } : { [sortBy]: sortDir };

    const [rows, subscriptions] = await Promise.all([
      this.prisma.integration.findMany({ where, orderBy: [orderBy, { name: 'asc' }] }),
      this.prisma.integrationSubscription.findMany({
        where: { userId },
        select: { integrationId: true },
      }),
    ]);
    const subscribedIds = new Set(subscriptions.map((s) => s.integrationId));
    return rows.map((row) => this.toPublic(row, subscribedIds.has(row.id)));
  }

  async listMine(userId: string) {
    const subscriptions = await this.prisma.integrationSubscription.findMany({
      where: { userId },
      include: { integration: true },
      orderBy: { subscribedAt: 'desc' },
    });
    return subscriptions.map((s) => this.toPublic(s.integration, true));
  }

  async subscribe(userId: string, integrationId: string) {
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration || !integration.enabled) {
      throw new NotFoundException('Integration not found');
    }
    try {
      await this.prisma.integrationSubscription.create({
        data: { integrationId, userId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Already subscribed -- idempotent, not an error.
        return this.toPublic(integration, true);
      }
      throw err;
    }
    return this.toPublic(integration, true);
  }

  async unsubscribe(userId: string, integrationId: string) {
    await this.prisma.integrationSubscription.deleteMany({ where: { integrationId, userId } });
    return { unsubscribed: true };
  }

  async isSubscribed(userId: string, slug: string): Promise<boolean> {
    const count = await this.prisma.integrationSubscription.count({
      where: { userId, integration: { slug } },
    });
    return count > 0;
  }

  /** Looks up the admin-configured gate/fee for a given integration by its stable slug -- the single source of truth WhatsAppValidatorService (and any future integration) reads before allowing a request/claim. */
  async requireEnabled(slug: string) {
    const integration = await this.prisma.integration.findUnique({ where: { slug } });
    if (!integration || !integration.enabled) {
      throw new NotFoundException(`Integration "${slug}" is not available`);
    }
    return integration;
  }

  // --- Admin -----------------------------------------------------------------

  async listAllForAdmin() {
    const rows = await this.prisma.integration.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((row) => this.toAdminPublic(row));
  }

  async create(dto: CreateIntegrationDto) {
    try {
      const row = await this.prisma.integration.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          description: dto.description,
          category: dto.category,
          iconKey: dto.iconKey,
          enabled: dto.enabled ?? false,
          feeTokenAmount: dto.feeTokenAmount ?? 0,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      return this.toAdminPublic(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An integration with this slug already exists');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateIntegrationDto) {
    const existing = await this.prisma.integration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integration not found');
    const row = await this.prisma.integration.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        iconKey: dto.iconKey,
        enabled: dto.enabled,
        feeTokenAmount: dto.feeTokenAmount,
        sortOrder: dto.sortOrder,
      },
    });
    return this.toAdminPublic(row);
  }

  private toPublic(
    integration: {
      id: string;
      slug: string;
      name: string;
      description: string;
      category: string;
      iconKey: string | null;
      feeTokenAmount: Prisma.Decimal;
    },
    subscribed: boolean,
  ) {
    return {
      id: integration.id,
      slug: integration.slug,
      name: integration.name,
      description: integration.description,
      category: integration.category,
      iconKey: integration.iconKey,
      feeTokenAmount: integration.feeTokenAmount.toString(),
      subscribed,
    };
  }

  private toAdminPublic(row: {
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    iconKey: string | null;
    enabled: boolean;
    feeTokenAmount: Prisma.Decimal;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      iconKey: row.iconKey,
      enabled: row.enabled,
      feeTokenAmount: row.feeTokenAmount.toString(),
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
