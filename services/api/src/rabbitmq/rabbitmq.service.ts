import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import * as amqp from 'amqplib';

const SMOKE_TEST_QUEUE = 'smoke-test';
const SMOKE_TEST_TIMEOUT_MS = 5000;

export type QueueHandler = (content: Buffer) => Promise<void>;

/**
 * Thin, generic wrapper around amqplib for RabbitMQ produce/consume --
 * mirrors RedisStreamsService's shape (connect once, publish/consume by
 * name, ack-on-success/nack-on-failure) so callers already familiar with
 * that pattern can pick this up without relearning anything. This is
 * deliberately NOT wired to any real workload: per AGENTS.md, RabbitMQ
 * stays idle infrastructure until a job genuinely needs one of its three
 * documented triggers (priority queues, distinct worker-pool routing, or
 * Redis Streams' DIY retry/DLQ becoming a real operational pain point) --
 * see RedisStreamsService for the pipeline currently in production use.
 * This module exists so that when such a workload shows up, connecting to
 * it is "declare a queue and a handler," not "stand up the client from
 * scratch."
 *
 * Reconnection: unlike ioredis, amqplib's client does not auto-reconnect on
 * a dropped connection. connect() is called lazily on first use and the
 * resulting channel is reused; a connection-level error clears the cached
 * promise so the next call re-establishes it. There is no consumer-side
 * retry/backoff loop here (nothing consumes yet) -- add one alongside the
 * first real consumer, matching whatever redelivery/backoff policy that
 * workload actually needs rather than guessing one now.
 */
@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connectionPromise: Promise<amqp.ChannelModel> | null = null;
  private channelPromise: Promise<amqp.Channel> | null = null;

  // Mirrors buildRedisConnectionOptions' REDIS_TLS pattern: RABBITMQ_TLS is
  // optional and independently toggleable, used only for the external
  // LoadBalancer path a GCP-hosted `api` pod connects through (see
  // k8s/base/rabbitmq-external.yaml) -- in-cluster traffic stays plain AMQP
  // to the cluster-internal `rabbitmq` hostname, same private network, no
  // cert needed. RABBITMQ_TLS_CA points at the self-signed cert's mounted
  // path (same self-signed-cert posture as REDIS_TLS_CA) since the server
  // isn't presenting a publicly-trusted certificate.
  private get url(): string {
    const host = process.env.RABBITMQ_HOST ?? 'rabbitmq';
    const port = process.env.RABBITMQ_PORT ?? (process.env.RABBITMQ_TLS === 'true' ? '5671' : '5672');
    const username = process.env.RABBITMQ_USERNAME;
    const password = process.env.RABBITMQ_PASSWORD;
    const vhost = encodeURIComponent(process.env.RABBITMQ_VHOST ?? '/dialectiva');
    if (!username || !password) {
      throw new Error('RABBITMQ_USERNAME/RABBITMQ_PASSWORD are not set');
    }
    const scheme = process.env.RABBITMQ_TLS === 'true' ? 'amqps' : 'amqp';
    return `${scheme}://${username}:${password}@${host}:${port}/${vhost}`;
  }

  // socketOptions, not connection options -- amqplib forwards this object
  // straight to Node's tls.connect() for an amqps:// URL.
  private get socketOptions(): { ca: Buffer[] } | undefined {
    if (process.env.RABBITMQ_TLS !== 'true') {
      return undefined;
    }
    const caPath = process.env.RABBITMQ_TLS_CA;
    return caPath ? { ca: [readFileSync(caPath)] } : undefined;
  }

  private async getChannel(): Promise<amqp.Channel> {
    if (!this.channelPromise) {
      this.connectionPromise = amqp.connect(this.url, this.socketOptions);
      this.channelPromise = this.connectionPromise.then(async (connection) => {
        connection.on('error', (err) => {
          this.logger.error(`RabbitMQ connection error: ${err.message}`);
          this.connectionPromise = null;
          this.channelPromise = null;
        });
        connection.on('close', () => {
          this.connectionPromise = null;
          this.channelPromise = null;
        });
        return connection.createChannel();
      });
    }
    return this.channelPromise;
  }

  async onModuleDestroy() {
    const connection = await this.connectionPromise?.catch(() => null);
    await connection?.close().catch(() => undefined);
    this.connectionPromise = null;
    this.channelPromise = null;
  }

  /** Declares (idempotently) a durable queue and publishes a persistent message to it. */
  async publish(queue: string, data: Record<string, unknown>): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), { persistent: true });
  }

  /**
   * Registers a consumer for a durable queue. Acks on handler success, nacks
   * with requeue on failure (no dead-letter policy configured yet -- add one
   * alongside the first real consumer once its redelivery needs are known).
   * Runs for the lifetime of the channel; does not block the caller.
   */
  async consume(queue: string, handler: QueueHandler): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, { durable: true });
    await channel.consume(queue, (message) => {
      if (!message) return;
      handler(message.content)
        .then(() => channel.ack(message))
        .catch((err) => {
          this.logger.error(`Handler failed for queue=${queue}: ${(err as Error).message}`);
          channel.nack(message, false, true);
        });
    });
  }

  /**
   * Publishes a uniquely-tokened message to a throwaway queue and waits to
   * consume it back, proving the full connect -> publish -> consume -> ack
   * round trip against the real broker. Not a permanent workload -- exists
   * so "is RabbitMQ actually wired up" has a real answer instead of "the
   * client class exists." See RabbitMqController for the admin-only route
   * that calls this.
   */
  async smokeTest(): Promise<{ ok: true; roundTripMs: number }> {
    const token = randomUUID();
    const startedAt = Date.now();
    const channel = await this.getChannel();
    // RabbitMQ 4.x's transient_nonexcl_queues feature flag is off by
    // default (confirmed live: durable:false, exclusive:false rejects with
    // "INTERNAL_ERROR - Feature `transient_nonexcl_queues` is deprecated"),
    // so a shared throwaway queue must be durable even though nothing here
    // needs it to survive a broker restart. autoDelete still cleans it up
    // once every consumer disconnects.
    await channel.assertQueue(SMOKE_TEST_QUEUE, { durable: true, autoDelete: true });

    const received = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`No message received within ${SMOKE_TEST_TIMEOUT_MS}ms`));
      }, SMOKE_TEST_TIMEOUT_MS);

      channel
        .consume(
          SMOKE_TEST_QUEUE,
          (message) => {
            if (!message) return;
            const body = JSON.parse(message.content.toString()) as { token: string };
            channel.ack(message);
            if (body.token !== token) return; // a concurrent smoke test's message -- ignore, keep waiting
            clearTimeout(timer);
            resolve();
          },
          { noAck: false },
        )
        .catch(reject);
    });

    channel.sendToQueue(SMOKE_TEST_QUEUE, Buffer.from(JSON.stringify({ token })), {
      persistent: false,
    });

    await received;
    return { ok: true, roundTripMs: Date.now() - startedAt };
  }
}
