import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ROWS = 1_000;

/** Past AnomalyEvent rows for the org's dashboard -- operational, not commercial reporting, but reuses respondJsonOrCsv anyway for consistency. */
@Injectable()
export class AnomalyEventsReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string) {
    const rows = await this.prisma.anomalyEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });

    return {
      rows: rows.map((row) => ({
        createdAt: row.createdAt,
        ruleKey: row.ruleKey,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
        details: row.details,
      })),
    };
  }
}
