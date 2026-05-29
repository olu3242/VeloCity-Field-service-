import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type ConflictResolution = "latest_wins" | "highest_confidence" | "merge" | "manual"
export interface ReconciliationRecord {
  reconciliationId: string; contextId: string; tenantId?: string
  conflictingVersions: number; resolution: ConflictResolution
  winningVersion: string; conflictsResolved: number
  reconciledAt: string
}

const RECORDS: ReconciliationRecord[] = []
const RECORDS_CAP = 500

export function reconcile(
  contextId: string, conflictingVersions: string[], resolution: ConflictResolution, tenantId?: string
): ReconciliationRecord {
  if (isRuntimePaused()) {
    logger.warn("memory-reconciliation", { msg: "runtime paused, reconciliation blocked", contextId })
    throw new Error("Runtime is paused")
  }
  const winningVersion = resolution === "latest_wins"
    ? (conflictingVersions[conflictingVersions.length - 1] ?? "")
    : (conflictingVersions[0] ?? "")
  const record: ReconciliationRecord = {
    reconciliationId: crypto.randomUUID(), contextId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    conflictingVersions: conflictingVersions.length, resolution,
    winningVersion, conflictsResolved: conflictingVersions.length - 1,
    reconciledAt: new Date().toISOString(),
  }
  RECORDS.push(record)
  if (RECORDS.length > RECORDS_CAP) RECORDS.splice(0, RECORDS.length - RECORDS_CAP)
  logger.info("memory-reconciliation", { reconciliationId: record.reconciliationId, contextId, resolution })
  return record
}

export function getReconciliationHistory(contextId: string): ReconciliationRecord[] {
  return RECORDS.filter(r => r.contextId === contextId)
}

export function getReconciliationSummary(): {
  total: number; byResolution: Record<string, number>; totalConflictsResolved: number
} {
  const total = RECORDS.length
  const byResolution: Record<string, number> = {}
  let totalConflictsResolved = 0
  for (const r of RECORDS) {
    byResolution[r.resolution] = (byResolution[r.resolution] ?? 0) + 1
    totalConflictsResolved += r.conflictsResolved
  }
  return { total, byResolution, totalConflictsResolved }
}
