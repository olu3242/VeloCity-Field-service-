import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ReplayPlan {
  planId: string
  workflowId: string
  tenantId?: string
  fromCheckpointId?: string
  fromSequence: number
  targetStepIndex?: number
  status: "planned" | "replaying" | "completed" | "failed" | "aborted"
  replayedEventCount: number
  startedAt?: string
  completedAt?: string
  error?: string
  createdAt: string
}

const REPLAY_PLANS: Map<string, ReplayPlan> = new Map()
const REPLAY_CAP = 200

export function createReplayPlan(
  workflowId: string,
  options?: {
    fromCheckpointId?: string
    fromSequence?: number
    targetStepIndex?: number
    tenantId?: string
  },
): ReplayPlan {
  if (isRuntimePaused()) {
    logger.warn("createReplayPlan blocked: runtime is paused", "replay-engine", {
      metadata: { workflowId },
    })
    throw new Error("Runtime is paused — replay plan creation blocked")
  }
  if (REPLAY_PLANS.size >= REPLAY_CAP) {
    const oldest = Array.from(REPLAY_PLANS.keys())[0]
    if (oldest !== undefined) REPLAY_PLANS.delete(oldest)
  }
  const plan: ReplayPlan = {
    planId: crypto.randomUUID(),
    workflowId,
    tenantId: options?.tenantId,
    fromCheckpointId: options?.fromCheckpointId,
    fromSequence: options?.fromSequence ?? 1,
    targetStepIndex: options?.targetStepIndex,
    status: "planned",
    replayedEventCount: 0,
    createdAt: new Date().toISOString(),
  }
  REPLAY_PLANS.set(plan.planId, plan)
  logger.info("Replay plan created", "replay-engine", { metadata: { planId: plan.planId, workflowId } })
  return plan
}

export function startReplay(planId: string): void {
  const plan = REPLAY_PLANS.get(planId)
  if (!plan) return
  plan.status = "replaying"
  plan.startedAt = new Date().toISOString()
}

export function replayEvent(planId: string): void {
  const plan = REPLAY_PLANS.get(planId)
  if (!plan || plan.status !== "replaying") return
  plan.replayedEventCount += 1
}

export function completeReplay(planId: string): void {
  const plan = REPLAY_PLANS.get(planId)
  if (!plan) return
  plan.status = "completed"
  plan.completedAt = new Date().toISOString()
  logger.info("Replay completed", "replay-engine", {
    metadata: { planId, replayedEventCount: plan.replayedEventCount },
  })
}

export function abortReplay(planId: string, error?: string): void {
  const plan = REPLAY_PLANS.get(planId)
  if (!plan) return
  plan.status = "aborted"
  plan.completedAt = new Date().toISOString()
  plan.error = error
  logger.warn("Replay aborted", "replay-engine", { metadata: { planId, error } })
}

export function getReplaySummary(): {
  total: number
  byStatus: Record<string, number>
  avgEventsReplayed: number
} {
  const plans = Array.from(REPLAY_PLANS.values())
  const byStatus: Record<string, number> = {}
  let totalEvents = 0
  for (const p of plans) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
    totalEvents += p.replayedEventCount
  }
  return {
    total: plans.length,
    byStatus,
    avgEventsReplayed: plans.length > 0 ? totalEvents / plans.length : 0,
  }
}
