export interface CacheEntry {
  key: string
  value: Record<string, unknown>
  cachedAt: string
  expiresAt: string
  hitCount: number
  tenantId?: string
}

const CACHE: Map<string, CacheEntry> = new Map()
const CAP = 2000
let HITS = 0
let MISSES = 0

export function cache(
  key: string,
  value: Record<string, unknown>,
  ttlMs: number,
  tenantId?: string,
): void {
  if (CACHE.size >= CAP) {
    const firstKey = Array.from(CACHE.keys())[0]
    if (firstKey !== undefined) CACHE.delete(firstKey)
  }
  const now = Date.now()
  CACHE.set(key, {
    key,
    value,
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    hitCount: 0,
    tenantId,
  })
}

export function get(
  key: string,
  tenantId?: string,
): Record<string, unknown> | undefined {
  const entry = CACHE.get(key)
  if (!entry) {
    MISSES++
    return undefined
  }
  if (tenantId !== undefined && entry.tenantId !== tenantId) {
    MISSES++
    return undefined
  }
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    MISSES++
    return undefined
  }
  entry.hitCount++
  HITS++
  return entry.value
}

export function evict(key: string): void {
  CACHE.delete(key)
}

export function evictExpired(): number {
  const now = Date.now()
  let count = 0
  for (const [key, entry] of Array.from(CACHE.entries())) {
    if (new Date(entry.expiresAt).getTime() < now) {
      CACHE.delete(key)
      count++
    }
  }
  return count
}

export function evictByTenant(tenantId: string): number {
  let count = 0
  for (const [key, entry] of Array.from(CACHE.entries())) {
    if (entry.tenantId === tenantId) {
      CACHE.delete(key)
      count++
    }
  }
  return count
}

export function getCacheStats(): {
  total: number
  hits: number
  misses: number
  hitRate: number
} {
  const total = HITS + MISSES
  return {
    total: CACHE.size,
    hits: HITS,
    misses: MISSES,
    hitRate: total > 0 ? HITS / total : 0,
  }
}
