import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface WorkloadIdentity {
  identityId: string
  workloadName: string
  workloadType: "workflow" | "agent" | "queue_worker" | "plugin" | "operator" | "federation_node"
  tenantId?: string
  scopes: string[]
  publicKey?: string
  issuedAt: string
  expiresAt?: string
  revoked: boolean
  metadata: Record<string, unknown>
}

const IDENTITIES: Map<string, WorkloadIdentity> = new Map()
const CAP = 2000

export function issueIdentity(
  workloadName: string,
  workloadType: WorkloadIdentity["workloadType"],
  scopes: string[],
  tenantId?: string,
  expiresAt?: string,
): WorkloadIdentity {
  if (isRuntimePaused()) {
    logger.warn("issueIdentity blocked: runtime paused", "workload-identity")
  }
  if (IDENTITIES.size >= CAP) {
    const firstKey = Array.from(IDENTITIES.keys())[0]
    if (firstKey) IDENTITIES.delete(firstKey)
  }
  const identity: WorkloadIdentity = {
    identityId: crypto.randomUUID(),
    workloadName,
    workloadType,
    tenantId,
    scopes,
    issuedAt: new Date().toISOString(),
    expiresAt,
    revoked: false,
    metadata: {},
  }
  IDENTITIES.set(identity.identityId, identity)
  logger.info(`Identity issued: ${workloadName} (${workloadType})`, "workload-identity", { tenantId })
  return identity
}

export function revokeIdentity(identityId: string): void {
  const identity = IDENTITIES.get(identityId)
  if (identity) identity.revoked = true
}

export function getIdentity(identityId: string): WorkloadIdentity | undefined {
  return IDENTITIES.get(identityId)
}

export function getIdentitiesByTenant(tenantId: string): WorkloadIdentity[] {
  return Array.from(IDENTITIES.values()).filter((i) => i.tenantId === tenantId)
}

export function validateIdentity(identityId: string): { valid: boolean; reason?: string } {
  const identity = IDENTITIES.get(identityId)
  if (!identity) return { valid: false, reason: "Identity not found" }
  if (identity.revoked) return { valid: false, reason: "Identity revoked" }
  if (identity.expiresAt && new Date(identity.expiresAt) < new Date()) {
    return { valid: false, reason: "Identity expired" }
  }
  return { valid: true }
}

export function getIdentityReport(): {
  total: number; active: number; revoked: number; expired: number
  byWorkloadType: Record<string, number>
} {
  const byWorkloadType: Record<string, number> = {}
  let active = 0, revoked = 0, expired = 0
  const now = new Date()
  for (const identity of Array.from(IDENTITIES.values())) {
    byWorkloadType[identity.workloadType] = (byWorkloadType[identity.workloadType] ?? 0) + 1
    if (identity.revoked) { revoked++; continue }
    if (identity.expiresAt && new Date(identity.expiresAt) < now) { expired++; continue }
    active++
  }
  return { total: IDENTITIES.size, active, revoked, expired, byWorkloadType }
}
