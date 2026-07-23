// Distributed sliding-window rate limiter backed by Redis sorted sets.
// Falls back to the in-memory implementation when Redis is not configured.

import { redis } from "./client";

// ── In-memory fallback (single-instance only) ────────────────────────────
interface MemEntry {
  count: number;
  windowStart: number;
}
const memStore = new Map<string, MemEntry>();

function memRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    memStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count += 1;
  const allowed = entry.count <= limit;
  return { allowed, remaining: Math.max(0, limit - entry.count) };
}

// ── Lua script: atomic sliding-window check + insert ────────────────────
// Removes expired members, counts current, adds new member if under limit.
const SLIDING_WINDOW_SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local uid    = ARGV[4]
local ttl    = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = tonumber(redis.call('ZCARD', key))

if count >= limit then
  return {0, 0}
end

redis.call('ZADD', key, now, uid)
redis.call('EXPIRE', key, ttl)
return {1, limit - count - 1}
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  source: "redis" | "memory";
}

/**
 * Check rate limit for a key.
 * key    — namespaced identifier, e.g. "tenant:abc123:/api/payments"
 * limit  — max requests per window
 * windowMs — window duration in milliseconds
 */
export async function checkDistributedRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!redis.isConfigured) {
    const mem = memRateLimit(key, limit, windowMs);
    return { ...mem, source: "memory" };
  }

  try {
    const now = Date.now();
    const uid = `${now}:${Math.random().toString(36).slice(2, 9)}`;
    const ttl = Math.ceil(windowMs / 1000);

    const result = await redis.eval(SLIDING_WINDOW_SCRIPT, [`rl:${key}`], [
      now,
      windowMs,
      limit,
      uid,
      ttl,
    ]) as [number, number];

    return {
      allowed: result[0] === 1,
      remaining: Math.max(0, result[1]),
      source: "redis",
    };
  } catch {
    // Degrade gracefully on Redis error
    const mem = memRateLimit(key, limit, windowMs);
    return { ...mem, source: "memory" };
  }
}
