import { logger } from "@/runtime-core/observability"

export interface NeuralOrchestrationSignal {
  signalId: string
  signalType:
    | "routing_hint"
    | "load_prediction"
    | "failure_warning"
    | "optimization_opportunity"
    | "federation_sync"
  sourceNodeId: string
  targetWorkflowType?: string
  tenantId?: string
  strength: number
  payload: Record<string, unknown>
  propagationDepth: number
  emittedAt: string
  expiresAt: string
}

const SIGNALS: NeuralOrchestrationSignal[] = []
const MAX_SIGNALS = 2000

function cap(): void {
  while (SIGNALS.length > MAX_SIGNALS) SIGNALS.shift()
}

export function emitSignal(
  type: NeuralOrchestrationSignal["signalType"],
  sourceNodeId: string,
  strength: number,
  payload: Record<string, unknown>,
  workflowType?: string,
  tenantId?: string,
): NeuralOrchestrationSignal {
  const clampedStrength = Math.max(0, Math.min(1, strength))
  const now = Date.now()
  const signal: NeuralOrchestrationSignal = {
    signalId: crypto.randomUUID(),
    signalType: type,
    sourceNodeId,
    targetWorkflowType: workflowType,
    tenantId,
    strength: clampedStrength,
    payload,
    propagationDepth: 0,
    emittedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * clampedStrength * 60 * 1000).toISOString(),
  }
  SIGNALS.push(signal)
  cap()
  logger.info(`Neural signal emitted: ${type}`, "orchestration-neural-network", {
    metadata: { signalId: signal.signalId, strength: clampedStrength },
  })
  return signal
}

export function propagateSignal(signalId: string): void {
  const s = SIGNALS.find((x) => x.signalId === signalId)
  if (!s) return
  s.propagationDepth++
}

export function getActiveSignals(
  workflowType?: string,
): NeuralOrchestrationSignal[] {
  const now = new Date().toISOString()
  return SIGNALS.filter(
    (s) =>
      s.expiresAt > now &&
      (workflowType === undefined || s.targetWorkflowType === workflowType),
  )
}

export function getSignalStats(): {
  total: number
  active: number
  byType: Record<string, number>
  avgStrength: number
} {
  const active = getActiveSignals().length
  const byType: Record<string, number> = {}
  let totalStrength = 0
  for (const s of SIGNALS) {
    byType[s.signalType] = (byType[s.signalType] ?? 0) + 1
    totalStrength += s.strength
  }
  const avgStrength = SIGNALS.length > 0 ? totalStrength / SIGNALS.length : 0
  return { total: SIGNALS.length, active, byType, avgStrength }
}
