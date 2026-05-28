import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type PolicyScope = "platform" | "tenant" | "workflow" | "federation" | "execution"
export type PolicyAction = "allow" | "deny" | "require_approval" | "rate_limit" | "audit_only"

export interface RuntimePolicy {
  policyId: string
  name: string
  scope: PolicyScope
  tenantId?: string
  targetType: string
  targetPattern: string
  action: PolicyAction
  conditions: Record<string, unknown>
  priority: number
  active: boolean
  createdAt: string
  lastTriggeredAt?: string
  triggerCount: number
}

const POLICIES: Map<string, RuntimePolicy> = new Map()
const POLICIES_CAP = 1000

const ACTION_SEVERITY: Record<PolicyAction, number> = {
  deny: 5,
  require_approval: 4,
  rate_limit: 3,
  audit_only: 2,
  allow: 1,
}

export function createPolicy(
  name: string,
  scope: PolicyScope,
  targetType: string,
  targetPattern: string,
  action: PolicyAction,
  priority: number,
  tenantId?: string
): RuntimePolicy {
  if (isRuntimePaused()) {
    logger.warn("createPolicy blocked: runtime paused", "runtime-policy")
    throw new Error("Runtime is paused")
  }
  if (POLICIES.size >= POLICIES_CAP) {
    const firstKey = Array.from(POLICIES.keys())[0]
    if (firstKey !== undefined) POLICIES.delete(firstKey)
  }
  const policy: RuntimePolicy = {
    policyId: crypto.randomUUID(),
    name,
    scope,
    tenantId,
    targetType,
    targetPattern,
    action,
    conditions: {},
    priority,
    active: true,
    createdAt: new Date().toISOString(),
    triggerCount: 0,
  }
  POLICIES.set(policy.policyId, policy)
  logger.info(`Policy created: ${name}`, "runtime-policy", { metadata: { policyId: policy.policyId } })
  return policy
}

export function deactivatePolicy(policyId: string): void {
  const policy = POLICIES.get(policyId)
  if (!policy) return
  policy.active = false
}

export function evaluatePolicy(
  targetType: string,
  targetPattern: string,
  context: Record<string, unknown>,
  tenantId?: string
): { action: PolicyAction; matchedPolicies: RuntimePolicy[] } {
  void context
  const matched = Array.from(POLICIES.values()).filter((p) => {
    if (!p.active) return false
    if (p.targetType !== targetType) return false
    if (tenantId !== undefined && p.tenantId !== undefined && p.tenantId !== tenantId) return false
    // prefix match: policy pattern matches if targetPattern starts with it (or exact)
    if (targetPattern !== p.targetPattern && !targetPattern.startsWith(p.targetPattern.replace("*", ""))) {
      return false
    }
    return true
  })
  let strictest: PolicyAction = "allow"
  for (const p of matched) {
    if (ACTION_SEVERITY[p.action] > ACTION_SEVERITY[strictest]) {
      strictest = p.action
    }
  }
  return { action: strictest, matchedPolicies: matched }
}

export function recordTrigger(policyId: string): void {
  const policy = POLICIES.get(policyId)
  if (!policy) return
  policy.triggerCount++
  policy.lastTriggeredAt = new Date().toISOString()
}

export function getPolicySummary(): {
  total: number
  active: number
  byScope: Record<string, number>
  byAction: Record<string, number>
} {
  const byScope: Record<string, number> = {}
  const byAction: Record<string, number> = {}
  let active = 0
  for (const p of Array.from(POLICIES.values())) {
    byScope[p.scope] = (byScope[p.scope] ?? 0) + 1
    byAction[p.action] = (byAction[p.action] ?? 0) + 1
    if (p.active) active++
  }
  return { total: POLICIES.size, active, byScope, byAction }
}

export function _getAllPolicies(): RuntimePolicy[] {
  return Array.from(POLICIES.values())
}
