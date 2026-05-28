import { logger } from "@/runtime-core/observability"
import { type RuntimePolicy } from "./runtime-policy"

export interface PolicyConflict {
  conflictId: string
  policyIds: string[]
  conflictType: "action_conflict" | "scope_overlap" | "priority_tie" | "tenant_override"
  resolution?: "highest_priority_wins" | "most_restrictive" | "tenant_policy_wins" | "escalated"
  resolvedAt?: string
  tenantId?: string
  createdAt: string
}

const CONFLICTS: PolicyConflict[] = []
const CONFLICTS_CAP = 500

export function detectConflicts(policies: RuntimePolicy[]): PolicyConflict[] {
  const detected: PolicyConflict[] = []
  const active = policies.filter((p) => p.active)
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      if (a === undefined || b === undefined) continue
      if (a.targetType !== b.targetType || a.targetPattern !== b.targetPattern) continue
      let conflictType: PolicyConflict["conflictType"] | null = null
      if (a.action !== b.action) {
        conflictType = "action_conflict"
      } else if (a.priority === b.priority && a.scope === b.scope) {
        conflictType = "priority_tie"
      }
      if (conflictType !== null) {
        if (CONFLICTS.length >= CONFLICTS_CAP) CONFLICTS.shift()
        const conflict: PolicyConflict = {
          conflictId: crypto.randomUUID(),
          policyIds: [a.policyId, b.policyId],
          conflictType,
          tenantId: a.tenantId ?? b.tenantId,
          createdAt: new Date().toISOString(),
        }
        CONFLICTS.push(conflict)
        detected.push(conflict)
        logger.warn(`Policy conflict detected: ${conflictType}`, "policy-arbitration", {
          metadata: { conflictId: conflict.conflictId },
        })
      }
    }
  }
  return detected
}

export function resolveConflict(conflictId: string): PolicyConflict {
  const conflict = CONFLICTS.find((c) => c.conflictId === conflictId)
  if (!conflict) throw new Error(`Conflict not found: ${conflictId}`)
  let resolution: PolicyConflict["resolution"]
  if (conflict.conflictType === "action_conflict") {
    resolution = "most_restrictive"
  } else if (conflict.conflictType === "scope_overlap") {
    resolution = conflict.tenantId !== undefined ? "tenant_policy_wins" : "highest_priority_wins"
  } else {
    resolution = "highest_priority_wins"
  }
  conflict.resolution = resolution
  conflict.resolvedAt = new Date().toISOString()
  logger.info(`Conflict resolved: ${conflictId} → ${resolution}`, "policy-arbitration")
  return conflict
}

export function getOpenConflicts(): PolicyConflict[] {
  return CONFLICTS.filter((c) => c.resolvedAt === undefined)
}

export function getArbitrationSummary(): {
  total: number
  resolved: number
  unresolved: number
  byResolution: Record<string, number>
} {
  const byResolution: Record<string, number> = {}
  let resolved = 0
  for (const c of CONFLICTS) {
    if (c.resolvedAt !== undefined) {
      resolved++
      if (c.resolution !== undefined) {
        byResolution[c.resolution] = (byResolution[c.resolution] ?? 0) + 1
      }
    }
  }
  return { total: CONFLICTS.length, resolved, unresolved: CONFLICTS.length - resolved, byResolution }
}
