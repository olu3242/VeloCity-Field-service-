export interface ExecutionAwarenessRecord {
  executionId: string
  workflowType: string
  tenantId?: string
  region?: string
  awarenessStatus: "tracked" | "at_risk" | "stalled" | "lost"
  lastSignalAt: string
  signalCount: number
  riskScore: number
  watchdogActive: boolean
  registeredAt: string
}

const AWARENESS: Map<string, ExecutionAwarenessRecord> = new Map()
const CAP = 3000

function pruneIfNeeded(): void {
  if (AWARENESS.size >= CAP) {
    const firstKey = Array.from(AWARENESS.keys())[0]
    if (firstKey !== undefined) AWARENESS.delete(firstKey)
  }
}

export function trackExecution(
  executionId: string,
  workflowType: string,
  tenantId?: string,
  region?: string
): ExecutionAwarenessRecord {
  pruneIfNeeded()
  const record: ExecutionAwarenessRecord = {
    executionId,
    workflowType,
    tenantId,
    region,
    awarenessStatus: "tracked",
    lastSignalAt: new Date().toISOString(),
    signalCount: 0,
    riskScore: 0,
    watchdogActive: true,
    registeredAt: new Date().toISOString(),
  }
  AWARENESS.set(executionId, record)
  return record
}

export function receiveSignal(executionId: string): void {
  const r = AWARENESS.get(executionId)
  if (!r) return
  r.lastSignalAt = new Date().toISOString()
  r.signalCount += 1
  const ageMs = Date.now() - new Date(r.registeredAt).getTime()
  r.riskScore = Math.max(0, Math.min(100, ageMs / 60000))
}

export function markAtRisk(executionId: string): void {
  const r = AWARENESS.get(executionId)
  if (r) r.awarenessStatus = "at_risk"
}

export function markStalled(executionId: string): void {
  const r = AWARENESS.get(executionId)
  if (r) { r.awarenessStatus = "stalled"; r.riskScore = Math.min(100, r.riskScore + 30) }
}

export function markLost(executionId: string): void {
  const r = AWARENESS.get(executionId)
  if (r) { r.awarenessStatus = "lost"; r.riskScore = 100 }
}

export function untrackExecution(executionId: string): void {
  AWARENESS.delete(executionId)
}

export function getAtRiskExecutions(tenantId?: string): ExecutionAwarenessRecord[] {
  const results = Array.from(AWARENESS.values()).filter(
    r => r.awarenessStatus === "at_risk" || r.awarenessStatus === "stalled"
  )
  return tenantId ? results.filter(r => r.tenantId === tenantId) : results
}

export function getAwarenessSummary(): {
  total: number
  tracked: number
  atRisk: number
  stalled: number
  lost: number
} {
  const values = Array.from(AWARENESS.values())
  return {
    total: values.length,
    tracked: values.filter(r => r.awarenessStatus === "tracked").length,
    atRisk: values.filter(r => r.awarenessStatus === "at_risk").length,
    stalled: values.filter(r => r.awarenessStatus === "stalled").length,
    lost: values.filter(r => r.awarenessStatus === "lost").length,
  }
}
