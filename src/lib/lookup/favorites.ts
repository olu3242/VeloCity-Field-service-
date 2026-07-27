/**
 * IDXF Engine 77 — Favorites.
 *
 * Explicit pins a user places on rows they reference repeatedly — a preferred
 * provider, a key account. Favorites outrank recency in lookup ordering because
 * they are a deliberate choice rather than an inferred signal.
 *
 * Scoped by tenant and user, like recent items.
 */

export interface Favorite {
  entity: string;
  recordId: string;
  title: string;
  tenantId: string;
  userId: string;
  /** Optional reason, surfaced in the lookup panel. */
  note?: string;
  /** Manual ordering within an entity; lower sorts first. */
  rank: number;
  createdAt: string;
}

/** `${tenantId}::${userId}` → favorites */
const FAVORITES: Map<string, Favorite[]> = new Map();
const MAX_PER_USER = 200;

function scopeKey(tenantId: string, userId: string): string {
  return `${tenantId}::${userId}`;
}

export function addFavorite(
  tenantId: string,
  userId: string,
  entity: string,
  recordId: string,
  title: string,
  options: { note?: string; rank?: number } = {}
): Favorite | null {
  const key = scopeKey(tenantId, userId);
  const list = FAVORITES.get(key) ?? [];

  // Favoriting twice should not create a duplicate entry that then appears
  // twice in every lookup.
  if (list.some((f) => f.entity === entity && f.recordId === recordId)) return null;
  if (list.length >= MAX_PER_USER) return null;

  const favorite: Favorite = {
    entity,
    recordId,
    title,
    tenantId,
    userId,
    ...(options.note !== undefined ? { note: options.note } : {}),
    rank: options.rank ?? list.filter((f) => f.entity === entity).length,
    createdAt: new Date().toISOString(),
  };

  list.push(favorite);
  FAVORITES.set(key, list);
  return favorite;
}

export function removeFavorite(
  tenantId: string,
  userId: string,
  entity: string,
  recordId: string
): boolean {
  const key = scopeKey(tenantId, userId);
  const list = FAVORITES.get(key);
  if (!list) return false;
  const index = list.findIndex((f) => f.entity === entity && f.recordId === recordId);
  if (index < 0) return false;
  list.splice(index, 1);
  FAVORITES.set(key, list);
  return true;
}

export function getFavorites(
  tenantId: string,
  userId: string,
  entity?: string
): Favorite[] {
  const list = FAVORITES.get(scopeKey(tenantId, userId)) ?? [];
  const filtered = entity ? list.filter((f) => f.entity === entity) : list;
  return [...filtered].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

export function isFavorite(
  tenantId: string,
  userId: string,
  entity: string,
  recordId: string
): boolean {
  const list = FAVORITES.get(scopeKey(tenantId, userId));
  if (!list) return false;
  return list.some((f) => f.entity === entity && f.recordId === recordId);
}

/** Flat boost applied to favorited rows during lookup ranking. */
export function getFavoriteBoost(
  tenantId: string,
  userId: string,
  entity: string,
  recordId: string
): number {
  return isFavorite(tenantId, userId, entity, recordId) ? 1 : 0;
}

export function getFavoriteStats(tenantId: string): { users: number; favorites: number } {
  let users = 0;
  let favorites = 0;
  const prefix = `${tenantId}::`;
  for (const [key, list] of Array.from(FAVORITES.entries())) {
    if (!key.startsWith(prefix)) continue;
    users += 1;
    favorites += list.length;
  }
  return { users, favorites };
}
