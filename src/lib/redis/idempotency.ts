// Idempotency key store backed by Redis with configurable TTL.
// Used for Stripe webhook dedup, worker dedup, and API idempotency.

import { redis } from "./client";

const KEY_PREFIX = "idem:";
const DEFAULT_TTL_S = 86_400; // 24 hours

// In-memory fallback for when Redis is not configured.
// NOTE: this is per-instance and does NOT survive restarts.
const memStore = new Map<string, string>();

function key(namespace: string, idempotencyKey: string): string {
  return `${KEY_PREFIX}${namespace}:${idempotencyKey}`;
}

export type IdempotencyStatus = "new" | "processing" | "completed";

export interface IdempotencyEntry {
  status: IdempotencyStatus;
  result?: string;
  createdAt: string;
  completedAt?: string;
}

function encodeEntry(entry: IdempotencyEntry): string {
  return JSON.stringify(entry);
}

function decodeEntry(raw: string): IdempotencyEntry {
  return JSON.parse(raw) as IdempotencyEntry;
}

/**
 * Mark an idempotency key as "processing".
 * Returns true if this is the first call (key was new), false if already exists.
 */
export async function beginIdempotent(
  namespace: string,
  idempotencyKey: string,
  ttlSec = DEFAULT_TTL_S
): Promise<boolean> {
  const k = key(namespace, idempotencyKey);
  const entry: IdempotencyEntry = {
    status: "processing",
    createdAt: new Date().toISOString(),
  };
  const encoded = encodeEntry(entry);

  if (!redis.isConfigured) {
    if (memStore.has(k)) return false;
    memStore.set(k, encoded);
    return true;
  }

  try {
    const result = await redis.set(k, encoded, { ex: ttlSec, nx: true });
    return result === "OK";
  } catch {
    if (memStore.has(k)) return false;
    memStore.set(k, encoded);
    return true;
  }
}

/**
 * Mark an idempotency key as completed, optionally storing the serialised result.
 */
export async function completeIdempotent(
  namespace: string,
  idempotencyKey: string,
  result?: string,
  ttlSec = DEFAULT_TTL_S
): Promise<void> {
  const k = key(namespace, idempotencyKey);
  const entry: IdempotencyEntry = {
    status: "completed",
    result,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  const encoded = encodeEntry(entry);

  if (!redis.isConfigured) {
    memStore.set(k, encoded);
    return;
  }

  try {
    await redis.set(k, encoded, { ex: ttlSec });
  } catch {
    memStore.set(k, encoded);
  }
}

/**
 * Look up the status of an idempotency key.
 * Returns null if the key has never been seen (or has expired).
 */
export async function getIdempotencyStatus(
  namespace: string,
  idempotencyKey: string
): Promise<IdempotencyEntry | null> {
  const k = key(namespace, idempotencyKey);

  if (!redis.isConfigured) {
    const raw = memStore.get(k);
    return raw ? decodeEntry(raw) : null;
  }

  try {
    const raw = await redis.get(k);
    return raw ? decodeEntry(raw) : null;
  } catch {
    const raw = memStore.get(k);
    return raw ? decodeEntry(raw) : null;
  }
}

/**
 * Check whether a key is already completed (for replay protection).
 */
export async function isAlreadyProcessed(
  namespace: string,
  idempotencyKey: string
): Promise<boolean> {
  const entry = await getIdempotencyStatus(namespace, idempotencyKey);
  return entry?.status === "completed";
}
