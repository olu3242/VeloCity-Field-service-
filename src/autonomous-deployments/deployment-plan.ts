import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type DeploymentStrategy = "rolling" | "canary" | "blue_green" | "shadow" | "feature_flag"
export type DeploymentStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "rolled_back"
  | "failed"

export interface DeploymentPlan {
  planId: string
  name: string
  workflowType?: string
  tenantId?: string
  strategy: DeploymentStrategy
  status: DeploymentStatus
  targetVersion: string
  currentVersion?: string
  rolloutPct: number
  blastRadiusScore: number
  confidenceScore: number
  scheduledAt?: string
  startedAt?: string
  completedAt?: string
  rollbackTriggerThreshold: number
  createdBy: string
  createdAt: string
}

const PLANS: Map<string, DeploymentPlan> = new Map()
const PLANS_CAP = 500

export function createPlan(
  name: string,
  strategy: DeploymentStrategy,
  targetVersion: string,
  createdBy: string,
  options?: Partial<Pick<DeploymentPlan, "workflowType" | "tenantId" | "scheduledAt" | "currentVersion" | "rollbackTriggerThreshold" | "blastRadiusScore" | "confidenceScore">>
): DeploymentPlan {
  if (isRuntimePaused()) {
    throw new Error("Runtime is paused — cannot create deployment plan")
  }
  if (PLANS.size >= PLANS_CAP) {
    const firstKey = Array.from(PLANS.keys())[0]
    if (firstKey) PLANS.delete(firstKey)
  }
  const plan: DeploymentPlan = {
    planId: crypto.randomUUID(),
    name,
    strategy,
    targetVersion,
    createdBy,
    status: "draft",
    rolloutPct: 0,
    blastRadiusScore: options?.blastRadiusScore ?? 50,
    confidenceScore: options?.confidenceScore ?? 70,
    rollbackTriggerThreshold: options?.rollbackTriggerThreshold ?? 5,
    createdAt: new Date().toISOString(),
    workflowType: options?.workflowType,
    tenantId: options?.tenantId,
    scheduledAt: options?.scheduledAt,
    currentVersion: options?.currentVersion,
  }
  PLANS.set(plan.planId, plan)
  logger.info(`Deployment plan created: ${name}`, "autonomous-deployments", { metadata: { planId: plan.planId } })
  return plan
}

export function startDeployment(planId: string): void {
  const plan = PLANS.get(planId)
  if (!plan) throw new Error(`Plan not found: ${planId}`)
  plan.status = "running"
  plan.startedAt = new Date().toISOString()
}

export function pauseDeployment(planId: string): void {
  const plan = PLANS.get(planId)
  if (!plan) throw new Error(`Plan not found: ${planId}`)
  plan.status = "paused"
}

export function advanceRollout(planId: string, newPct: number): void {
  const plan = PLANS.get(planId)
  if (!plan) throw new Error(`Plan not found: ${planId}`)
  plan.rolloutPct = Math.max(plan.rolloutPct, Math.min(100, newPct))
}

export function completeDeployment(planId: string): void {
  const plan = PLANS.get(planId)
  if (!plan) throw new Error(`Plan not found: ${planId}`)
  plan.status = "completed"
  plan.rolloutPct = 100
  plan.completedAt = new Date().toISOString()
}

export function rollbackDeployment(planId: string): void {
  const plan = PLANS.get(planId)
  if (!plan) throw new Error(`Plan not found: ${planId}`)
  plan.status = "rolled_back"
  plan.completedAt = new Date().toISOString()
}

export function getPlan(planId: string): DeploymentPlan | undefined {
  return PLANS.get(planId)
}

export function getActivePlans(tenantId?: string): DeploymentPlan[] {
  const active: DeploymentStatus[] = ["running", "scheduled", "paused"]
  return Array.from(PLANS.values()).filter(
    (p) => active.includes(p.status) && (tenantId === undefined || p.tenantId === tenantId)
  )
}

export function getDeploymentSummary(): {
  total: number
  byStatus: Record<string, number>
  byStrategy: Record<string, number>
} {
  const byStatus: Record<string, number> = {}
  const byStrategy: Record<string, number> = {}
  for (const plan of Array.from(PLANS.values())) {
    byStatus[plan.status] = (byStatus[plan.status] ?? 0) + 1
    byStrategy[plan.strategy] = (byStrategy[plan.strategy] ?? 0) + 1
  }
  return { total: PLANS.size, byStatus, byStrategy }
}
