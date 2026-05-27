import { isRuntimePaused } from "@/lib/governance/operator"

export interface RemediationPlan {
  id: string
  incidentId: string
  steps: { order: number; action: string; estimatedMs: number }[]
  status: "draft" | "approved" | "executing" | "completed" | "failed"
  autoApproved: boolean
  createdAt: string
  executedAt?: string
  completedAt?: string
  outcome?: string
}

const PLANS: RemediationPlan[] = []
const CAP = 100

export function createRemediationPlan(
  incidentId: string,
  steps: { order: number; action: string; estimatedMs: number }[],
  autoApprove = false
): RemediationPlan {
  if (isRuntimePaused()) {
    throw new Error("Cannot create remediation plan: runtime is paused")
  }

  const plan: RemediationPlan = {
    id: crypto.randomUUID(),
    incidentId,
    steps,
    status: autoApprove ? "approved" : "draft",
    autoApproved: autoApprove,
    createdAt: new Date().toISOString(),
  }

  if (PLANS.length >= CAP) PLANS.shift()
  PLANS.push(plan)
  return plan
}

export function approveAndExecute(id: string): void {
  const plan = PLANS.find(p => p.id === id)
  if (!plan) return
  plan.status = "executing"
  plan.executedAt = new Date().toISOString()
}

export function completeRemediation(id: string, outcome: string): void {
  const plan = PLANS.find(p => p.id === id)
  if (!plan) return
  plan.status = "completed"
  plan.outcome = outcome
  plan.completedAt = new Date().toISOString()
}

export function getActivePlans(): RemediationPlan[] {
  return PLANS.filter(p => p.status === "approved" || p.status === "executing")
}

export function getRemediationStats(): { total: number; successRate: number; avgDurationMs: number } {
  const completed = PLANS.filter(p => p.status === "completed")
  const durations = completed
    .filter(p => p.executedAt !== undefined && p.completedAt !== undefined)
    .map(p => new Date(p.completedAt!).getTime() - new Date(p.executedAt!).getTime())
  return {
    total: PLANS.length,
    successRate: PLANS.length > 0 ? completed.length / PLANS.length : 0,
    avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
  }
}
