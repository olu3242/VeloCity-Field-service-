/**
 * Workflow Tracer — traces live workflow execution with step-level visibility.
 * In-memory singleton with rolling cap of 500 traces.
 */

const TRACES_CAP = 500

export interface WorkflowTrace {
  id: string
  workflowType: string
  tenantId: string
  rootEventType: string
  steps: {
    name: string
    agentName?: string
    startedAt: string
    completedAt?: string
    status: "pending" | "running" | "done" | "failed"
  }[]
  status: "active" | "completed" | "failed" | "stalled"
  startedAt: string
  completedAt?: string
  totalDurationMs?: number
}

const TRACES: Map<string, WorkflowTrace> = new Map()

function enforceCap(): void {
  if (TRACES.size >= TRACES_CAP) {
    const firstKey = Array.from(TRACES.keys())[0]
    if (firstKey !== undefined) TRACES.delete(firstKey)
  }
}

export function startTrace(
  workflowType: string,
  tenantId: string,
  rootEventType: string
): WorkflowTrace {
  enforceCap()
  const trace: WorkflowTrace = {
    id: crypto.randomUUID(),
    workflowType,
    tenantId,
    rootEventType,
    steps: [],
    status: "active",
    startedAt: new Date().toISOString(),
  }
  TRACES.set(trace.id, trace)
  return trace
}

export function addStep(traceId: string, stepName: string, agentName?: string): void {
  const trace = TRACES.get(traceId)
  if (!trace) return
  trace.steps.push({
    name: stepName,
    agentName,
    startedAt: new Date().toISOString(),
    status: "running",
  })
}

export function completeStep(
  traceId: string,
  stepName: string,
  status: "done" | "failed"
): void {
  const trace = TRACES.get(traceId)
  if (!trace) return
  const step = trace.steps.find((s) => s.name === stepName && s.status === "running")
  if (!step) return
  step.status = status
  step.completedAt = new Date().toISOString()
}

export function finalizeTrace(
  traceId: string,
  status: "completed" | "failed" | "stalled"
): void {
  const trace = TRACES.get(traceId)
  if (!trace) return
  trace.status = status
  trace.completedAt = new Date().toISOString()
  trace.totalDurationMs =
    new Date(trace.completedAt).getTime() - new Date(trace.startedAt).getTime()
}

export function getActiveTraces(tenantId?: string): WorkflowTrace[] {
  const active = Array.from(TRACES.values()).filter((t) => t.status === "active")
  if (tenantId) return active.filter((t) => t.tenantId === tenantId)
  return active
}

export function getTraceStats(): {
  active: number
  completed: number
  failed: number
  stalled: number
  avgDurationMs: number
} {
  const all = Array.from(TRACES.values())
  const completed = all.filter((t) => t.status === "completed")
  const withDuration = completed.filter((t) => t.totalDurationMs !== undefined)
  const avgDurationMs =
    withDuration.length > 0
      ? withDuration.reduce((s, t) => s + (t.totalDurationMs ?? 0), 0) / withDuration.length
      : 0
  return {
    active: all.filter((t) => t.status === "active").length,
    completed: completed.length,
    failed: all.filter((t) => t.status === "failed").length,
    stalled: all.filter((t) => t.status === "stalled").length,
    avgDurationMs,
  }
}
