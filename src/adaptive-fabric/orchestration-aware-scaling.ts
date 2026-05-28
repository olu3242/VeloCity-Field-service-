import { logger } from "@/runtime-core/observability"

export interface ScalingConstraints {
  minCapacity: number
  maxCapacity: number
  cooldownMs: number
  maxScaleStep: number
}

export interface OrchestrationScalingContext {
  contextId: string
  region?: string
  tenantId?: string
  activeWorkflowTypes: string[]
  criticalWorkflowTypes: string[]
  scalingConstraints: ScalingConstraints
  recommendedCapacity: number
  safeToScaleNow: boolean
  reason: string
  evaluatedAt: string
}

const CONTEXTS: OrchestrationScalingContext[] = []
const CAP = 200

export function evaluateScalingContext(
  activeWorkflowTypes: string[],
  criticalWorkflowTypes: string[],
  currentCapacity: number,
  constraints: ScalingConstraints,
  region?: string,
  tenantId?: string
): OrchestrationScalingContext {
  if (CONTEXTS.length >= CAP) CONTEXTS.shift()

  const safeToScaleNow = criticalWorkflowTypes.length === 0
  const scaleFactor = safeToScaleNow ? 1.5 : 1.2
  const rawRecommended = currentCapacity * scaleFactor
  const recommendedCapacity = Math.max(
    constraints.minCapacity,
    Math.min(constraints.maxCapacity, rawRecommended)
  )

  const reason = safeToScaleNow
    ? "No critical workflows active — safe to scale"
    : `Critical workflows active: ${criticalWorkflowTypes.join(", ")}`

  const context: OrchestrationScalingContext = {
    contextId: crypto.randomUUID(),
    region,
    tenantId,
    activeWorkflowTypes: [...activeWorkflowTypes],
    criticalWorkflowTypes: [...criticalWorkflowTypes],
    scalingConstraints: { ...constraints },
    recommendedCapacity,
    safeToScaleNow,
    reason,
    evaluatedAt: new Date().toISOString(),
  }
  CONTEXTS.push(context)
  logger.info(`Scaling context evaluated: safe=${safeToScaleNow}`, "orchestration-aware-scaling")
  return context
}

export function getLatestContext(region?: string): OrchestrationScalingContext | undefined {
  const filtered = region ? CONTEXTS.filter(c => c.region === region) : CONTEXTS
  return filtered[filtered.length - 1]
}

export function getContextSummary(): {
  total: number
  safeToScale: number
  avgRecommendedCapacity: number
} {
  let safeToScale = 0
  let totalCapacity = 0
  for (const c of CONTEXTS) {
    if (c.safeToScaleNow) safeToScale += 1
    totalCapacity += c.recommendedCapacity
  }
  return {
    total: CONTEXTS.length,
    safeToScale,
    avgRecommendedCapacity: CONTEXTS.length > 0 ? totalCapacity / CONTEXTS.length : 0,
  }
}
