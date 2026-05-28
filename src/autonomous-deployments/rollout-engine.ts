import { logger } from "@/runtime-core/observability"
import type { DeploymentStrategy } from "./deployment-plan"

export interface RolloutStage {
  stageId: string
  planId: string
  stageName: string
  targetPct: number
  durationMs: number
  status: "pending" | "active" | "completed" | "aborted"
  startedAt?: string
  completedAt?: string
  metricsSnapshot?: {
    errorRate: number
    p99LatencyMs: number
    successRate: number
  }
}

const ROLLOUT_STAGES: Map<string, RolloutStage[]> = new Map()

function stagePercentages(strategy: DeploymentStrategy): number[] {
  switch (strategy) {
    case "rolling": return [10, 25, 50, 75, 100]
    case "canary": return [1, 5, 10, 25, 50, 100]
    case "blue_green": return [0, 100]
    case "shadow": return [100]
    case "feature_flag": return [100]
  }
}

export function createRolloutStages(planId: string, strategy: DeploymentStrategy): RolloutStage[] {
  const pcts = stagePercentages(strategy)
  const stages: RolloutStage[] = pcts.map((pct, i) => ({
    stageId: crypto.randomUUID(),
    planId,
    stageName: pct === 0 ? "warmup" : pct === 100 ? "production" : `${strategy}-${pct}pct`,
    targetPct: pct,
    durationMs: pct === 100 ? 300_000 : Math.max(60_000, pct * 1_000),
    status: i === 0 ? "active" : "pending",
    startedAt: i === 0 ? new Date().toISOString() : undefined,
  }))
  ROLLOUT_STAGES.set(planId, stages)
  logger.info(`Rollout stages created for plan ${planId}`, "rollout-engine", { metadata: { strategy, stageCount: stages.length } })
  return stages
}

function findStage(stageId: string): RolloutStage | undefined {
  for (const stages of Array.from(ROLLOUT_STAGES.values())) {
    const found = stages.find((s) => s.stageId === stageId)
    if (found) return found
  }
  return undefined
}

export function activateStage(stageId: string): void {
  const stage = findStage(stageId)
  if (!stage) throw new Error(`Stage not found: ${stageId}`)
  stage.status = "active"
  stage.startedAt = new Date().toISOString()
}

export function completeStage(
  stageId: string,
  metrics?: RolloutStage["metricsSnapshot"]
): void {
  const stage = findStage(stageId)
  if (!stage) throw new Error(`Stage not found: ${stageId}`)
  stage.status = "completed"
  stage.completedAt = new Date().toISOString()
  if (metrics) stage.metricsSnapshot = metrics
}

export function abortStage(stageId: string): void {
  const stage = findStage(stageId)
  if (!stage) throw new Error(`Stage not found: ${stageId}`)
  stage.status = "aborted"
  stage.completedAt = new Date().toISOString()
}

export function getCurrentStage(planId: string): RolloutStage | undefined {
  const stages = ROLLOUT_STAGES.get(planId)
  if (!stages) return undefined
  return stages.find((s) => s.status === "active")
}

export function getRolloutProgress(planId: string): {
  currentStage: number
  totalStages: number
  currentPct: number
} {
  const stages = ROLLOUT_STAGES.get(planId) ?? []
  const totalStages = stages.length
  const completedCount = stages.filter((s) => s.status === "completed").length
  const active = stages.find((s) => s.status === "active")
  const currentStage = completedCount + (active ? 1 : 0)
  const currentPct = active?.targetPct ?? (stages.at(-1)?.status === "completed" ? 100 : 0)
  return { currentStage, totalStages, currentPct }
}
