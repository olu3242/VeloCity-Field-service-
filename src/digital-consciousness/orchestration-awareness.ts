export interface OrchestrationAwarenessSignal {
  signalId: string
  workflowType: string
  tenantId?: string
  signalType: "healthy" | "slow" | "failing" | "anomalous" | "recovered"
  detectedAt: string
  details: string
  frequency: number
}

const SIGNALS: Map<string, OrchestrationAwarenessSignal[]> = new Map()
const PER_TYPE_CAP = 20

export function emitSignal(
  workflowType: string,
  signalType: OrchestrationAwarenessSignal["signalType"],
  details: string,
  tenantId?: string
): OrchestrationAwarenessSignal {
  const existing = SIGNALS.get(workflowType) ?? []
  const duplicate = existing.find(
    s => s.signalType === signalType && s.tenantId === tenantId
  )
  if (duplicate) {
    duplicate.frequency += 1
    duplicate.detectedAt = new Date().toISOString()
    return duplicate
  }
  if (existing.length >= PER_TYPE_CAP) existing.shift()
  const signal: OrchestrationAwarenessSignal = {
    signalId: crypto.randomUUID(),
    workflowType,
    tenantId,
    signalType,
    detectedAt: new Date().toISOString(),
    details,
    frequency: 1,
  }
  existing.push(signal)
  SIGNALS.set(workflowType, existing)
  return signal
}

export function getSignals(
  workflowType: string,
  signalType?: OrchestrationAwarenessSignal["signalType"]
): OrchestrationAwarenessSignal[] {
  const signals = SIGNALS.get(workflowType) ?? []
  return signalType ? signals.filter(s => s.signalType === signalType) : [...signals]
}

export function getAnomalousWorkflows(): string[] {
  return Array.from(SIGNALS.entries())
    .filter(([, sigs]) =>
      sigs.some(s => s.signalType === "anomalous" || s.signalType === "failing")
    )
    .map(([wfType]) => wfType)
}

export function getAwarenessSummary(): {
  totalSignals: number
  anomalousCount: number
  byType: Record<string, number>
} {
  const byType: Record<string, number> = {}
  let totalSignals = 0
  for (const signals of Array.from(SIGNALS.values())) {
    for (const s of signals) {
      totalSignals += 1
      byType[s.signalType] = (byType[s.signalType] ?? 0) + 1
    }
  }
  const anomalousCount = getAnomalousWorkflows().length
  return { totalSignals, anomalousCount, byType }
}
