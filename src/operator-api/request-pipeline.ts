/**
 * Request Pipeline — request processing pipeline with tracing and idempotency.
 */

import { logger } from "@/runtime-core/observability"
import { type OperatorRequest } from "./api-contract"

export type PipelineStage = "auth" | "idempotency" | "validation" | "execution" | "response"

export interface PipelineExecution {
  pipelineId: string
  requestId: string
  correlationId: string
  tenantId?: string
  operation: string
  stagesCompleted: PipelineStage[]
  currentStage?: PipelineStage
  status: "running" | "completed" | "failed"
  startedAt: string
  completedAt?: string
  durationMs?: number
  error?: string
}

const PIPELINE_LOG: PipelineExecution[] = []
const PIPELINE_LOG_CAP = 1000

function findPipeline(pipelineId: string): PipelineExecution | undefined {
  return PIPELINE_LOG.find((p) => p.pipelineId === pipelineId)
}

export function startPipeline(request: OperatorRequest): PipelineExecution {
  const exec: PipelineExecution = {
    pipelineId: crypto.randomUUID(),
    requestId: request.requestId,
    correlationId: request.correlationId,
    tenantId: request.tenantId,
    operation: request.operation,
    stagesCompleted: [],
    currentStage: "auth",
    status: "running",
    startedAt: new Date().toISOString(),
  }
  if (PIPELINE_LOG.length >= PIPELINE_LOG_CAP) PIPELINE_LOG.shift()
  PIPELINE_LOG.push(exec)
  logger.debug(`Pipeline started: ${request.operation}`, "request-pipeline", {
    metadata: { pipelineId: exec.pipelineId, requestId: request.requestId },
  })
  return exec
}

export function advanceStage(pipelineId: string, stage: PipelineStage): void {
  const exec = findPipeline(pipelineId)
  if (!exec) return
  if (exec.currentStage) exec.stagesCompleted.push(exec.currentStage)
  exec.currentStage = stage
}

export function completePipeline(pipelineId: string): void {
  const exec = findPipeline(pipelineId)
  if (!exec) return
  if (exec.currentStage) exec.stagesCompleted.push(exec.currentStage)
  exec.currentStage = undefined
  exec.status = "completed"
  exec.completedAt = new Date().toISOString()
  exec.durationMs = new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()
}

export function failPipeline(pipelineId: string, stage: PipelineStage, error: string): void {
  const exec = findPipeline(pipelineId)
  if (!exec) return
  exec.stagesCompleted.push(stage)
  exec.currentStage = undefined
  exec.status = "failed"
  exec.error = error
  exec.completedAt = new Date().toISOString()
  exec.durationMs = new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()
  logger.error(`Pipeline failed at stage: ${stage}`, "request-pipeline", {
    metadata: { pipelineId, error },
  })
}

export function getPipelineStats(): {
  total: number
  completed: number
  failed: number
  avgDurationMs: number
  byOperation: Record<string, number>
} {
  const all = PIPELINE_LOG
  let completed = 0, failed = 0, totalDuration = 0, durationCount = 0
  const byOperation: Record<string, number> = {}

  for (const p of all) {
    if (p.status === "completed") completed++
    else if (p.status === "failed") failed++
    if (p.durationMs !== undefined) { totalDuration += p.durationMs; durationCount++ }
    byOperation[p.operation] = (byOperation[p.operation] ?? 0) + 1
  }

  return {
    total: all.length,
    completed,
    failed,
    avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    byOperation,
  }
}
