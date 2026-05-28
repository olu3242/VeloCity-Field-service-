import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface TrustRelationship {
  relationId: string
  fromEntityId: string
  toEntityId: string
  trustLevel: "none" | "partial" | "full"
  scopes: string[]
  federatedTrust: boolean
  establishedAt: string
  expiresAt?: string
  revokedAt?: string
}

const RELATIONSHIPS: Map<string, TrustRelationship> = new Map()
const CAP = 2000

export function establishTrust(
  fromEntityId: string,
  toEntityId: string,
  level: TrustRelationship["trustLevel"],
  scopes: string[],
  federatedTrust = false,
  expiresAt?: string,
): TrustRelationship {
  if (isRuntimePaused()) {
    logger.warn("establishTrust blocked: runtime paused", "trust-mesh")
  }
  if (RELATIONSHIPS.size >= CAP) {
    const firstKey = Array.from(RELATIONSHIPS.keys())[0]
    if (firstKey) RELATIONSHIPS.delete(firstKey)
  }
  const key = `${fromEntityId}:${toEntityId}`
  const rel: TrustRelationship = {
    relationId: crypto.randomUUID(),
    fromEntityId,
    toEntityId,
    trustLevel: level,
    scopes,
    federatedTrust,
    establishedAt: new Date().toISOString(),
    expiresAt,
  }
  RELATIONSHIPS.set(key, rel)
  logger.info(`Trust established: ${fromEntityId} → ${toEntityId} [${level}]`, "trust-mesh")
  return rel
}

export function revokeTrust(relationId: string): void {
  for (const rel of Array.from(RELATIONSHIPS.values())) {
    if (rel.relationId === relationId) {
      rel.revokedAt = new Date().toISOString()
      return
    }
  }
}

export function isTrustedFor(fromEntityId: string, toEntityId: string, scope: string): boolean {
  const key = `${fromEntityId}:${toEntityId}`
  const rel = RELATIONSHIPS.get(key)
  if (!rel) return false
  if (rel.revokedAt) return false
  if (rel.expiresAt && new Date(rel.expiresAt) < new Date()) return false
  return rel.scopes.includes(scope)
}

export function getTrustedPeers(entityId: string): TrustRelationship[] {
  return Array.from(RELATIONSHIPS.values()).filter(
    (r) => r.fromEntityId === entityId && !r.revokedAt,
  )
}

export function getMeshSummary(): { total: number; full: number; partial: number; federated: number } {
  let full = 0, partial = 0, federated = 0
  for (const rel of Array.from(RELATIONSHIPS.values())) {
    if (rel.trustLevel === "full") full++
    else if (rel.trustLevel === "partial") partial++
    if (rel.federatedTrust) federated++
  }
  return { total: RELATIONSHIPS.size, full, partial, federated }
}
