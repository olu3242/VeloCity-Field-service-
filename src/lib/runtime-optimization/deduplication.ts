export interface DeduplicationEntry {
  key: string;
  firstSeenAt: number;
  count: number;
  ttlMs: number;
  expiresAt: number;
}

const DEDUP_STORE: Map<string, DeduplicationEntry> = new Map();
const DEFAULT_TTL_MS = 30_000;
const STORE_CAP = 10_000;
const EVICT_FRACTION = 0.2;

let DUPLICATES_BLOCKED = 0;

function enforceCap(): void {
  if (DEDUP_STORE.size < STORE_CAP) return;

  const entries = Array.from(DEDUP_STORE.entries()).sort(
    ([, a], [, b]) => a.firstSeenAt - b.firstSeenAt
  );
  const toRemove = Math.ceil(STORE_CAP * EVICT_FRACTION);
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    DEDUP_STORE.delete(entries[i][0]);
  }
}

export function isDuplicate(key: string, ttlMs?: number): boolean {
  const entry = DEDUP_STORE.get(key);
  if (!entry) return false;

  if (entry.expiresAt > Date.now()) {
    entry.count += 1;
    DUPLICATES_BLOCKED += 1;
    return true;
  }

  DEDUP_STORE.delete(key);
  return false;
}

export function registerKey(key: string, ttlMs?: number): void {
  const resolvedTtl = ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  enforceCap();
  DEDUP_STORE.set(key, {
    key,
    firstSeenAt: now,
    count: 1,
    ttlMs: resolvedTtl,
    expiresAt: now + resolvedTtl,
  });
}

export function checkAndRegister(key: string, ttlMs?: number): boolean {
  if (isDuplicate(key, ttlMs)) return true;
  registerKey(key, ttlMs);
  return false;
}

export function evictExpired(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of Array.from(DEDUP_STORE.entries())) {
    if (entry.expiresAt < now) {
      DEDUP_STORE.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function getStats(): {
  total: number;
  activeKeys: number;
  duplicatesBlocked: number;
} {
  const now = Date.now();
  const activeKeys = Array.from(DEDUP_STORE.values()).filter(
    (e) => e.expiresAt > now
  ).length;
  return {
    total: DEDUP_STORE.size,
    activeKeys,
    duplicatesBlocked: DUPLICATES_BLOCKED,
  };
}
