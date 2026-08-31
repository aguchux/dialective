import { Injectable } from '@nestjs/common';
import { ActivityEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ROWS = 5_000;

export interface ActivityExportFilters {
  eventType?: ActivityEventType;
  from?: Date;
  to?: Date;
}

/** Org-activity timeline export -- who did what, when (org_activity_events, written by org-activity.service.ts). */
@Injectable()
export class ActivityExportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string, filters: ActivityExportFilters) {
    const rows = await this.prisma.orgActivityEvent.findMany({
      where: {
        organizationId,
        ...(filters.eventType ? { eventType: filters.eventType } : {}),
        ...(filters.from || filters.to
          ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });

    return {
      rows: rows.map((row) => ({
        createdAt: row.createdAt,
        eventType: row.eventType,
        actorUserId: row.actorUserId,
        metadata: row.metadata,
      })),
    };
  }
}
