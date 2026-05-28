import { logger } from "@/runtime-core/observability"

export interface ExecutionLearning {
  learningId: string
  workflowType: string
  tenantId?: string
  sampleSize: number
  avgDurationMs: number
  p99DurationMs: number
  successRate: number
  topFailureReasons: string[]
  learnedOptimizations: string[]
  confidenceLevel: number
  lastUpdatedAt: string
}

const LEARNING: Map<string, ExecutionLearning> = new Map()

export function recordOutcome(
  workflowType: string,
  durationMs: number,
  success: boolean,
  failureReason?: string,
  tenantId?: string,
): ExecutionLearning {
  const existing = LEARNING.get(workflowType)
  if (existing) {
    const n = existing.sampleSize
    existing.avgDurationMs = (existing.avgDurationMs * n + durationMs) / (n + 1)
    existing.p99DurationMs = Math.max(existing.p99DurationMs, durationMs)
    existing.successRate = (existing.successRate * n + (success ? 1 : 0)) / (n + 1)
    existing.sampleSize += 1
    existing.confidenceLevel = Math.min(0.99, existing.sampleSize / 100)
    if (failureReason && !existing.topFailureReasons.includes(failureReason)) {
      existing.topFailureReasons = [...existing.topFailureReasons, failureReason].slice(-5)
    }
    existing.lastUpdatedAt = new Date().toISOString()
    return existing
  }
  const learning: ExecutionLearning = {
    learningId: crypto.randomUUID(),
    workflowType,
    tenantId,
    sampleSize: 1,
    avgDurationMs: durationMs,
    p99DurationMs: durationMs,
    successRate: success ? 1 : 0,
    topFailureReasons: failureReason ? [failureReason] : [],
    learnedOptimizations: [],
    confidenceLevel: Math.min(0.99, 1 / 100),
    lastUpdatedAt: new Date().toISOString(),
  }
  LEARNING.set(workflowType, learning)
  logger.info(`Learning recorded: ${workflowType}`, "execution-learning", {
    metadata: { sampleSize: 1, success },
  })
  return learning
}

export function getOptimizations(workflowType: string): string[] {
  return LEARNING.get(workflowType)?.learnedOptimizations ?? []
}

export function getAllLearnings(tenantId?: string): ExecutionLearning[] {
  return Array.from(LEARNING.values()).filter(l => !tenantId || l.tenantId === tenantId)
}

export function getLearningStats(): { totalWorkflowTypes: number; avgSuccessRate: number; avgConfidence: number } {
  const values = Array.from(LEARNING.values())
  const totalWorkflowTypes = LEARNING.size
  const avgSuccessRate = values.length > 0 ? values.reduce((s, l) => s + l.successRate, 0) / values.length : 0
  const avgConfidence = values.length > 0 ? values.reduce((s, l) => s + l.confidenceLevel, 0) / values.length : 0
  return { totalWorkflowTypes, avgSuccessRate, avgConfidence }
}
