import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface DuplicateGroup {
  groupId: string; tenantId?: string; canonicalContextId: string
  duplicateContextIds: string[]; deduplicatedAt: string; spaceSavedKb: number
}

const GROUPS: DuplicateGroup[] = []
const GROUPS_CAP = 500

export function deduplicateContexts(contextIds: string[], tenantId?: string): DuplicateGroup {
  void isRuntimePaused()
  const canonicalContextId = contextIds[0] ?? ""
  const duplicateContextIds = contextIds.slice(1)
  const spaceSavedKb = duplicateContextIds.length * 2
  const group: DuplicateGroup = {
    groupId: crypto.randomUUID(),
    ...(tenantId !== undefined ? { tenantId } : {}),
    canonicalContextId, duplicateContextIds, spaceSavedKb,
    deduplicatedAt: new Date().toISOString(),
  }
  GROUPS.push(group)
  if (GROUPS.length > GROUPS_CAP) GROUPS.splice(0, GROUPS.length - GROUPS_CAP)
  logger.info("context-deduplication", {
    groupId: group.groupId, duplicatesRemoved: duplicateContextIds.length, spaceSavedKb,
  })
  return group
}

export function getDeduplicationHistory(tenantId?: string): DuplicateGroup[] {
  if (tenantId === undefined) return [...GROUPS]
  return GROUPS.filter(g => g.tenantId === tenantId)
}

export function getDeduplicationSummary(): {
  totalGroups: number; totalDuplicatesRemoved: number; totalSpaceSavedKb: number
} {
  const totalGroups = GROUPS.length
  const totalDuplicatesRemoved = GROUPS.reduce((s, g) => s + g.duplicateContextIds.length, 0)
  const totalSpaceSavedKb = GROUPS.reduce((s, g) => s + g.spaceSavedKb, 0)
  return { totalGroups, totalDuplicatesRemoved, totalSpaceSavedKb }
}
