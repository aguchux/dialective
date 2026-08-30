import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage.service';
import { RedisStreamsService } from './redis-streams/redis-streams.service';

const SMART_DECK_STREAM = process.env.SMART_DECK_STREAM ?? 'smart-deck-jobs';

interface Rule {
  id: string;
  enabled: boolean;
  countryId: string | null;
  dialectTag: string | null;
  retentionDays: number;
}

interface AudioRow {
  id: string;
  dialectTag: string;
  audioBucket: string | null;
  audioKey: string | null;
  settledAt: Date | null;
  refundedAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves the most specific enabled rule for a dialectTag (country+dialect
 * beats dialect-only beats country-only beats the fully-unscoped catch-all).
 * No matching enabled rule = null, meaning "never purge this row" -- the
 * safe default that preserves today's keep-forever behavior. See
 * schema.prisma's AudioRetentionRule doc comment for the full precedence
 * rationale.
 */
export function resolveRule(
  rules: Rule[],
  dialectTag: string,
  dialectCountryId: string | null,
): Rule | null {
  const enabled = rules.filter((r) => r.enabled);
  const matches = (r: Rule) =>
    (r.dialectTag === null || r.dialectTag === dialectTag) &&
    (r.countryId === null || r.countryId === dialectCountryId);

  const bothScoped = enabled.find(
    (r) => r.dialectTag !== null && r.countryId !== null && matches(r),
  );
  if (bothScoped) return bothScoped;
  const dialectOnly = enabled.find(
    (r) => r.dialectTag !== null && r.countryId === null && matches(r),
  );
  if (dialectOnly) return dialectOnly;
  const countryOnly = enabled.find(
    (r) => r.dialectTag === null && r.countryId !== null && matches(r),
  );
  if (countryOnly) return countryOnly;
  const catchAll = enabled.find((r) => r.dialectTag === null && r.countryId === null);
  return catchAll ?? null;
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly streams: RedisStreamsService,
  ) {}

  async run(): Promise<void> {
    const rules = await this.prisma.audioRetentionRule.findMany();
    if (rules.length === 0) {
      this.logger.log('No retention rules configured -- nothing to purge');
      return;
    }

    const dialects = await this.prisma.dialect.findMany({ select: { tag: true, countryId: true } });
    const countryIdByDialectTag = new Map(dialects.map((d) => [d.tag, d.countryId] as const));

    const [submissions, wordRecordings] = await Promise.all([
      this.prisma.submission.findMany({
        where: {
          audioKey: { not: null },
          audioDeletedAt: null,
          OR: [{ settledAt: { not: null } }, { refundedAt: { not: null } }],
        },
        select: {
          id: true,
          dialectTag: true,
          audioBucket: true,
          audioKey: true,
          settledAt: true,
          refundedAt: true,
        },
      }),
      this.prisma.wordRecording.findMany({
        where: {
          audioKey: { not: null },
          audioDeletedAt: null,
          OR: [{ settledAt: { not: null } }, { refundedAt: { not: null } }],
        },
        select: {
          id: true,
          dialectTag: true,
          audioBucket: true,
          audioKey: true,
          settledAt: true,
          refundedAt: true,
        },
      }),
    ]);

    let purged = 0;
    let skipped = 0;

    for (const row of submissions) {
      if (await this.maybePurge(row, rules, countryIdByDialectTag, 'submission')) purged++;
      else skipped++;
    }
    for (const row of wordRecordings) {
      if (await this.maybePurge(row, rules, countryIdByDialectTag, 'wordRecording')) purged++;
      else skipped++;
    }

    this.logger.log(`Retention run complete: purged=${purged} skipped=${skipped}`);
  }

  private async maybePurge(
    row: AudioRow,
    rules: Rule[],
    countryIdByDialectTag: Map<string, string | null>,
    kind: 'submission' | 'wordRecording',
  ): Promise<boolean> {
    if (!row.audioBucket || !row.audioKey) return false;

    const rule = resolveRule(
      rules,
      row.dialectTag,
      countryIdByDialectTag.get(row.dialectTag) ?? null,
    );
    if (!rule) return false;

    const terminalAt = row.settledAt ?? row.refundedAt;
    if (!terminalAt) return false;

    const cutoff = terminalAt.getTime() + rule.retentionDays * DAY_MS;
    if (Date.now() < cutoff) return false;

    try {
      await this.storage.deleteObject(row.audioBucket, row.audioKey);
    } catch (err) {
      this.logger.warn(
        `Failed to delete audio object: kind=${kind} id=${row.id} bucket=${row.audioBucket} key=${row.audioKey} err=${err}`,
      );
      return false;
    }

    const data = { audioBucket: null, audioKey: null, audioDeletedAt: new Date() };
    if (kind === 'submission') {
      await this.prisma.submission.update({ where: { id: row.id }, data });
    } else {
      await this.prisma.wordRecording.update({ where: { id: row.id }, data });
      // Only WordRecording purges matter for Stream Decks (StreamDeckItem.
      // recordingId references WordRecording.id, never Submission). Best-
      // effort, mirrors IsvpService.submit's publish pattern -- a Redis
      // outage must never fail the purge itself, since the purge is
      // already durable in Postgres and this is just a notification that
      // any Smart Deck containing this recording (or a Manual deck whose
      // version snapshot should reflect the purge) may need re-evaluation.
      try {
        await this.streams.publish(SMART_DECK_STREAM, {
          trigger: 'recording_eligible',
          recording_id: row.id,
        });
      } catch (err) {
        this.logger.error(
          `Failed to publish smart-deck-jobs for recording=${row.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return true;
  }
}
