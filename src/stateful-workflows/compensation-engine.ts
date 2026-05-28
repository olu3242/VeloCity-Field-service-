import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface CompensationStep {
  stepId: string
  workflowId: string
  tenantId?: string
  originalStepName: string
  originalStepIndex: number
  compensationAction: string
  status: "pending" | "running" | "completed" | "failed" | "skipped"
  startedAt?: string
  completedAt?: string
  error?: string
}

export interface CompensationPlan {
  planId: string
  workflowId: string
  tenantId?: string
  triggerReason: string
  steps: CompensationStep[]
  status: "pending" | "running" | "completed" | "partial" | "failed"
  createdAt: string
  completedAt?: string
}

const COMPENSATION_PLANS: Map<string, CompensationPlan> = new Map()
const PLAN_CAP = 500

export function createCompensationPlan(
  workflowId: string,
  triggerReason: string,
  steps: Omit<CompensationStep, "stepId" | "workflowId" | "tenantId" | "status">[],
  tenantId?: string,
): CompensationPlan {
  if (isRuntimePaused()) {
    logger.warn("createCompensationPlan blocked: runtime is paused", "compensation-engine", {
      metadata: { workflowId },
    })
    throw new Error("Runtime is paused — compensation plan creation blocked")
  }
  if (COMPENSATION_PLANS.size >= PLAN_CAP) {
    const oldest = Array.from(COMPENSATION_PLANS.keys())[0]
    if (oldest !== undefined) COMPENSATION_PLANS.delete(oldest)
  }
  const compensationSteps: CompensationStep[] = steps.map((s) => ({
    ...s,
    stepId: crypto.randomUUID(),
    workflowId,
    tenantId,
    status: "pending",
  }))
  const plan: CompensationPlan = {
    planId: crypto.randomUUID(),
    workflowId,
    tenantId,
    triggerReason,
    steps: compensationSteps,
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  COMPENSATION_PLANS.set(plan.planId, plan)
  logger.info("Compensation plan created", "compensation-engine", {
    metadata: { planId: plan.planId, workflowId, stepCount: steps.length },
  })
  return plan
}

export function advanceCompensation(
  planId: string,
  stepId: string,
  outcome: "completed" | "failed" | "skipped",
  error?: string,
): void {
  const plan = COMPENSATION_PLANS.get(planId)
  if (!plan) return
  const step = plan.steps.find((s) => s.stepId === stepId)
  if (!step) return
  const now = new Date().toISOString()
  step.status = outcome
  step.completedAt = now
  if (outcome === "failed" && error !== undefined) step.error = error
  if (plan.status === "pending") {
    plan.status = "running"
  }
}

export function completeCompensation(planId: string): void {
  const plan = COMPENSATION_PLANS.get(planId)
  if (!plan) return
  const hasFailed = plan.steps.some((s) => s.status === "failed")
  const hasCompleted = plan.steps.some((s) => s.status === "completed")
  plan.status = hasFailed && hasCompleted ? "partial" : hasFailed ? "failed" : "completed"
  plan.completedAt = new Date().toISOString()
  logger.info(`Compensation ${plan.status}`, "compensation-engine", { metadata: { planId } })
}

export function getActivePlans(tenantId?: string): CompensationPlan[] {
  return Array.from(COMPENSATION_PLANS.values()).filter(
    (p) =>
      (p.status === "pending" || p.status === "running") &&
      (tenantId === undefined || p.tenantId === tenantId),
  )
}

export function getCompensationSummary(): {
  total: number
  byStatus: Record<string, number>
} {
  const byStatus: Record<string, number> = {}
  for (const p of Array.from(COMPENSATION_PLANS.values())) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
  }
  return { total: COMPENSATION_PLANS.size, byStatus }
}
