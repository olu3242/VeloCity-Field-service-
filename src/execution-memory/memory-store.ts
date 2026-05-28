import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export type MemoryType =
  | "workflow_outcome"
  | "ai_decision"
  | "remediation_action"
  | "optimization_applied"
  | "failure_pattern"
  | "success_pattern"
  | "federation_event"
  | "deployment_result"

export interface ExecutionMemory {
  memoryId: string
  memoryType: MemoryType
  workflowId?: string
  tenantId?: string
  correlationId: string
  content: Record<string, unknown>
  confidence: number
  relevanceScore: number
  accessCount: number
  createdAt: string
  lastAccessedAt: string
  expiresAt?: string
}

const MEMORY_STORE = new Map<string, ExecutionMemory>()
const CAP = 2000

function evictOldest(): void {
  const firstKey = Array.from(MEMORY_STORE.keys())[0]
  if (firstKey !== undefined) MEMORY_STORE.delete(firstKey)
}

export function storeMemory(
  type: MemoryType,
  correlationId: string,
  content: Record<string, unknown>,
  options?: {
    workflowId?: string
    tenantId?: string
    confidence?: number
    relevanceScore?: number
    ttlMs?: number
  }
): ExecutionMemory {
  if (isRuntimePaused()) {
    logger.warn("storeMemory blocked — runtime paused", "execution-memory", { correlationId })
    throw new Error("Runtime is paused")
  }
  while (MEMORY_STORE.size >= CAP) evictOldest()
  const now = new Date().toISOString()
  const memory: ExecutionMemory = {
    memoryId: crypto.randomUUID(),
    memoryType: type,
    workflowId: options?.workflowId,
    tenantId: options?.tenantId,
    correlationId,
    content,
    confidence: clampScore(options?.confidence ?? 0.5),
    relevanceScore: Math.min(100, Math.max(0, options?.relevanceScore ?? 50)),
    accessCount: 0,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: options?.ttlMs !== undefined
      ? new Date(Date.now() + options.ttlMs).toISOString()
      : undefined,
  }
  MEMORY_STORE.set(memory.memoryId, memory)
  return memory
}

export function getMemory(memoryId: string): ExecutionMemory | undefined {
  const mem = MEMORY_STORE.get(memoryId)
  if (!mem) return undefined
  mem.accessCount += 1
  mem.lastAccessedAt = new Date().toISOString()
  return mem
}

export function searchByType(type: MemoryType, tenantId?: string): ExecutionMemory[] {
  return Array.from(MEMORY_STORE.values()).filter(
    (m) => m.memoryType === type && (tenantId === undefined || m.tenantId === tenantId)
  )
}

export function searchByCorrelation(correlationId: string): ExecutionMemory[] {
  return Array.from(MEMORY_STORE.values()).filter((m) => m.correlationId === correlationId)
}

export function pruneExpired(): number {
  const now = Date.now()
  const toDelete = Array.from(MEMORY_STORE.entries())
    .filter(([, m]) => m.expiresAt !== undefined && new Date(m.expiresAt).getTime() <= now)
    .map(([k]) => k)
  toDelete.forEach((k) => MEMORY_STORE.delete(k))
  return toDelete.length
}

export function getMemoryStats(): { total: number; byType: Record<string, number>; avgConfidence: number } {
  const all = Array.from(MEMORY_STORE.values())
  const byType: Record<string, number> = {}
  let totalConf = 0
  for (const m of all) {
    byType[m.memoryType] = (byType[m.memoryType] ?? 0) + 1
    totalConf += m.confidence
  }
  return { total: all.length, byType, avgConfidence: all.length > 0 ? totalConf / all.length : 0 }
}
