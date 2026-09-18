import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { IntegrationSubscriptionStatus, Prisma } from '@dialectiva/db';
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
        select: { integrationId: true, status: true },
      }),
    ]);
    const statusByIntegration = new Map(
      subscriptions.map((s) => [s.integrationId, s.status] as const),
    );
    return rows.map((row) => this.toPublic(row, statusByIntegration.get(row.id) ?? null));
  }

  async listMine(userId: string) {
    const subscriptions = await this.prisma.integrationSubscription.findMany({
      where: { userId },
      include: { integration: true },
      orderBy: { subscribedAt: 'desc' },
    });
    return subscriptions.map((s) => this.toPublic(s.integration, s.status));
  }

  /**
   * Request access. This does NOT grant it -- the row lands PENDING and an
   * admin decides (see reviewSubscription).
   *
   * Re-requesting after a rejection is allowed and resets the row to
   * PENDING, clearing the previous decision: a member who fixes whatever
   * caused the decline should not have to be deleted to try again. An
   * existing PENDING or APPROVED row is returned as-is, so a double-tap
   * cannot reset an approval back to pending.
   */
  async subscribe(userId: string, integrationId: string) {
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration || !integration.enabled) {
      throw new NotFoundException('Integration not found');
    }
    const existing = await this.prisma.integrationSubscription.findUnique({
      where: { integrationId_userId: { integrationId, userId } },
    });
    if (existing && existing.status !== IntegrationSubscriptionStatus.REJECTED) {
      return this.toPublic(integration, existing.status);
    }
    if (existing) {
      const reopened = await this.prisma.integrationSubscription.update({
        where: { id: existing.id },
        data: {
          status: IntegrationSubscriptionStatus.PENDING,
          subscribedAt: new Date(),
          reviewedAt: null,
          reviewedByAdminId: null,
          reviewNote: null,
        },
      });
      return this.toPublic(integration, reopened.status);
    }
    try {
      const created = await this.prisma.integrationSubscription.create({
        data: { integrationId, userId },
      });
      return this.toPublic(integration, created.status);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Raced with another request for the same pair -- read it back.
        const row = await this.prisma.integrationSubscription.findUnique({
          where: { integrationId_userId: { integrationId, userId } },
        });
        return this.toPublic(integration, row?.status ?? IntegrationSubscriptionStatus.PENDING);
      }
      throw err;
    }
  }

  async unsubscribe(userId: string, integrationId: string) {
    await this.prisma.integrationSubscription.deleteMany({ where: { integrationId, userId } });
    return { unsubscribed: true };
  }

  /**
   * The single access gate every integration consumer goes through.
   *
   * Only an APPROVED subscription grants access. A PENDING row means the
   * member asked and an admin has not decided yet, which is emphatically
   * not access -- fulfilling an integration means handling other members'
   * identity documents and being paid for it.
   */
  async isSubscribed(userId: string, slug: string): Promise<boolean> {
    const count = await this.prisma.integrationSubscription.count({
      where: {
        userId,
        integration: { slug },
        status: IntegrationSubscriptionStatus.APPROVED,
      },
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
    const rows = await this.prisma.integration.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      // Surfaces where the work is, so an admin sees which integration has
      // people waiting without opening each one.
      include: {
        _count: {
          select: {
            subscriptions: { where: { status: IntegrationSubscriptionStatus.PENDING } },
          },
        },
      },
    });
    return rows.map((row) => ({
      ...this.toAdminPublic(row),
      pendingSubscriptionCount: row._count.subscriptions,
    }));
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

  /**
   * Every access request, newest-pending first -- the admin queue. Pending
   * sorts ahead of decided rows so the work to do is always at the top.
   */
  async listSubscriptionsForAdmin(status?: IntegrationSubscriptionStatus, slug?: string) {
    const rows = await this.prisma.integrationSubscription.findMany({
      where: {
        ...(status ? { status } : {}),
        // Scoped by integration when the admin is looking at one, so the
        // per-integration page does not page through everyone else's.
        ...(slug ? { integration: { slug } } : {}),
      },
      include: {
        integration: { select: { id: true, slug: true, name: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: [{ status: 'asc' }, { subscribedAt: 'desc' }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      subscribedAt: row.subscribedAt,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
      integration: row.integration,
      user: row.user,
    }));
  }

  /**
   * Approve or reject an access request.
   *
   * Approving is what actually grants access -- isSubscribed accepts only
   * APPROVED. Rejecting leaves the row in place rather than deleting it, so
   * the member can see they were declined and why, and the decision is not
   * silently lost if they ask again.
   */
  async reviewSubscription(
    adminId: string,
    subscriptionId: string,
    decision: 'approve' | 'reject',
    reviewNote?: string,
  ) {
    const existing = await this.prisma.integrationSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!existing) throw new NotFoundException('Subscription request not found');
    const row = await this.prisma.integrationSubscription.update({
      where: { id: subscriptionId },
      data: {
        status:
          decision === 'approve'
            ? IntegrationSubscriptionStatus.APPROVED
            : IntegrationSubscriptionStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
        reviewNote: reviewNote ?? null,
      },
      include: {
        integration: { select: { id: true, slug: true, name: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    this.logger.log(
      `Integration access ${decision}d: admin=${adminId} user=${row.userId} integration=${row.integration.slug}`,
    );
    return {
      id: row.id,
      status: row.status,
      subscribedAt: row.subscribedAt,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
      integration: row.integration,
      user: row.user,
    };
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
    subscriptionStatus: IntegrationSubscriptionStatus | null,
  ) {
    return {
      id: integration.id,
      slug: integration.slug,
      name: integration.name,
      description: integration.description,
      category: integration.category,
      iconKey: integration.iconKey,
      feeTokenAmount: integration.feeTokenAmount.toString(),
      /**
       * Kept meaning "has access", so every existing consumer of this flag
       * stays correct now that requesting and being granted are different
       * things. subscriptionStatus carries the finer detail the UI needs to
       * distinguish "awaiting approval" from "not requested".
       */
      subscribed: subscriptionStatus === IntegrationSubscriptionStatus.APPROVED,
      subscriptionStatus,
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
