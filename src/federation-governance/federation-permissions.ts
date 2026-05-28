import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type FederationOperation =
  | "read_context"
  | "write_context"
  | "relay_signal"
  | "sync_model"
  | "broadcast"
  | "execute_workflow"

export interface FederationPermission {
  permissionId: string
  participantId: string
  tenantId?: string
  allowedOperations: FederationOperation[]
  deniedOperations: FederationOperation[]
  expiresAt?: string
  grantedBy: string
  grantedAt: string
}

const PERMISSIONS = new Map<string, FederationPermission>()
const MAX_PERMISSIONS = 500

export function grantPermissions(
  participantId: string,
  ops: FederationOperation[],
  grantedBy: string,
  tenantId?: string,
  expiresAt?: string
): FederationPermission {
  if (isRuntimePaused()) {
    logger.warn("grantPermissions blocked: runtime paused", { participantId })
    throw new Error("Runtime is paused")
  }

  if (PERMISSIONS.size >= MAX_PERMISSIONS && !PERMISSIONS.has(participantId)) {
    const oldest = Array.from(PERMISSIONS.keys())[0]
    PERMISSIONS.delete(oldest)
  }

  const existing = PERMISSIONS.get(participantId)
  const permission: FederationPermission = {
    permissionId: crypto.randomUUID(),
    participantId,
    tenantId,
    allowedOperations: ops,
    deniedOperations: existing?.deniedOperations ?? [],
    expiresAt,
    grantedBy,
    grantedAt: new Date().toISOString(),
  }

  PERMISSIONS.set(participantId, permission)
  logger.info("Permissions granted", { participantId, ops })
  return permission
}

export function denyOperations(participantId: string, ops: FederationOperation[]): void {
  const p = PERMISSIONS.get(participantId)
  if (!p) return
  for (const op of ops) {
    if (!p.deniedOperations.includes(op)) {
      p.deniedOperations.push(op)
    }
  }
}

export function isAllowed(participantId: string, operation: FederationOperation): boolean {
  const p = PERMISSIONS.get(participantId)
  if (!p) return false
  if (p.deniedOperations.includes(operation)) return false
  return p.allowedOperations.includes(operation)
}

export function getPermissions(participantId: string): FederationPermission | undefined {
  return PERMISSIONS.get(participantId)
}

export function getPermissionsSummary(): {
  total: number
  avgAllowedOps: number
  byOperation: Record<string, number>
} {
  const all = Array.from(PERMISSIONS.values())
  const total = all.length
  const avgAllowedOps = total > 0 ? all.reduce((s, p) => s + p.allowedOperations.length, 0) / total : 0
  const byOperation: Record<string, number> = {}
  for (const p of all) {
    for (const op of p.allowedOperations) {
      byOperation[op] = (byOperation[op] ?? 0) + 1
    }
  }
  return { total, avgAllowedOps, byOperation }
}
