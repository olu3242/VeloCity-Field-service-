import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface FederationTrustPolicy {
  policyId: string
  federationId: string
  trustLevel: "isolated" | "observer" | "participant" | "partner"
  allowedEventTypes: string[]
  allowedWorkflowTypes: string[]
  requiresSignedPackets: boolean
  dataResidencyRegions: string[]
  createdAt: string
  expiresAt?: string
  active: boolean
}

const FEDERATION_POLICIES: Map<string, FederationTrustPolicy> = new Map()
const CAP = 100

export function registerFederationPolicy(
  federationId: string,
  level: FederationTrustPolicy["trustLevel"],
  options?: {
    allowedEventTypes?: string[]
    allowedWorkflowTypes?: string[]
    requiresSignedPackets?: boolean
    dataResidencyRegions?: string[]
    expiresAt?: string
  },
): FederationTrustPolicy {
  if (isRuntimePaused()) {
    logger.warn("registerFederationPolicy blocked: runtime paused", "federation-trust")
    throw new Error("Runtime is paused — federation policy registration blocked")
  }
  if (FEDERATION_POLICIES.size >= CAP) {
    const firstKey = Array.from(FEDERATION_POLICIES.keys())[0]
    if (firstKey) FEDERATION_POLICIES.delete(firstKey)
  }
  const policy: FederationTrustPolicy = {
    policyId: crypto.randomUUID(),
    federationId,
    trustLevel: level,
    allowedEventTypes: options?.allowedEventTypes ?? [],
    allowedWorkflowTypes: options?.allowedWorkflowTypes ?? [],
    requiresSignedPackets: options?.requiresSignedPackets ?? (level === "partner"),
    dataResidencyRegions: options?.dataResidencyRegions ?? [],
    createdAt: new Date().toISOString(),
    expiresAt: options?.expiresAt,
    active: true,
  }
  FEDERATION_POLICIES.set(federationId, policy)
  logger.info(`Federation policy registered: ${federationId} [${level}]`, "federation-trust")
  return policy
}

export function deactivatePolicy(federationId: string): void {
  const policy = FEDERATION_POLICIES.get(federationId)
  if (policy) policy.active = false
}

export function canReceiveEventType(federationId: string, eventType: string): boolean {
  const policy = FEDERATION_POLICIES.get(federationId)
  if (!policy || !policy.active) return false
  if (policy.expiresAt && new Date(policy.expiresAt) < new Date()) return false
  return policy.allowedEventTypes.includes(eventType)
}

export function canExecuteWorkflowType(federationId: string, workflowType: string): boolean {
  const policy = FEDERATION_POLICIES.get(federationId)
  if (!policy || !policy.active) return false
  if (policy.expiresAt && new Date(policy.expiresAt) < new Date()) return false
  return policy.allowedWorkflowTypes.includes(workflowType)
}

export function getPolicyReport(): {
  total: number; active: number; byTrustLevel: Record<string, number>
} {
  let active = 0
  const byTrustLevel: Record<string, number> = {}
  for (const policy of Array.from(FEDERATION_POLICIES.values())) {
    byTrustLevel[policy.trustLevel] = (byTrustLevel[policy.trustLevel] ?? 0) + 1
    if (policy.active) active++
  }
  return { total: FEDERATION_POLICIES.size, active, byTrustLevel }
}
