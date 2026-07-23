export { redis, RedisClient } from "./client";
export { checkDistributedRateLimit } from "./rate-limiter";
export type { RateLimitResult } from "./rate-limiter";
export {
  getDistributedCircuit,
  saveDistributedCircuit,
  resetDistributedCircuit,
  isDistributedRuntime,
} from "./circuit-breaker";
export {
  acquireLock,
  releaseLock,
  extendLock,
  withLock,
} from "./lock";
export type { AcquiredLock } from "./lock";
export {
  beginIdempotent,
  completeIdempotent,
  getIdempotencyStatus,
  isAlreadyProcessed,
} from "./idempotency";
export type { IdempotencyEntry, IdempotencyStatus } from "./idempotency";

import { redis } from "./client";

export interface RedisHealthResult {
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
}

export async function checkRedisHealth(): Promise<RedisHealthResult> {
  if (!redis.isConfigured) {
    return { configured: false, reachable: false, latencyMs: null };
  }
  const start = Date.now();
  const reachable = await redis.ping();
  return {
    configured: true,
    reachable,
    latencyMs: reachable ? Date.now() - start : null,
  };
}
