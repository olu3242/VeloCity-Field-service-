import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { validateIdentity, getIdentity } from "./workload-identity"
import { getTrustScore } from "./trust-score"

export interface AuthorizationResult {
  authorizationId: string
  identityId: string
  requestedCapability: string
  requestedScope: string
  tenantId?: string
  authorized: boolean
  reason: string
  trustScoreAtDecision: number
  decidedAt: string
}

const AUTHORIZATION_LOG: AuthorizationResult[] = []
const CAP = 2000

export function authorize(
  identityId: string,
  capability: string,
  scope: string,
  tenantId?: string,
): AuthorizationResult {
  if (isRuntimePaused()) {
    logger.warn("authorize blocked: runtime paused", "capability-auth")
  }
  const identityCheck = validateIdentity(identityId)
  const ts = getTrustScore(identityId)
  const trustScore = ts?.score ?? 0
  let authorized = false
  let reason = ""
  if (!identityCheck.valid) {
    reason = `Identity invalid: ${identityCheck.reason}`
  } else if (trustScore < 50) {
    reason = `Trust score ${trustScore} below minimum threshold of 50`
  } else {
    const identity = getIdentity(identityId)
    if (!identity?.scopes.includes(scope)) {
      reason = `Scope '${scope}' not granted to identity`
    } else {
      authorized = true
      reason = "All checks passed"
    }
  }
  const result: AuthorizationResult = {
    authorizationId: crypto.randomUUID(),
    identityId,
    requestedCapability: capability,
    requestedScope: scope,
    tenantId,
    authorized,
    reason,
    trustScoreAtDecision: trustScore,
    decidedAt: new Date().toISOString(),
  }
  if (AUTHORIZATION_LOG.length >= CAP) AUTHORIZATION_LOG.shift()
  AUTHORIZATION_LOG.push(result)
  logger.info(`Auth ${authorized ? "granted" : "denied"}: ${identityId} → ${capability}/${scope}`, "capability-auth", { tenantId })
  return result
}

export function isAuthorized(identityId: string, capability: string, scope: string): boolean {
  const result = authorize(identityId, capability, scope)
  return result.authorized
}

export function getAuthorizationHistory(identityId: string, limit = 50): AuthorizationResult[] {
  return AUTHORIZATION_LOG
    .filter((r) => r.identityId === identityId)
    .slice(-limit)
}

export function getAuthStats(): {
  total: number; authorized: number; denied: number; byCapability: Record<string, number>
} {
  let authorized = 0, denied = 0
  const byCapability: Record<string, number> = {}
  for (const r of AUTHORIZATION_LOG) {
    if (r.authorized) authorized++; else denied++
    byCapability[r.requestedCapability] = (byCapability[r.requestedCapability] ?? 0) + 1
  }
  return { total: AUTHORIZATION_LOG.length, authorized, denied, byCapability }
}
