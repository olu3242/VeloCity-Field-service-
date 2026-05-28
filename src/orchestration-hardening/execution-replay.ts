import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type ReplayStrategy = "full_replay" | "partial_resume" | "checkpoint_resume" | "compensation"
export interface ReplayRequest {
  replayId: string; originalExecutionId: string; tenantId?: string
  strategy: ReplayStrategy; startFromStep: number; reason: string
  status: "queued" | "replaying" | "completed" | "failed"
  queuedAt: string; startedAt?: string; completedAt?: string
  stepsReplayed: number; intelligenceGained: string[]
}

const REQUESTS: ReplayRequest[] = []
const REQUESTS_CAP = 500

export function queueReplay(
  originalExecId: string, strategy: ReplayStrategy, startFromStep: number,
  reason: string, tenantId?: string
): ReplayRequest {
  if (isRuntimePaused()) {
    logger.warn("execution-replay", { msg: "runtime paused, replay blocked", originalExecId })
    throw new Error("Runtime is paused")
  }
  const request: ReplayRequest = {
    replayId: crypto.randomUUID(), originalExecutionId: originalExecId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    strategy, startFromStep, reason, status: "queued",
    queuedAt: new Date().toISOString(), stepsReplayed: 0, intelligenceGained: [],
  }
  REQUESTS.push(request)
  if (REQUESTS.length > REQUESTS_CAP) REQUESTS.splice(0, REQUESTS.length - REQUESTS_CAP)
  logger.info("execution-replay", { replayId: request.replayId, originalExecId, strategy })
  return request
}

export function startReplay(replayId: string): void {
  const req = REQUESTS.find(r => r.replayId === replayId)
  if (!req) return
  req.status = "replaying"
  req.startedAt = new Date().toISOString()
}

export function completeReplay(replayId: string, stepsReplayed: number, intelligenceGained: string[]): void {
  const req = REQUESTS.find(r => r.replayId === replayId)
  if (!req) return
  req.status = "completed"
  req.completedAt = new Date().toISOString()
  req.stepsReplayed = stepsReplayed
  req.intelligenceGained = intelligenceGained
  logger.info("execution-replay", { replayId, stepsReplayed, intelligenceGained })
}

export function failReplay(replayId: string): void {
  const req = REQUESTS.find(r => r.replayId === replayId)
  if (!req) return
  req.status = "failed"
  req.completedAt = new Date().toISOString()
}

export function getReplay(originalExecId: string): ReplayRequest | undefined {
  return [...REQUESTS].reverse().find(r => r.originalExecutionId === originalExecId)
}

export function getReplaySummary(): {
  total: number; completed: number; failed: number; avgStepsReplayed: number; byStrategy: Record<string, number>
} {
  const total = REQUESTS.length
  const completed = REQUESTS.filter(r => r.status === "completed").length
  const failed = REQUESTS.filter(r => r.status === "failed").length
  const completedReqs = REQUESTS.filter(r => r.status === "completed")
  const avgStepsReplayed = completedReqs.length > 0
    ? completedReqs.reduce((s, r) => s + r.stepsReplayed, 0) / completedReqs.length : 0
  const byStrategy: Record<string, number> = {}
  for (const r of REQUESTS) byStrategy[r.strategy] = (byStrategy[r.strategy] ?? 0) + 1
  return { total, completed, failed, avgStepsReplayed, byStrategy }
}
