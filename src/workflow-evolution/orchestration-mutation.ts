import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type MutationType =
  | "step_reorder" | "step_parallelize" | "retry_adjustment" | "timeout_tuning"
  | "step_merge" | "step_split" | "route_optimization" | "checkpoint_addition"

export interface OrchestrationMutation {
  mutationId: string
  workflowType: string
  generationId: string
  tenantId?: string
  mutationType: MutationType
  description: string
  safetyScore: number
  replaySafe: boolean
  rollbackPlan: string
  proposedAt: string
  status: "proposed" | "approved" | "applied" | "rejected" | "rolled_back"
}

const MUTATIONS: OrchestrationMutation[] = []
const MUTATION_CAP = 500

const SAFETY_SCORES: Record<MutationType, number> = {
  step_reorder: 80, step_parallelize: 70, retry_adjustment: 90, timeout_tuning: 85,
  step_merge: 60, step_split: 65, route_optimization: 88, checkpoint_addition: 95,
}
const REPLAY_UNSAFE = new Set<MutationType>(["step_merge", "step_split"])

export function proposeMutation(
  workflowType: string,
  generationId: string,
  type: MutationType,
  description: string,
  tenantId?: string,
): OrchestrationMutation {
  if (isRuntimePaused()) throw new Error("Runtime is paused — mutations blocked")
  if (MUTATIONS.length >= MUTATION_CAP) MUTATIONS.shift()
  const mutation: OrchestrationMutation = {
    mutationId: crypto.randomUUID(),
    workflowType,
    generationId,
    tenantId,
    mutationType: type,
    description,
    safetyScore: SAFETY_SCORES[type],
    replaySafe: !REPLAY_UNSAFE.has(type),
    rollbackPlan: `Revert ${type} for ${workflowType} generation ${generationId}`,
    proposedAt: new Date().toISOString(),
    status: "proposed",
  }
  MUTATIONS.push(mutation)
  logger.info(`Mutation proposed: ${type} for ${workflowType}`, "orchestration-mutation", {
    metadata: { mutationId: mutation.mutationId, safetyScore: mutation.safetyScore },
  })
  return mutation
}

export function approveMutation(mutationId: string): void {
  const m = MUTATIONS.find(m => m.mutationId === mutationId)
  if (m) m.status = "approved"
}

export function applyMutation(mutationId: string): void {
  const m = MUTATIONS.find(m => m.mutationId === mutationId)
  if (m) m.status = "applied"
}

export function rejectMutation(mutationId: string): void {
  const m = MUTATIONS.find(m => m.mutationId === mutationId)
  if (m) m.status = "rejected"
}

export function rollbackMutation(mutationId: string): void {
  const m = MUTATIONS.find(m => m.mutationId === mutationId)
  if (m) m.status = "rolled_back"
}

export function getMutationStats(): { total: number; byStatus: Record<string, number>; byType: Record<string, number>; avgSafetyScore: number } {
  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  let totalSafety = 0
  for (const m of MUTATIONS) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
    byType[m.mutationType] = (byType[m.mutationType] ?? 0) + 1
    totalSafety += m.safetyScore
  }
  const avgSafetyScore = MUTATIONS.length > 0 ? totalSafety / MUTATIONS.length : 0
  return { total: MUTATIONS.length, byStatus, byType, avgSafetyScore }
}
