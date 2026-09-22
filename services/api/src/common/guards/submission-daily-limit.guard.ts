import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "in 3 hours" / "in 25 minutes" -- so a blocked trainer knows when to come back. */
function formatResumeWindow(msUntilResume: number): string {
  const minutes = Math.ceil(msUntilResume / 60_000);
  if (minutes <= 1) return 'in a minute';
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'in an hour' : `in ${hours} hours`;
}

/**
 * Per-trainer DAILY submission cap, sitting alongside
 * SubmissionRateLimitGuard's per-hour burst limit. The hourly limit stops
 * a scripted spike; this one stops a sustained day-long run, which is
 * what actually governs the rate at which DL is minted.
 *
 * Counts real WordRecording rows over a rolling 24h rather than using
 * @nestjs/throttler's in-memory buckets, deliberately:
 *
 *   - a 24h throttler bucket does not survive a pod restart or a Redis
 *     eviction, so the cap would silently reset and the limit would be
 *     unenforceable exactly when traffic is heaviest;
 *   - an admin investigating a refusal can reproduce this count with a
 *     single SQL query, which they cannot do against a throttler bucket;
 *   - the rolling window is honest. A calendar-day cap lets a trainer
 *     submit a full day's allowance at 23:59 and again at 00:01.
 *
 * The cost is one indexed COUNT per submission. That is acceptable here
 * because this route already does considerably more work per call
 * (wallet debit inside a transaction, row insert, ASR enqueue).
 *
 * Off by default (submissionDailyLimitEnabled) and independent of the
 * hourly toggle, so an admin can run either, both, or neither.
 */
@Injectable()
export class SubmissionDailyLimitGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { enabled, perDay } = await this.platformSettings.getSubmissionDailyLimit();
    if (!enabled) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;
    // Every route this guards runs behind JwtAuthGuard, so a missing sub
    // means something is wrong with the guard ordering rather than with
    // the caller -- fail open rather than block a legitimate trainer over
    // a wiring mistake. The hourly guard falls back to req.ip for the
    // same reason.
    if (!userId) return true;

    const since = new Date(Date.now() - DAY_MS);
    const used = await this.prisma.wordRecording.count({
      where: { userId, createdAt: { gte: since } },
    });

    if (used < perDay) return true;

    // When the cap clears = when the oldest submission inside the window
    // falls out of it. Reported rather than a flat "try tomorrow", which
    // would be wrong for a rolling window.
    const oldest = await this.prisma.wordRecording.findFirst({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const resumesIn = oldest
      ? formatResumeWindow(oldest.createdAt.getTime() + DAY_MS - Date.now())
      : 'in a few hours';

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `You've reached today's limit of ${perDay} recordings. You can record again ${resumesIn}.`,
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
