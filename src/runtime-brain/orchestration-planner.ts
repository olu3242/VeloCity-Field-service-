import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { recordDecision } from "./runtime-brain"

export interface OrchestrationPlan {
  planId: string
  workflowType: string
  tenantId?: string
  correlationId: string
  recommendedStrategy: string
  stepRecommendations: {
    stepName: string
    recommendedWorker: string
    priorityBoost: boolean
    reason: string
  }[]
  confidence: number
  reasoning: string
  createdAt: string
}

const PLANS: OrchestrationPlan[] = []
const CAP = 500

function pickStrategy(stepCount: number): string {
  if (stepCount <= 3) return "sequential_saga"
  if (stepCount <= 8) return "parallel_fan_out"
  return "compensating_saga"
}

export function planOrchestration(
  workflowType: string,
  stepCount: number,
  correlationId: string,
  tenantId?: string,
): OrchestrationPlan {
  if (isRuntimePaused()) {
    logger.warn("planOrchestration blocked: runtime paused", "orchestration-planner")
  }
  const strategy = pickStrategy(stepCount)
  const rawConfidence = 0.75 + 0.05 * Math.min(5, stepCount / 2)
  const confidence = Math.min(0.95, rawConfidence)
  const stepRecommendations = Array.from({ length: stepCount }, (_, i) => ({
    stepName: `step_${i + 1}`,
    recommendedWorker: `worker-pool-${(i % 3) + 1}`,
    priorityBoost: i === 0,
    reason: i === 0 ? "Entry step gets priority boost" : `Standard allocation for step ${i + 1}`,
  }))
  const plan: OrchestrationPlan = {
    planId: crypto.randomUUID(),
    workflowType,
    tenantId,
    correlationId,
    recommendedStrategy: strategy,
    stepRecommendations,
    confidence,
    reasoning: `Workflow '${workflowType}' with ${stepCount} steps maps to strategy '${strategy}'`,
    createdAt: new Date().toISOString(),
  }
  if (PLANS.length >= CAP) PLANS.shift()
  PLANS.push(plan)
  recordDecision("orchestration", confidence)
  logger.info(`Orchestration plan created: ${strategy}`, "orchestration-planner", { correlationId, tenantId })
  return plan
}

export function getLatestPlan(workflowType: string): OrchestrationPlan | undefined {
  for (let i = PLANS.length - 1; i >= 0; i--) {
    if (PLANS[i]?.workflowType === workflowType) return PLANS[i]
  }
  return undefined
}

export function getPlanStats(): { total: number; byStrategy: Record<string, number>; avgConfidence: number } {
  const byStrategy: Record<string, number> = {}
  let totalConf = 0
  for (const p of PLANS) {
    byStrategy[p.recommendedStrategy] = (byStrategy[p.recommendedStrategy] ?? 0) + 1
    totalConf += p.confidence
  }
  return {
    total: PLANS.length,
    byStrategy,
    avgConfidence: PLANS.length > 0 ? totalConf / PLANS.length : 0,
  }
}
