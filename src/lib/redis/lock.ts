// Distributed lock using Redis SET NX EX + Lua atomic release.
// Safe for single-node Redis (Upstash). For multi-node Redlock, use
// the Redlock algorithm across 3+ Redis nodes (future work).

import { redis } from "./client";

// Lua script: only delete the key if we own it (prevents lock theft).
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

// Lua script: extend the TTL only if we own the lock.
const EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

function lockKey(resource: string): string {
  return `lock:${resource}`;
}

export interface AcquiredLock {
  resource: string;
  ownerId: string;
  ttlMs: number;
  acquiredAt: number;
}

/**
 * Attempt to acquire a distributed lock on `resource`.
 * Returns an AcquiredLock on success, null if the lock is already held.
 */
export async function acquireLock(
  resource: string,
  ttlMs: number,
  ownerId: string
): Promise<AcquiredLock | null> {
  if (!redis.isConfigured) {
    // No distributed locking available; callers must handle this.
    return null;
  }
  try {
    const ttlSec = Math.ceil(ttlMs / 1000);
    const result = await redis.set(lockKey(resource), ownerId, {
      ex: ttlSec,
      nx: true,
    });
    if (result !== "OK") return null;
    return { resource, ownerId, ttlMs, acquiredAt: Date.now() };
  } catch {
    return null;
  }
}

/**
 * Release a previously acquired lock. Only succeeds if this owner holds the lock.
 * Returns true if the lock was released, false if it had already expired or was
 * taken by someone else.
 */
export async function releaseLock(lock: AcquiredLock): Promise<boolean> {
  if (!redis.isConfigured) return false;
  try {
    const result = await redis.eval(
      RELEASE_SCRIPT,
      [lockKey(lock.resource)],
      [lock.ownerId]
    ) as number;
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Extend a held lock's TTL. Returns true if successful.
 */
export async function extendLock(
  lock: AcquiredLock,
  additionalMs: number
): Promise<boolean> {
  if (!redis.isConfigured) return false;
  try {
    const ttlSec = Math.ceil(additionalMs / 1000);
    const result = await redis.eval(
      EXTEND_SCRIPT,
      [lockKey(lock.resource)],
      [lock.ownerId, ttlSec]
    ) as number;
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Run fn under a distributed lock. If the lock cannot be acquired, throw.
 * Automatically releases the lock after fn completes or throws.
 */
export async function withLock<T>(
  resource: string,
  ttlMs: number,
  ownerId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lock = await acquireLock(resource, ttlMs, ownerId);
  if (!lock) {
    throw new Error(
      `Could not acquire distributed lock on "${resource}". Another instance may be processing.`
    );
  }
  try {
    return await fn();
  } finally {
    await releaseLock(lock);
  }
}
