import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type TimeoutPolicy = "abort" | "retry" | "failover" | "checkpoint_resume"
export interface TimeoutRecord {
  timeoutId: string; executionId: string; workflowType: string; tenantId?: string
  configuredMs: number; elapsedMs: number; policy: TimeoutPolicy
  triggered: boolean; resolvedBy?: TimeoutPolicy; resolvedAt?: string; recordedAt: string
}

const TIMEOUT_POLICIES: Map<string, TimeoutPolicy> = new Map()
const POLICIES_CAP = 200
const RECORDS: TimeoutRecord[] = []
const RECORDS_CAP = 1000

export function registerTimeoutPolicy(workflowType: string, policy: TimeoutPolicy): void {
  if (TIMEOUT_POLICIES.size >= POLICIES_CAP && !TIMEOUT_POLICIES.has(workflowType)) {
    const firstKey = Array.from(TIMEOUT_POLICIES.keys())[0]
    if (firstKey !== undefined) TIMEOUT_POLICIES.delete(firstKey)
  }
  TIMEOUT_POLICIES.set(workflowType, policy)
  logger.info("timeout-governance", { workflowType, policy })
}

export function recordTimeout(
  executionId: string, workflowType: string, configuredMs: number, elapsedMs: number, tenantId?: string
): TimeoutRecord {
  void isRuntimePaused()
  const triggered = elapsedMs > configuredMs
  const policy: TimeoutPolicy = TIMEOUT_POLICIES.get(workflowType) ?? "abort"
  const now = new Date().toISOString()
  const record: TimeoutRecord = {
    timeoutId: crypto.randomUUID(), executionId, workflowType,
    ...(tenantId !== undefined ? { tenantId } : {}),
    configuredMs, elapsedMs, policy, triggered,
    ...(triggered ? { resolvedBy: policy, resolvedAt: now } : {}),
    recordedAt: now,
  }
  RECORDS.push(record)
  if (RECORDS.length > RECORDS_CAP) RECORDS.splice(0, RECORDS.length - RECORDS_CAP)
  logger.info("timeout-governance", { timeoutId: record.timeoutId, executionId, triggered, policy })
  return record
}

export function getTimeoutPolicy(workflowType: string): TimeoutPolicy {
  return TIMEOUT_POLICIES.get(workflowType) ?? "abort"
}

export function getTriggeredTimeouts(tenantId?: string): TimeoutRecord[] {
  const triggered = RECORDS.filter(r => r.triggered)
  if (tenantId === undefined) return triggered
  return triggered.filter(r => r.tenantId === tenantId)
}

export function getTimeoutSummary(): {
  total: number; triggered: number; byPolicy: Record<string, number>; avgElapsedMs: number
} {
  const total = RECORDS.length
  const triggered = RECORDS.filter(r => r.triggered).length
  const byPolicy: Record<string, number> = {}
  let elapsedSum = 0
  for (const r of RECORDS) {
    byPolicy[r.policy] = (byPolicy[r.policy] ?? 0) + 1
    elapsedSum += r.elapsedMs
  }
  const avgElapsedMs = total > 0 ? elapsedSum / total : 0
  return { total, triggered, byPolicy, avgElapsedMs }
}
