/**
 * Duplicate Detector — identifies event surges within rolling time windows.
 */

export interface DuplicatePattern {
  eventType: string;
  tenantId: string;
  count: number;
  windowMs: number;
  firstSeen: string;
  lastSeen: string;
}

export const PATTERNS: Map<string, DuplicatePattern> = new Map();

const WINDOW_MS = 60_000;
const STALE_THRESHOLD_MS = 5 * 60_000;

function patternKey(eventType: string, tenantId: string): string {
  return `${eventType}:${tenantId}`;
}

export function recordEventOccurrence(
  eventType: string,
  tenantId: string
): void {
  const key = patternKey(eventType, tenantId);
  const now = new Date().toISOString();
  const existing = PATTERNS.get(key);

  if (existing) {
    PATTERNS.set(key, {
      ...existing,
      count: existing.count + 1,
      lastSeen: now,
    });
  } else {
    PATTERNS.set(key, {
      eventType,
      tenantId,
      count: 1,
      windowMs: WINDOW_MS,
      firstSeen: now,
      lastSeen: now,
    });
  }
}

export function isDuplicateSurge(
  eventType: string,
  tenantId: string,
  threshold = 10
): boolean {
  const key = patternKey(eventType, tenantId);
  const pattern = PATTERNS.get(key);
  if (!pattern) return false;

  const lastSeenMs = new Date(pattern.lastSeen).getTime();
  const firstSeenMs = new Date(pattern.firstSeen).getTime();
  const elapsed = lastSeenMs - firstSeenMs;

  if (elapsed > WINDOW_MS) return false;

  return pattern.count > threshold;
}

export function getDuplicatePatterns(): DuplicatePattern[] {
  return Array.from(PATTERNS.values());
}

export function clearOldPatterns(): void {
  const cutoff = Date.now() - STALE_THRESHOLD_MS;
  const keys = Array.from(PATTERNS.keys());

  for (const key of keys) {
    const pattern = PATTERNS.get(key);
    if (pattern && new Date(pattern.lastSeen).getTime() < cutoff) {
      PATTERNS.delete(key);
    }
  }
}
