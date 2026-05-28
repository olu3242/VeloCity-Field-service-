import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface AffinityRule {
  ruleId: string
  tenantId?: string
  workflowType?: string
  preferredRegion: string
  preferredPartitionId?: string
  priority: number
  createdAt: string
  active: boolean
}

const AFFINITY_RULES: AffinityRule[] = []
const RULES_CAP = 500

export function createAffinityRule(
  preferredRegion: string,
  options?: {
    tenantId?: string
    workflowType?: string
    preferredPartitionId?: string
    priority?: number
  },
): AffinityRule {
  if (isRuntimePaused()) {
    logger.warn("createAffinityRule blocked: runtime is paused", "runtime-affinity")
    throw new Error("Runtime is paused — affinity rule creation blocked")
  }
  if (AFFINITY_RULES.length >= RULES_CAP) {
    AFFINITY_RULES.pop()
  }
  const rule: AffinityRule = {
    ruleId: crypto.randomUUID(),
    tenantId: options?.tenantId,
    workflowType: options?.workflowType,
    preferredRegion,
    preferredPartitionId: options?.preferredPartitionId,
    priority: options?.priority ?? 0,
    createdAt: new Date().toISOString(),
    active: true,
  }
  AFFINITY_RULES.push(rule)
  AFFINITY_RULES.sort((a, b) => b.priority - a.priority)
  logger.info("Affinity rule created", "runtime-affinity", {
    metadata: { ruleId: rule.ruleId, preferredRegion, priority: rule.priority },
  })
  return rule
}

export function deactivateRule(ruleId: string): void {
  const rule = AFFINITY_RULES.find((r) => r.ruleId === ruleId)
  if (rule) rule.active = false
}

export function resolveAffinity(
  workflowType?: string,
  tenantId?: string,
): AffinityRule | undefined {
  const active = AFFINITY_RULES.filter((r) => r.active)
  // tenantId exact match first
  if (tenantId !== undefined) {
    const match = active.find((r) => r.tenantId === tenantId)
    if (match) return match
  }
  // workflowType match next
  if (workflowType !== undefined) {
    const match = active.find((r) => r.workflowType === workflowType && r.tenantId === undefined)
    if (match) return match
  }
  // wildcard (no tenantId, no workflowType)
  return active.find((r) => r.tenantId === undefined && r.workflowType === undefined)
}

export function getAffinityRules(tenantId?: string): AffinityRule[] {
  if (tenantId === undefined) return [...AFFINITY_RULES]
  return AFFINITY_RULES.filter((r) => r.tenantId === tenantId)
}

export function getRuleCount(): number {
  return AFFINITY_RULES.length
}
