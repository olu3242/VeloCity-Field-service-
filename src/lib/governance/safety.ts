/**
 * Execution Safety Controls — deduplication, flood protection, runaway loop detection.
 * All in-memory with TTL-based expiry. No DB calls for low-latency enforcement.
 */

export interface SafetyResult {
  allowed: boolean;
  reason?: string;
  policy?: string;
}

const ALLOWED: SafetyResult = { allowed: true };

// --- Deduplication ---
interface DedupEntry {
  expiresAt: number;
}
const dedupStore = new Map<string, DedupEntry>();
const DEFAULT_DEDUP_WINDOW_MS = 30_000; // 30 seconds

export function checkDuplication(key: string, windowMs = DEFAULT_DEDUP_WINDOW_MS): SafetyResult {
  const now = Date.now();
  const entry = dedupStore.get(key);

  if (entry && entry.expiresAt > now) {
    return { allowed: false, reason: `Duplicate event within ${windowMs}ms window`, policy: "dedup" };
  }

  // Prune expired and register new
  dedupStore.set(key, { expiresAt: now + windowMs });
  return ALLOWED;
}

// --- Flood Protection ---
interface CounterWindow {
  count: number;
  windowStart: number;
}
const floodCounters = new Map<string, CounterWindow>();
const DEFAULT_FLOOD_LIMIT = 60; // per minute
const FLOOD_WINDOW_MS = 60_000;

export function checkFloodProtection(
  tenantId: string,
  eventType: string,
  limitPerMinute = DEFAULT_FLOOD_LIMIT
): SafetyResult {
  const key = `flood:${tenantId}:${eventType}`;
  const now = Date.now();
  const counter = floodCounters.get(key);

  if (!counter || now - counter.windowStart >= FLOOD_WINDOW_MS) {
    floodCounters.set(key, { count: 1, windowStart: now });
    return ALLOWED;
  }

  counter.count += 1;
  if (counter.count > limitPerMinute) {
    return {
      allowed: false,
      reason: `Flood limit exceeded: ${counter.count}/${limitPerMinute} per minute for ${eventType}`,
      policy: "flood_protection",
    };
  }

  return ALLOWED;
}

// --- Runaway Loop Detection ---
interface LoopCounter {
  count: number;
  windowStart: number;
}
const loopCounters = new Map<string, LoopCounter>();
const DEFAULT_LOOP_LIMIT = 10; // per hour
const LOOP_WINDOW_MS = 3_600_000;

export function checkRunawayLoop(
  jobId: string,
  eventType: string,
  maxPerHour = DEFAULT_LOOP_LIMIT
): SafetyResult {
  const key = `loop:${jobId}:${eventType}`;
  const now = Date.now();
  const counter = loopCounters.get(key);

  if (!counter || now - counter.windowStart >= LOOP_WINDOW_MS) {
    loopCounters.set(key, { count: 1, windowStart: now });
    return ALLOWED;
  }

  counter.count += 1;
  if (counter.count > maxPerHour) {
    return {
      allowed: false,
      reason: `Runaway loop detected: job ${jobId} fired ${eventType} ${counter.count} times this hour`,
      policy: "runaway_loop",
    };
  }

  return ALLOWED;
}

/** Run all safety checks; return first failure or allowed. */
export function checkAllSafety(
  tenantId: string,
  jobId: string | undefined,
  eventType: string,
  dedupKey: string | null
): SafetyResult {
  if (dedupKey) {
    const dedup = checkDuplication(dedupKey);
    if (!dedup.allowed) return dedup;
  }

  const flood = checkFloodProtection(tenantId, eventType);
  if (!flood.allowed) return flood;

  if (jobId) {
    const loop = checkRunawayLoop(jobId, eventType);
    if (!loop.allowed) return loop;
  }

  return ALLOWED;
}
