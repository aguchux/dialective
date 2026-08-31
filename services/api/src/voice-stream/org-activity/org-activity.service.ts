import { Injectable, Logger } from '@nestjs/common';
import { ActivityEventType, Prisma } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Phase 4b's org-activity audit timeline -- who did what, when. No prior
 * audit-log model existed anywhere in this codebase before this phase, so
 * this is genuinely new infrastructure, not an extension of an existing
 * pattern. Best-effort, mirrors WebhookEventService.emit's posture: a
 * failure to record an audit event must never fail the actual action it's
 * recording (the action already happened and is already durable).
 */
@Injectable()
export class OrgActivityService {
  private readonly logger = new Logger(OrgActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    organizationId: string,
    eventType: ActivityEventType,
    actorUserId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.orgActivityEvent.create({
        data: {
          organizationId,
          eventType,
          actorUserId,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record activity event=${eventType} for org=${organizationId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
