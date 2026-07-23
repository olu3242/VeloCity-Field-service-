// Distributed circuit breaker state store backed by Redis hashes.
// Provides the same interface as the in-memory circuit breaker so API routes
// can opt into Redis-backed state without changing call signatures.

import type { CircuitBreaker, CircuitState } from "@/lib/governance/circuit-breaker";
import { redis } from "./client";

const DEFAULT_THRESHOLD = 5;
const DEFAULT_RESET_MS = 60_000;
const KEY_PREFIX = "cb:";
const DEFAULT_TTL_S = 3_600; // 1 hour — circuits auto-expire after idle period

function key(circuitKey: string): string {
  return `${KEY_PREFIX}${circuitKey}`;
}

function defaultCircuit(circuitKey: string): CircuitBreaker {
  return {
    key: circuitKey,
    state: "closed",
    failureCount: 0,
    successCount: 0,
    lastFailureAt: null,
    openedAt: null,
    threshold: DEFAULT_THRESHOLD,
    resetTimeMs: DEFAULT_RESET_MS,
  };
}

function fromHash(
  circuitKey: string,
  data: Record<string, string>
): CircuitBreaker {
  return {
    key: circuitKey,
    state: (data.state as CircuitState) ?? "closed",
    failureCount: parseInt(data.failureCount ?? "0", 10),
    successCount: parseInt(data.successCount ?? "0", 10),
    lastFailureAt: data.lastFailureAt ?? null,
    openedAt: data.openedAt ?? null,
    threshold: parseInt(data.threshold ?? String(DEFAULT_THRESHOLD), 10),
    resetTimeMs: parseInt(data.resetTimeMs ?? String(DEFAULT_RESET_MS), 10),
  };
}

function toHash(cb: CircuitBreaker): Record<string, string> {
  return {
    state: cb.state,
    failureCount: String(cb.failureCount),
    successCount: String(cb.successCount),
    lastFailureAt: cb.lastFailureAt ?? "",
    openedAt: cb.openedAt ?? "",
    threshold: String(cb.threshold),
    resetTimeMs: String(cb.resetTimeMs),
  };
}

export async function getDistributedCircuit(
  circuitKey: string
): Promise<CircuitBreaker | null> {
  if (!redis.isConfigured) return null;
  try {
    const data = await redis.hgetall(key(circuitKey));
    if (!data) return defaultCircuit(circuitKey);
    return fromHash(circuitKey, data);
  } catch {
    return null;
  }
}

export async function saveDistributedCircuit(
  cb: CircuitBreaker
): Promise<void> {
  if (!redis.isConfigured) return;
  try {
    await redis.hmset(key(cb.key), toHash(cb));
    await redis.expire(key(cb.key), DEFAULT_TTL_S);
  } catch {
    // Silent — in-memory circuit stays as fallback
  }
}

export async function resetDistributedCircuit(
  circuitKey: string
): Promise<void> {
  if (!redis.isConfigured) return;
  try {
    await redis.del(key(circuitKey));
  } catch {
    // Silent
  }
}

export async function isDistributedRuntime(): Promise<boolean> {
  return redis.isConfigured;
}
