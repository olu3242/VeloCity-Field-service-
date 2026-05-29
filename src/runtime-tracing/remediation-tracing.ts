import { logger } from "@/runtime-core/observability"

export interface RemediationStep {
  stepId: string
  action: string
  subsystem: string
  startedAt: string
  completedAt?: string
  durationMs?: number
  success: boolean
  note?: string
}

export interface RemediationTrace {
  remediationTraceId: string
  incidentId: string
  tenantId?: string
  correlationId: string
  traceId: string
  steps: RemediationStep[]
  totalDurationMs?: number
  successful: boolean
  rolledBack: boolean
  tracedAt: string
}

const TRACES: RemediationTrace[] = []
const MAX_TRACES = 500

export function startRemediationTrace(
  incidentId: string,
  correlationId: string,
  traceId: string,
  tenantId?: string
): RemediationTrace {
  if (TRACES.length >= MAX_TRACES) TRACES.shift()

  const trace: RemediationTrace = {
    remediationTraceId: crypto.randomUUID(),
    incidentId,
    tenantId,
    correlationId,
    traceId,
    steps: [],
    successful: false,
    rolledBack: false,
    tracedAt: new Date().toISOString(),
  }

  TRACES.push(trace)
  logger.info(`Remediation trace started: ${incidentId}`, "remediation-tracing")
  return trace
}

export function addRemediationStep(
  remTraceId: string,
  action: string,
  subsystem: string
): string {
  const trace = TRACES.find((t) => t.remediationTraceId === remTraceId)
  if (!trace) return ""

  const step: RemediationStep = {
    stepId: crypto.randomUUID(),
    action,
    subsystem,
    startedAt: new Date().toISOString(),
    success: false,
  }

  trace.steps.push(step)
  return step.stepId
}

export function completeStep(
  remTraceId: string,
  stepId: string,
  success: boolean,
  note?: string
): void {
  const trace = TRACES.find((t) => t.remediationTraceId === remTraceId)
  if (!trace) return
  const step = trace.steps.find((s) => s.stepId === stepId)
  if (!step) return

  const now = new Date()
  step.completedAt = now.toISOString()
  step.durationMs = now.getTime() - new Date(step.startedAt).getTime()
  step.success = success
  step.note = note
}

export function finalizeTrace(remTraceId: string, rolledBack = false): void {
  const trace = TRACES.find((t) => t.remediationTraceId === remTraceId)
  if (!trace) return

  trace.rolledBack = rolledBack
  trace.successful = trace.steps.every((s) => s.success)
  trace.totalDurationMs = trace.steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0)
  logger.info(
    `Remediation trace finalized: ${trace.incidentId} successful=${trace.successful}`,
    "remediation-tracing"
  )
}

export function getTrace(incidentId: string): RemediationTrace | undefined {
  return TRACES.find((t) => t.incidentId === incidentId)
}

export function getTraceSummary(): {
  total: number
  successful: number
  rolledBack: number
  avgDurationMs: number
} {
  const total = TRACES.length
  const successful = TRACES.filter((t) => t.successful).length
  const rolledBack = TRACES.filter((t) => t.rolledBack).length
  const withDuration = TRACES.filter((t) => t.totalDurationMs !== undefined)
  const avgDurationMs =
    withDuration.length > 0
      ? withDuration.reduce((sum, t) => sum + (t.totalDurationMs ?? 0), 0) / withDuration.length
      : 0
  return { total, successful, rolledBack, avgDurationMs }
}
