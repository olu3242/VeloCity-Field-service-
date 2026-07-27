/**
 * IDXF Engine 77 — Recent Items.
 *
 * Per-user, per-tenant recency tracking. Feeds lookup ranking so the rows a user
 * actually works with surface first.
 *
 * Keyed by tenant *and* user: a user's recency must not leak across tenants even
 * if the same account is a member of several.
 */

export interface RecentItem {
  entity: string;
  recordId: string;
  title: string;
  tenantId: string;
  userId: string;
  /** Times this user has touched the row. */
  touchCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** `${tenantId}::${userId}` → ordered list, most recent last */
const RECENT: Map<string, RecentItem[]> = new Map();
const MAX_PER_USER = 100;

function scopeKey(tenantId: string, userId: string): string {
  return `${tenantId}::${userId}`;
}

export function recordAccess(
  tenantId: string,
  userId: string,
  entity: string,
  recordId: string,
  title: string
): RecentItem {
  const key = scopeKey(tenantId, userId);
  const list = RECENT.get(key) ?? [];
  const now = new Date().toISOString();

  const existingIndex = list.findIndex((i) => i.entity === entity && i.recordId === recordId);
  let item: RecentItem;

  if (existingIndex >= 0) {
    const existing = list[existingIndex] as RecentItem;
    item = {
      ...existing,
      title,
      touchCount: existing.touchCount + 1,
      lastSeenAt: now,
    };
    list.splice(existingIndex, 1);
  } else {
    item = {
      entity,
      recordId,
      title,
      tenantId,
      userId,
      touchCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    };
  }

  list.push(item);
  if (list.length > MAX_PER_USER) list.splice(0, list.length - MAX_PER_USER);
  RECENT.set(key, list);
  return item;
}

export function getRecent(
  tenantId: string,
  userId: string,
  options: { entity?: string; limit?: number } = {}
): RecentItem[] {
  const list = RECENT.get(scopeKey(tenantId, userId)) ?? [];
  const filtered = options.entity ? list.filter((i) => i.entity === options.entity) : list;
  // Stored oldest-first; callers want most recent.
  return filtered.slice(-(options.limit ?? 10)).reverse();
}

/**
 * Recency boost in the range 0–1 for lookup ranking.
 *
 * Combines how recently the row was touched with how often. Decay is over 30
 * days: a row touched today ranks well above one touched last month, without a
 * hard cutoff that would make ranking jump discontinuously.
 */
export function getRecencyBoost(
  tenantId: string,
  userId: string,
  entity: string,
  recordId: string
): number {
  const list = RECENT.get(scopeKey(tenantId, userId));
  if (!list) return 0;

  const item = list.find((i) => i.entity === entity && i.recordId === recordId);
  if (!item) return 0;

  const ageDays = (Date.now() - new Date(item.lastSeenAt).getTime()) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / 30);
  // Frequency saturates so a hot row cannot dominate ranking outright.
  const frequency = Math.min(1, item.touchCount / 10);

  return Number((recency * 0.7 + frequency * 0.3).toFixed(4));
}

export function clearRecent(tenantId: string, userId: string): void {
  RECENT.delete(scopeKey(tenantId, userId));
}

export function getRecentStats(tenantId: string): { users: number; items: number } {
  let users = 0;
  let items = 0;
  const prefix = `${tenantId}::`;
  for (const [key, list] of Array.from(RECENT.entries())) {
    if (!key.startsWith(prefix)) continue;
    users += 1;
    items += list.length;
  }
  return { users, items };
}
