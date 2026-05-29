import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface LineageEntry {
  entryId: string; contextId: string; tenantId?: string
  operation: "created" | "updated" | "merged" | "forked" | "archived"
  parentContextId?: string; sourceSystemId: string
  integrityHash: string; validatedAt?: string; valid: boolean
  recordedAt: string
}

const LINEAGE: LineageEntry[] = []
const LINEAGE_CAP = 5000

export function recordLineage(
  contextId: string,
  operation: LineageEntry["operation"],
  sourceSystemId: string,
  parentContextId?: string,
  tenantId?: string
): LineageEntry {
  void isRuntimePaused()
  const now = Date.now()
  const entry: LineageEntry = {
    entryId: crypto.randomUUID(), contextId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    operation,
    ...(parentContextId !== undefined ? { parentContextId } : {}),
    sourceSystemId,
    integrityHash: `hash-${contextId}-${operation}-${now}`,
    valid: true,
    recordedAt: new Date(now).toISOString(),
  }
  LINEAGE.push(entry)
  if (LINEAGE.length > LINEAGE_CAP) LINEAGE.splice(0, LINEAGE.length - LINEAGE_CAP)
  logger.info("memory-lineage", { entryId: entry.entryId, contextId, operation })
  return entry
}

export function validateLineage(contextId: string): { valid: boolean; chain: LineageEntry[]; issues: string[] } {
  const chain = getLineageChain(contextId)
  const valid = chain.every(e => e.valid)
  const issues: string[] = valid ? [] : ["invalid_entry_detected"]
  return { valid, chain, issues }
}

export function getLineageChain(contextId: string): LineageEntry[] {
  return LINEAGE.filter(e => e.contextId === contextId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
}

export function getLineageSummary(): {
  total: number; valid: number; invalid: number; byOperation: Record<string, number>
} {
  const total = LINEAGE.length
  const valid = LINEAGE.filter(e => e.valid).length
  const invalid = total - valid
  const byOperation: Record<string, number> = {}
  for (const e of LINEAGE) {
    byOperation[e.operation] = (byOperation[e.operation] ?? 0) + 1
  }
  return { total, valid, invalid, byOperation }
}
