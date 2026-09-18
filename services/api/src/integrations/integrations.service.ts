import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IntegrationSubscriptionStatus, KycStatus, Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  INTEGRATION_REGISTRY,
  IntegrationEligibilityRule,
} from './integration-registry';
import { ListIntegrationsDto, UpdateIntegrationDto } from './dto/integrations.dto';

/** What a member must have to request access, and whether they have it. */
export interface IntegrationEligibility {
  eligible: boolean;
  /** Human-readable, in the order they are listed on the card. */
  requirements: { label: string; met: boolean }[];
}

/** The subset of User the eligibility rules read. */
interface EligibilityFacts {
  phoneVerified: boolean;
  kycApproved: boolean;
  taskCount: number;
}

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

  /**
   * Loads the handful of User facts the eligibility rules read. Task count
   * is the lifetime word-recording count, the same measure the admin users
   * list and the audit-hold queue already use for "how much work has this
   * member done".
   */
  private async loadEligibilityFacts(userId: string): Promise<EligibilityFacts> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        phoneVerifiedAt: true,
        kycStatus: true,
        _count: { select: { wordRecordings: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      phoneVerified: user.phoneVerifiedAt !== null,
      kycApproved: user.kycStatus === KycStatus.APPROVED,
      taskCount: user._count.wordRecordings,
    };
  }

  /**
   * Evaluates one integration's rule against a member's facts. Returns
   * every requirement, met or not, rather than only the failures: the
   * marketplace card shows the whole bar up front so a member knows what
   * they are working toward instead of discovering it one rejection at a
   * time.
   */
  private evaluateEligibility(
    rule: IntegrationEligibilityRule,
    facts: EligibilityFacts,
  ): IntegrationEligibility {
    const requirements: { label: string; met: boolean }[] = [];
    if (rule.requirePhoneVerified) {
      requirements.push({ label: 'Verified phone number', met: facts.phoneVerified });
    }
    if (rule.requireKycApproved) {
      requirements.push({ label: 'Approved KYC', met: facts.kycApproved });
    }
    if (rule.minTasks && rule.minTasks > 0) {
      requirements.push({
        label: `${rule.minTasks} completed tasks (you have ${facts.taskCount})`,
        met: facts.taskCount >= rule.minTasks,
      });
    }
    return { eligible: requirements.every((r) => r.met), requirements };
  }

  /** The rule for a slug, or an empty (open to all) rule for an unknown one. */
  private ruleFor(slug: string): IntegrationEligibilityRule {
    return INTEGRATION_REGISTRY.find((d) => d.slug === slug)?.eligibility ?? {};
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

    const [rows, subscriptions, facts] = await Promise.all([
      this.prisma.integration.findMany({ where, orderBy: [orderBy, { name: 'asc' }] }),
      this.prisma.integrationSubscription.findMany({
        where: { userId },
        select: { integrationId: true, status: true },
      }),
      this.loadEligibilityFacts(userId),
    ]);
    const statusByIntegration = new Map(
      subscriptions.map((s) => [s.integrationId, s.status] as const),
    );
    return rows.map((row) =>
      this.toPublic(
        row,
        statusByIntegration.get(row.id) ?? null,
        this.evaluateEligibility(this.ruleFor(row.slug), facts),
      ),
    );
  }

  async listMine(userId: string) {
    const [subscriptions, facts] = await Promise.all([
      this.prisma.integrationSubscription.findMany({
        where: { userId },
        include: { integration: true },
        orderBy: { subscribedAt: 'desc' },
      }),
      this.loadEligibilityFacts(userId),
    ]);
    return subscriptions.map((s) =>
      this.toPublic(
        s.integration,
        s.status,
        this.evaluateEligibility(this.ruleFor(s.integration.slug), facts),
      ),
    );
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
   *
   * Gated by the integration's eligibility rule (see integration-registry):
   * a member who does not meet the bar cannot get as far as the admin
   * queue, so the admin's list only ever contains people who could
   * legitimately be approved.
   */
  async subscribe(userId: string, integrationId: string) {
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration || !integration.enabled) {
      throw new NotFoundException('Integration not found');
    }
    const existing = await this.prisma.integrationSubscription.findUnique({
      where: { integrationId_userId: { integrationId, userId } },
    });
    // Only a new or previously-rejected request is gated. An already
    // pending/approved member is not re-gated by a rule that tightened
    // after the fact -- withdrawing access is the admin's call, not a
    // silent side effect.
    const facts = await this.loadEligibilityFacts(userId);
    const eligibility = this.evaluateEligibility(this.ruleFor(integration.slug), facts);
    if (existing && existing.status !== IntegrationSubscriptionStatus.REJECTED) {
      return this.toPublic(integration, existing.status, eligibility);
    }
    if (!eligibility.eligible) {
      const missing = eligibility.requirements.filter((r) => !r.met).map((r) => r.label);
      throw new UnprocessableEntityException(
        `You need ${missing.join(', ')} before you can request access to ${integration.name}.`,
      );
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
      return this.toPublic(integration, reopened.status, eligibility);
    }
    try {
      const created = await this.prisma.integrationSubscription.create({
        data: { integrationId, userId },
      });
      return this.toPublic(integration, created.status, eligibility);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Raced with another request for the same pair -- read it back.
        const row = await this.prisma.integrationSubscription.findUnique({
          where: { integrationId_userId: { integrationId, userId } },
        });
        return this.toPublic(
          integration,
          row?.status ?? IntegrationSubscriptionStatus.PENDING,
          eligibility,
        );
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
  /**
   * Whether this member is a certified (staff-grade) reviewer for the
   * integration. Requires APPROVED as well as the flag, so revoking
   * approval revokes certification with it rather than leaving a
   * certified-but-unapproved row quietly privileged.
   */
  async isCertified(userId: string, slug: string): Promise<boolean> {
    const count = await this.prisma.integrationSubscription.count({
      where: {
        userId,
        integration: { slug },
        status: IntegrationSubscriptionStatus.APPROVED,
        certified: true,
      },
    });
    return count > 0;
  }

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
        // The same facts the eligibility gate reads, so an admin reviewing
        // a request sees what the member actually brings rather than only
        // a name and a date.
        user: { select: IntegrationsService.ADMIN_SUBSCRIPTION_USER_SELECT },
      },
      orderBy: [{ status: 'asc' }, { subscribedAt: 'desc' }],
      take: 500,
    });
    return rows.map((row) => this.toAdminSubscription(row));
  }

  /**
   * Shapes one admin-queue row. Shared by the list and by the two decision
   * endpoints, so an approve/certify response replaces the row in the
   * table with the same shape it had rather than blanking the member's
   * details.
   */
  private toAdminSubscription(row: {
    id: string;
    status: IntegrationSubscriptionStatus;
    subscribedAt: Date;
    reviewedAt: Date | null;
    reviewNote: string | null;
    certified: boolean;
    certifiedAt: Date | null;
    integration: { id: string; slug: string; name: string };
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      phoneNumber: string | null;
      phoneVerifiedAt: Date | null;
      kycStatus: KycStatus;
      _count: { wordRecordings: number };
    };
  }) {
    return {
      id: row.id,
      status: row.status,
      subscribedAt: row.subscribedAt,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
      certified: row.certified,
      certifiedAt: row.certifiedAt,
      integration: row.integration,
      user: {
        id: row.user.id,
        email: row.user.email,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
        phoneNumber: row.user.phoneNumber,
        phoneVerified: row.user.phoneVerifiedAt !== null,
        kycStatus: row.user.kycStatus,
        taskCount: row.user._count.wordRecordings,
      },
    };
  }

  /** The user selection toAdminSubscription needs, shared by all three queries. */
  private static readonly ADMIN_SUBSCRIPTION_USER_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phoneNumber: true,
    phoneVerifiedAt: true,
    kycStatus: true,
    _count: { select: { wordRecordings: true } },
  } as const;

  /**
   * Approve or reject an access request.
   *
   * Approving is what actually grants access -- isSubscribed accepts only
   * APPROVED. Rejecting leaves the row in place rather than deleting it, so
   * the member can see they were declined and why, and the decision is not
   * silently lost if they ask again.
   */
  /**
   * Grant or withdraw certified (staff-grade) status.
   *
   * Only ever on an APPROVED row: certifying someone who has not been
   * approved would hand them the larger privilege while they still lack
   * the smaller one.
   */
  async setSubscriptionCertified(adminId: string, subscriptionId: string, certified: boolean) {
    const existing = await this.prisma.integrationSubscription.findUnique({
      where: { id: subscriptionId },
      include: { integration: { select: { slug: true } } },
    });
    if (!existing) throw new NotFoundException('Subscription request not found');
    if (certified && existing.status !== IntegrationSubscriptionStatus.APPROVED) {
      throw new UnprocessableEntityException(
        'Approve this member before certifying them',
      );
    }
    const row = await this.prisma.integrationSubscription.update({
      where: { id: subscriptionId },
      data: {
        certified,
        certifiedAt: certified ? new Date() : null,
        certifiedByAdminId: certified ? adminId : null,
      },
      include: {
        integration: { select: { id: true, slug: true, name: true } },
        user: { select: IntegrationsService.ADMIN_SUBSCRIPTION_USER_SELECT },
      },
    });
    this.logger.warn(
      `Integration certification ${certified ? 'GRANTED' : 'REVOKED'}: admin=${adminId} user=${row.userId} integration=${row.integration.slug}`,
    );
    return this.toAdminSubscription(row);
  }

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
        user: { select: IntegrationsService.ADMIN_SUBSCRIPTION_USER_SELECT },
      },
    });
    this.logger.log(
      `Integration access ${decision}d: admin=${adminId} user=${row.userId} integration=${row.integration.slug}`,
    );
    return this.toAdminSubscription(row);
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
    eligibility: IntegrationEligibility,
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
      /**
       * Whether this member may request access at all, and the full bar
       * either way -- the card shows what is required before they try.
       */
      eligible: eligibility.eligible,
      eligibilityRequirements: eligibility.requirements,
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
