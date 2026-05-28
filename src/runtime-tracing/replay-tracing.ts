import { logger } from "@/runtime-core/observability"

export interface ReplayStepComparison {
  stepIndex: number
  originalDurationMs?: number
  replayDurationMs?: number
  deterministic: boolean
  divergenceNote?: string
}

export interface ReplayTrace {
  replayTraceId: string
  originalExecutionId: string
  replayExecutionId: string
  tenantId?: string
  correlationId: string
  stepComparisons: ReplayStepComparison[]
  overallDeterministic: boolean
  divergedSteps: number
  tracedAt: string
}

const REPLAY_TRACES: ReplayTrace[] = []
const MAX_REPLAY_TRACES = 500

export function traceReplay(
  originalExecId: string,
  replayExecId: string,
  steps: ReplayStepComparison[],
  tenantId?: string
): ReplayTrace {
  if (REPLAY_TRACES.length >= MAX_REPLAY_TRACES) REPLAY_TRACES.shift()

  const divergedSteps = steps.filter((s) => !s.deterministic).length
  const overallDeterministic = divergedSteps === 0

  const trace: ReplayTrace = {
    replayTraceId: crypto.randomUUID(),
    originalExecutionId: originalExecId,
    replayExecutionId: replayExecId,
    tenantId,
    correlationId: crypto.randomUUID(),
    stepComparisons: steps,
    overallDeterministic,
    divergedSteps,
    tracedAt: new Date().toISOString(),
  }

  REPLAY_TRACES.push(trace)
  logger.info(
    `Replay traced: ${originalExecId} deterministic=${overallDeterministic}`,
    "replay-tracing"
  )
  return trace
}

export function getReplayTrace(originalExecId: string): ReplayTrace | undefined {
  return REPLAY_TRACES.find((t) => t.originalExecutionId === originalExecId)
}

export function getDivergentReplays(): ReplayTrace[] {
  return REPLAY_TRACES.filter((t) => !t.overallDeterministic)
}

export function getReplayTraceSummary(): {
  total: number
  deterministic: number
  divergent: number
  avgDivergenceRate: number
} {
  const total = REPLAY_TRACES.length
  const deterministic = REPLAY_TRACES.filter((t) => t.overallDeterministic).length
  const divergent = total - deterministic
  const avgDivergenceRate =
    total > 0
      ? REPLAY_TRACES.reduce((sum, t) => {
          const rate =
            t.stepComparisons.length > 0 ? t.divergedSteps / t.stepComparisons.length : 0
          return sum + rate
        }, 0) / total
      : 0
  return { total, deterministic, divergent, avgDivergenceRate }
}
