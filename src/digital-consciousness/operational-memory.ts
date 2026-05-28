export type OperationalMemoryType =
  | "incident"
  | "recovery"
  | "optimization"
  | "configuration"
  | "anomaly"
  | "federation_event"

export interface OperationalMemoryRecord {
  memoryId: string
  memoryType: OperationalMemoryType
  tenantId?: string
  summary: string
  importance: number
  relatedSubsystems: string[]
  occurredAt: string
  expiresAt?: string
  recalled: number
}

const MEMORY: OperationalMemoryRecord[] = []
const CAP = 2000

export function remember(
  type: OperationalMemoryType,
  summary: string,
  importance: number,
  relatedSubsystems: string[],
  tenantId?: string,
  ttlMinutes?: number
): OperationalMemoryRecord {
  if (MEMORY.length >= CAP) {
    const minIdx = MEMORY.reduce(
      (mi, r, i) => (r.importance < MEMORY[mi].importance ? i : mi),
      0
    )
    MEMORY.splice(minIdx, 1)
  }
  const now = new Date()
  const record: OperationalMemoryRecord = {
    memoryId: crypto.randomUUID(),
    memoryType: type,
    tenantId,
    summary,
    importance: Math.max(0, Math.min(1, importance)),
    relatedSubsystems: [...relatedSubsystems],
    occurredAt: now.toISOString(),
    expiresAt: ttlMinutes
      ? new Date(now.getTime() + ttlMinutes * 60_000).toISOString()
      : undefined,
    recalled: 0,
  }
  MEMORY.push(record)
  MEMORY.sort((a, b) => b.importance - a.importance)
  return record
}

export function recall(
  type: OperationalMemoryType,
  tenantId?: string
): OperationalMemoryRecord[] {
  const results = MEMORY.filter(
    r => r.memoryType === type && (tenantId === undefined || r.tenantId === tenantId)
  )
  for (const r of results) r.recalled += 1
  return results
}

export function pruneExpired(): number {
  const now = new Date().toISOString()
  const before = MEMORY.length
  let i = MEMORY.length - 1
  while (i >= 0) {
    const r = MEMORY[i]
    if (r.expiresAt !== undefined && r.expiresAt < now) MEMORY.splice(i, 1)
    i -= 1
  }
  return before - MEMORY.length
}

export function getHighImportanceMemories(minImportance = 0.7): OperationalMemoryRecord[] {
  return MEMORY.filter(r => r.importance >= minImportance)
}

export function getMemorySummary(): {
  total: number
  byType: Record<string, number>
  avgImportance: number
} {
  const byType: Record<string, number> = {}
  let totalImportance = 0
  for (const r of MEMORY) {
    byType[r.memoryType] = (byType[r.memoryType] ?? 0) + 1
    totalImportance += r.importance
  }
  return {
    total: MEMORY.length,
    byType,
    avgImportance: MEMORY.length > 0 ? totalImportance / MEMORY.length : 0,
  }
}
