export interface IntelligenceSignal {
  id: string
  signalType: "anomaly" | "trend" | "prediction" | "recommendation" | "alert"
  source: string
  tenantId?: string
  confidence: number
  payload: Record<string, unknown>
  tags: string[]
  broadcasted: boolean
  createdAt: string
}

const SIGNALS: IntelligenceSignal[] = []
const CAP = 1000

export function publishSignal(
  signalType: IntelligenceSignal["signalType"],
  source: string,
  confidence: number,
  payload: Record<string, unknown>,
  tags: string[] = [],
  tenantId?: string
): IntelligenceSignal {
  const signal: IntelligenceSignal = {
    id: crypto.randomUUID(),
    signalType,
    source,
    tenantId,
    confidence: Math.min(1, Math.max(0, confidence)),
    payload,
    tags,
    broadcasted: false,
    createdAt: new Date().toISOString(),
  }
  if (SIGNALS.length >= CAP) SIGNALS.shift()
  SIGNALS.push(signal)
  return signal
}

export function broadcastSignal(id: string): void {
  const signal = SIGNALS.find(s => s.id === id)
  if (signal) signal.broadcasted = true
}

export function getSignalsByType(
  signalType: IntelligenceSignal["signalType"],
  limit = 100
): IntelligenceSignal[] {
  return SIGNALS.filter(s => s.signalType === signalType).slice(-limit)
}

export function getSignalsByTag(tag: string): IntelligenceSignal[] {
  return SIGNALS.filter(s => s.tags.includes(tag))
}

export function getUnbroadcastedSignals(): IntelligenceSignal[] {
  return SIGNALS.filter(s => !s.broadcasted)
}

export function getNetworkSummary(): {
  total: number
  broadcasted: number
  byType: Record<string, number>
  avgConfidence: number
} {
  const byType: Record<string, number> = {}
  let totalConf = 0
  let broadcasted = 0
  for (const s of SIGNALS) {
    byType[s.signalType] = (byType[s.signalType] ?? 0) + 1
    totalConf += s.confidence
    if (s.broadcasted) broadcasted++
  }
  return {
    total: SIGNALS.length,
    broadcasted,
    byType,
    avgConfidence: SIGNALS.length > 0 ? totalConf / SIGNALS.length : 0,
  }
}
