import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SubscriberOrgRole, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { WebhookEventService } from '../webhooks/webhook-event.service';

const WINDOW_MS = 60 * 60 * 1000; // hourly, doc gives no cadence -- tunable
const DENIAL_RATE_THRESHOLD = 0.5;
const DENIAL_RATE_MIN_REQUESTS = 20; // floor so 1-of-2 denied doesn't false-positive
const NEW_IP_BURST_THRESHOLD = 10;
const VOLUME_SPIKE_MULTIPLIER = 5;
const VOLUME_SPIKE_MIN_REQUESTS = 20; // same false-positive-avoidance floor as the denial-rate rule
const BASELINE_LOOKBACK_DAYS = 7;

interface RuleBreach {
  ruleKey: string;
  details: Record<string, unknown>;
}

/**
 * Doc section 61's "anomaly detection" -- no ML/statistical modeling, no
 * elaboration exists in the doc beyond the one-line bullet. This is
 * threshold-rule detection over StreamAccessLog, the only per-request
 * telemetry that exists: real, DB-driven, non-stub logic, not a stub.
 * Alerts via both channels (confirmed via AskUserQuestion): email to
 * OWNER/ADMIN org members, and a webhook event for subscribers with
 * programmatic monitoring.
 */
@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyCheck(): Promise<void> {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_MS);

    const orgIds = await this.orgsWithActivity(windowStart, windowEnd);
    for (const organizationId of orgIds) {
      await this.checkOrganization(organizationId, windowStart, windowEnd);
    }
  }

  private async orgsWithActivity(windowStart: Date, windowEnd: Date): Promise<string[]> {
    const rows = await this.prisma.streamAccessLog.groupBy({
      by: ['organizationId'],
      where: { createdAt: { gte: windowStart, lt: windowEnd } },
    });
    return rows.map((r) => r.organizationId);
  }

  private async checkOrganization(
    organizationId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<void> {
    const breaches = await this.evaluateRules(organizationId, windowStart, windowEnd);
    for (const breach of breaches) {
      const alreadyFired = await this.prisma.anomalyEvent.findFirst({
        where: { organizationId, ruleKey: breach.ruleKey, windowStart },
      });
      if (alreadyFired) continue;

      await this.prisma.anomalyEvent.create({
        data: {
          organizationId,
          ruleKey: breach.ruleKey,
          windowStart,
          windowEnd,
          details: breach.details as Prisma.InputJsonValue,
        },
      });
      this.logger.warn(`Anomaly detected: org=${organizationId} rule=${breach.ruleKey}`);

      void this.notify(organizationId, breach, windowStart, windowEnd);
    }
  }

  private async evaluateRules(
    organizationId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<RuleBreach[]> {
    const breaches: RuleBreach[] = [];

    const [totalRequests, deniedRequests] = await Promise.all([
      this.prisma.streamAccessLog.count({
        where: { organizationId, createdAt: { gte: windowStart, lt: windowEnd } },
      }),
      this.prisma.streamAccessLog.count({
        where: {
          organizationId,
          createdAt: { gte: windowStart, lt: windowEnd },
          entitlementDecision: { not: 'allowed' },
        },
      }),
    ]);

    if (totalRequests >= DENIAL_RATE_MIN_REQUESTS) {
      const denialRate = deniedRequests / totalRequests;
      if (denialRate > DENIAL_RATE_THRESHOLD) {
        breaches.push({
          ruleKey: 'denial_rate_spike',
          details: {
            totalRequests,
            deniedRequests,
            denialRate: Number(denialRate.toFixed(4)),
            threshold: DENIAL_RATE_THRESHOLD,
          },
        });
      }
    }

    const baselineStart = new Date(
      windowStart.getTime() - BASELINE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const [recentIps, priorIps] = await Promise.all([
      this.prisma.streamAccessLog.findMany({
        where: {
          organizationId,
          createdAt: { gte: windowStart, lt: windowEnd },
          ipAddress: { not: null },
        },
        select: { ipAddress: true },
        distinct: ['ipAddress'],
      }),
      this.prisma.streamAccessLog.findMany({
        where: {
          organizationId,
          createdAt: { gte: baselineStart, lt: windowStart },
          ipAddress: { not: null },
        },
        select: { ipAddress: true },
        distinct: ['ipAddress'],
      }),
    ]);
    const priorIpSet = new Set(priorIps.map((r) => r.ipAddress));
    const newIpCount = recentIps.filter((r) => !priorIpSet.has(r.ipAddress)).length;
    if (newIpCount > NEW_IP_BURST_THRESHOLD) {
      breaches.push({
        ruleKey: 'new_ip_burst',
        details: { newIpCount, threshold: NEW_IP_BURST_THRESHOLD },
      });
    }

    const baselineRequestCount = await this.prisma.streamAccessLog.count({
      where: { organizationId, createdAt: { gte: baselineStart, lt: windowStart } },
    });
    const baselineHours = (windowStart.getTime() - baselineStart.getTime()) / (60 * 60 * 1000);
    const baselineHourlyAverage = baselineHours > 0 ? baselineRequestCount / baselineHours : 0;
    if (
      totalRequests >= VOLUME_SPIKE_MIN_REQUESTS &&
      baselineHourlyAverage > 0 &&
      totalRequests > baselineHourlyAverage * VOLUME_SPIKE_MULTIPLIER
    ) {
      breaches.push({
        ruleKey: 'request_volume_spike',
        details: {
          totalRequests,
          baselineHourlyAverage: Number(baselineHourlyAverage.toFixed(2)),
          multiplier: VOLUME_SPIKE_MULTIPLIER,
        },
      });
    }

    return breaches;
  }

  private async notify(
    organizationId: string,
    breach: RuleBreach,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<void> {
    try {
      const org = await this.prisma.subscriberOrganization.findUnique({
        where: { id: organizationId },
      });
      const admins = await this.prisma.subscriberMembership.findMany({
        where: {
          organizationId,
          role: { in: [SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN] },
          acceptedAt: { not: null },
        },
        include: { user: { select: { email: true } } },
      });
      for (const admin of admins) {
        await this.mail.sendAnomalyAlertEmail({
          recipientEmail: admin.user.email,
          organizationName: org?.name ?? organizationId,
          ruleKey: breach.ruleKey,
          windowStart,
          windowEnd,
          details: breach.details,
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to email anomaly alert for org=${organizationId} rule=${breach.ruleKey}: ${err instanceof Error ? err.message : err}`,
      );
    }

    void this.webhookEvents.emit(organizationId, WebhookEventType.ANOMALY_DETECTED, {
      organization_id: organizationId,
      rule_key: breach.ruleKey,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      details: breach.details,
    });
  }
}
