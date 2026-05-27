export interface BackpressureState {
  queueId: string
  pressureLevel: "none" | "low" | "medium" | "high" | "critical"
  shedCount: number
  lastShedAt?: string
  throttleActive: boolean
}

const STATE: Map<string, BackpressureState> = new Map()

function calcLevel(ratio: number): BackpressureState["pressureLevel"] {
  if (ratio < 0.5) return "none"
  if (ratio < 0.7) return "low"
  if (ratio < 0.85) return "medium"
  if (ratio < 0.95) return "high"
  return "critical"
}

export function evaluateBackpressure(
  queueId: string,
  depth: number,
  capacity: number,
): BackpressureState {
  const ratio = capacity > 0 ? depth / capacity : 0
  const pressureLevel = calcLevel(ratio)
  const throttleActive = pressureLevel === "high" || pressureLevel === "critical"
  const existing = STATE.get(queueId)
  const updated: BackpressureState = {
    queueId,
    pressureLevel,
    shedCount: existing?.shedCount ?? 0,
    lastShedAt: existing?.lastShedAt,
    throttleActive,
  }
  STATE.set(queueId, updated)
  return updated
}

export function recordShed(queueId: string): void {
  const existing = STATE.get(queueId)
  const shedCount = (existing?.shedCount ?? 0) + 1
  STATE.set(queueId, {
    queueId,
    pressureLevel: existing?.pressureLevel ?? "none",
    shedCount,
    lastShedAt: new Date().toISOString(),
    throttleActive: existing?.throttleActive ?? false,
  })
}

export function getBackpressureStatus(): BackpressureState[] {
  return Array.from(STATE.values())
}

export function getCriticalQueues(): BackpressureState[] {
  return Array.from(STATE.values()).filter((s) => s.pressureLevel === "critical")
}
