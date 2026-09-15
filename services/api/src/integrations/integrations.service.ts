import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { INTEGRATION_REGISTRY } from './integration-registry';
import { ListIntegrationsDto, UpdateIntegrationDto } from './dto/integrations.dto';

/**
 * "P2P & Integrations" marketplace catalog -- rows are synced from the
 * code-defined INTEGRATION_REGISTRY on boot (syncRegistry), never
 * admin-created. Admin's only write access is the gate on an existing row
 * (enabled/feeTokenAmount/sortOrder); name/description/category/iconKey
 * always come from the registry, refreshed on every boot so a copy edit in
 * code reaches the DB without a manual admin step. Subscribing is a simple
 * opt-in (no approval workflow); it's a prerequisite for claiming/fulfilling
 * requests on a given integration, not for browsing the catalog itself.
 */
@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncRegistry();
  }

  /**
   * Upserts every INTEGRATION_REGISTRY entry's display metadata into the
   * `integrations` table, creating a row (disabled by default, at its
   * registry default fee) the first time a slug appears in code. Never
   * touches enabled/feeTokenAmount/sortOrder on an existing row -- those
   * are the admin's gate, not something a deploy should silently reset.
   * Never deletes a row for a slug removed from the registry (a live row
   * may still have subscriptions/history; removing the feature from code
   * without a data-migration decision is out of scope here).
   */
  async syncRegistry(): Promise<void> {
    for (const definition of INTEGRATION_REGISTRY) {
      await this.prisma.integration.upsert({
        where: { slug: definition.slug },
        create: {
          slug: definition.slug,
          name: definition.name,
          description: definition.description,
          category: definition.category,
          iconKey: definition.iconKey,
          feeTokenAmount: definition.defaultFeeTokenAmount,
          sortOrder: definition.defaultSortOrder,
          maxConcurrentClaims: definition.defaultMaxConcurrentClaims,
          codeValidityMinutes: definition.defaultCodeValidityMinutes,
        },
        update: {
          name: definition.name,
          description: definition.description,
          category: definition.category,
          iconKey: definition.iconKey,
        },
      });
    }
    this.logger.log(`Synced ${INTEGRATION_REGISTRY.length} integration(s) from the registry`);
  }

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

  /**
   * Admin's only write path -- gates an existing (registry-created) row.
   * enabled/feeTokenAmount/maxConcurrentClaims/sortOrder only; name/
   * description/category/iconKey are never admin-editable, they come from
   * the registry (see UpdateIntegrationDto).
   */
  async update(id: string, dto: UpdateIntegrationDto) {
    const existing = await this.prisma.integration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integration not found');
    const row = await this.prisma.integration.update({
      where: { id },
      data: {
        enabled: dto.enabled,
        feeTokenAmount: dto.feeTokenAmount,
        maxConcurrentClaims: dto.maxConcurrentClaims,
        codeValidityMinutes: dto.codeValidityMinutes,
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
    maxConcurrentClaims: number;
    codeValidityMinutes: number;
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
      maxConcurrentClaims: row.maxConcurrentClaims,
      codeValidityMinutes: row.codeValidityMinutes,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
