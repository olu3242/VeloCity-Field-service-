import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type PermissionAction = "install" | "execute" | "configure" | "share" | "monetize"

export interface CapabilityPermission {
  permissionId: string
  itemId: string
  tenantId: string
  grantedActions: PermissionAction[]
  grantedAt: string
  grantedBy: string
  expiresAt?: string
  revoked: boolean
}

const PERMISSIONS: Map<string, CapabilityPermission[]> = new Map()
const PERMISSIONS_CAP = 5000

function totalCount(): number {
  return Array.from(PERMISSIONS.values()).reduce((sum, arr) => sum + arr.length, 0)
}

function enforceCapWithEviction(): void {
  if (totalCount() < PERMISSIONS_CAP) return
  const firstKey = Array.from(PERMISSIONS.keys())[0]
  if (!firstKey) return
  const arr = PERMISSIONS.get(firstKey)
  if (!arr || arr.length === 0) { PERMISSIONS.delete(firstKey); return }
  arr.shift()
  if (arr.length === 0) PERMISSIONS.delete(firstKey)
}

export function grantPermission(
  itemId: string,
  tenantId: string,
  actions: PermissionAction[],
  grantedBy: string,
  expiresAt?: string
): CapabilityPermission {
  if (isRuntimePaused()) throw new Error("Runtime is paused — cannot grant permission")
  enforceCapWithEviction()

  const perm: CapabilityPermission = {
    permissionId: crypto.randomUUID(),
    itemId,
    tenantId,
    grantedActions: actions,
    grantedAt: new Date().toISOString(),
    grantedBy,
    expiresAt,
    revoked: false,
  }

  const existing = PERMISSIONS.get(tenantId) ?? []
  existing.push(perm)
  PERMISSIONS.set(tenantId, existing)

  logger.info(`Permission granted: ${actions.join(",")} on item ${itemId}`, "capability-permissions", {
    metadata: { tenantId, permissionId: perm.permissionId },
  })
  return perm
}

export function revokePermission(permissionId: string): void {
  for (const perms of Array.from(PERMISSIONS.values())) {
    const perm = perms.find((p) => p.permissionId === permissionId)
    if (perm) { perm.revoked = true; return }
  }
}

export function hasPermission(tenantId: string, itemId: string, action: PermissionAction): boolean {
  const perms = PERMISSIONS.get(tenantId) ?? []
  const now = new Date().toISOString()
  return perms.some(
    (p) =>
      p.itemId === itemId &&
      !p.revoked &&
      p.grantedActions.includes(action) &&
      (p.expiresAt === undefined || p.expiresAt > now)
  )
}

export function getPermissionsForTenant(tenantId: string): CapabilityPermission[] {
  return PERMISSIONS.get(tenantId) ?? []
}

export function getPermissionsForItem(itemId: string): CapabilityPermission[] {
  const results: CapabilityPermission[] = []
  for (const perms of Array.from(PERMISSIONS.values())) {
    for (const p of perms) {
      if (p.itemId === itemId) results.push(p)
    }
  }
  return results
}

export function pruneExpired(): number {
  const now = new Date().toISOString()
  let pruned = 0
  for (const [tenantId, perms] of Array.from(PERMISSIONS.entries())) {
    const before = perms.length
    const filtered = perms.filter((p) => !p.expiresAt || p.expiresAt > now)
    PERMISSIONS.set(tenantId, filtered)
    pruned += before - filtered.length
  }
  return pruned
}
