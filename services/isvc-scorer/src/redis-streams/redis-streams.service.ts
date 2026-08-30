import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const MAX_DELIVERY_ATTEMPTS = 3;
const RECLAIM_IDLE_MS = 5 * 60 * 1000;

export interface StreamMessage {
  id: string;
  data: Record<string, string>;
}

export type StreamHandler = (message: StreamMessage) => Promise<void>;

/**
 * Thin wrapper around ioredis for Redis Streams produce/consume with
 * consumer groups, plus the retry/DLQ pattern required by AGENTS.md
 * ("Redis Streams reliability"): reclaim stuck pending entries, dead-letter
 * after MAX_DELIVERY_ATTEMPTS. Nest has no first-party Redis Streams
 * transport, so every service wraps this instead of hand-rolling XADD/
 * XREADGROUP calls inline.
 */
@Injectable()
export class RedisStreamsService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamsService.name);
  private readonly redis: Redis;
  private consuming = false;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'redis',
      port: Number(process.env.REDIS_PORT ?? 6379),
    });
  }

  async onModuleDestroy() {
    this.consuming = false;
    await this.redis.quit();
  }

  async publish(stream: string, data: Record<string, string>): Promise<string | null> {
    const fields = Object.entries(data).flat();
    return this.redis.xadd(stream, '*', ...fields);
  }

  async ensureGroup(stream: string, group: string): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (err) {
      if (!(err as Error).message.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  /**
   * Runs a consumer-group read loop until the module shuts down. Also
   * periodically reclaims stuck pending entries and dead-letters messages
   * past MAX_DELIVERY_ATTEMPTS, per the shared reliability contract.
   */
  async consume(
    stream: string,
    group: string,
    consumerName: string,
    handler: StreamHandler,
  ): Promise<void> {
    await this.ensureGroup(stream, group);
    this.consuming = true;

    while (this.consuming) {
      await this.reclaimStuckEntries(stream, group, consumerName, handler);

      const entries = await this.redis.xreadgroup(
        'GROUP',
        group,
        consumerName,
        'COUNT',
        10,
        'BLOCK',
        5000,
        'STREAMS',
        stream,
        '>',
      );
      if (!entries) continue;

      for (const [, messages] of entries as [string, [string, string[]][]][]) {
        for (const [id, fields] of messages) {
          await this.handleMessage(stream, group, id, fields, handler);
        }
      }
    }
  }

  private async handleMessage(
    stream: string,
    group: string,
    id: string,
    fields: string[],
    handler: StreamHandler,
  ): Promise<void> {
    const data = this.fieldsToObject(fields);
    try {
      await handler({ id, data });
      await this.redis.xack(stream, group, id);
    } catch (err) {
      this.logger.error(`Handler failed for ${stream} ${id}: ${(err as Error).message}`);
      // Left un-acked; reclaimStuckEntries will retry or dead-letter it.
    }
  }

  private async reclaimStuckEntries(
    stream: string,
    group: string,
    consumerName: string,
    handler: StreamHandler,
  ): Promise<void> {
    const [, claimed] = (await this.redis.xautoclaim(
      stream,
      group,
      consumerName,
      RECLAIM_IDLE_MS,
      '0-0',
      'COUNT',
      10,
    )) as [string, [string, string[]][], string[]];

    for (const [id, fields] of claimed) {
      const pending = (await this.redis.xpending(stream, group, id, id, 1)) as unknown[];
      const first = pending[0] as unknown[] | undefined;
      const deliveryCount = first ? Number(first[3]) : 1;

      if (deliveryCount > MAX_DELIVERY_ATTEMPTS) {
        await this.deadLetter(stream, group, id, fields, 'max_delivery_attempts_exceeded');
        continue;
      }

      await this.handleMessage(stream, group, id, fields, handler);
    }
  }

  private async deadLetter(
    stream: string,
    group: string,
    id: string,
    fields: string[],
    reason: string,
  ): Promise<void> {
    const data = this.fieldsToObject(fields);
    this.logger.warn(`Dead-lettering ${stream} ${id}: ${reason}`);
    await this.redis.xadd(`${stream}-dead`, '*', ...Object.entries({ ...data, reason }).flat());
    await this.redis.xack(stream, group, id);
  }

  private fieldsToObject(fields: string[]): Record<string, string> {
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }
    return data;
  }
}
