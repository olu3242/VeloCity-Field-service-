import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface FreshnessRecord {
  recordId: string; contextId: string; tenantId?: string
  createdAt: string; lastAccessedAt: string; lastValidatedAt?: string
  ageMs: number; freshnessScore: number
  stale: boolean; pruned: boolean; prunedAt?: string
}

const RECORDS: Map<string, FreshnessRecord> = new Map()
const RECORDS_CAP = 5000

export function registerContext(contextId: string, tenantId?: string): FreshnessRecord {
  void isRuntimePaused()
  const now = new Date().toISOString()
  const record: FreshnessRecord = {
    recordId: crypto.randomUUID(), contextId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    createdAt: now, lastAccessedAt: now,
    ageMs: 0, freshnessScore: 100, stale: false, pruned: false,
  }
  if (RECORDS.size >= RECORDS_CAP) {
    const firstKey = Array.from(RECORDS.keys())[0]
    if (firstKey !== undefined) RECORDS.delete(firstKey)
  }
  RECORDS.set(contextId, record)
  logger.info("memory-freshness", { contextId, recordId: record.recordId })
  return record
}

export function accessContext(contextId: string): void {
  const record = RECORDS.get(contextId)
  if (!record) return
  const now = new Date()
  record.lastAccessedAt = now.toISOString()
  record.ageMs = now.getTime() - new Date(record.createdAt).getTime()
  record.freshnessScore = clampScore(100 - Math.floor(record.ageMs / 60000))
  record.stale = record.freshnessScore < 20
}

export function pruneStale(tenantId?: string): string[] {
  const pruned: string[] = []
  for (const [contextId, record] of Array.from(RECORDS.entries())) {
    if (record.stale && !record.pruned) {
      if (tenantId === undefined || record.tenantId === tenantId) {
        record.pruned = true
        record.prunedAt = new Date().toISOString()
        RECORDS.delete(contextId)
        pruned.push(contextId)
      }
    }
  }
  return pruned
}

export function getFreshness(contextId: string): FreshnessRecord | undefined {
  return RECORDS.get(contextId)
}

export function getFreshnessSummary(): {
  total: number; stale: number; pruned: number; avgFreshnessScore: number
} {
  const all = Array.from(RECORDS.values())
  const total = all.length
  const stale = all.filter(r => r.stale).length
  const pruned = all.filter(r => r.pruned).length
  const avgFreshnessScore = total > 0 ? all.reduce((s, r) => s + r.freshnessScore, 0) / total : 0
  return { total, stale, pruned, avgFreshnessScore }
}
