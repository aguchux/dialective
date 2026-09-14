import type { RedisOptions } from 'ioredis';

/**
 * Every direct `new Redis(...)` construction in this service reads the same
 * REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_TLS env vars -- centralized
 * here so the password/TLS rollout (see k8s/base/redis.yaml's requirepass +
 * TLS listener) only needs updating in one place per deployable. Password
 * and TLS are both optional and independently toggleable: REDIS_PASSWORD
 * unset means no AUTH (today's default, safe to deploy before requirepass
 * is actually turned on in the cluster); REDIS_TLS=true enables ioredis's
 * TLS transport (used only for the external LoadBalancer path a GCP-hosted
 * worker connects through -- in-cluster traffic stays plain TCP to the
 * cluster-internal `redis` hostname, same private network, no cert needed).
 */
export function buildRedisConnectionOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST ?? 'redis',
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
  };
}
