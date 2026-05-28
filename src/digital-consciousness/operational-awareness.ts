import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type AwarenessLevel = "unaware" | "monitoring" | "alert" | "focused" | "crisis"

export interface OperationalAwarenessState {
  awarenessId: string
  level: AwarenessLevel
  activeIncidents: number
  monitoredSubsystems: string[]
  attentionFocus?: string
  alertSignals: string[]
  overallHealthEstimate: number
  lastAssessedAt: string
  startedAt: string
}

const AWARENESS_STATE: OperationalAwarenessState = {
  awarenessId: crypto.randomUUID(),
  level: "monitoring",
  activeIncidents: 0,
  monitoredSubsystems: [],
  alertSignals: [],
  overallHealthEstimate: 100,
  lastAssessedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
}

export function getAwarenessState(): OperationalAwarenessState {
  return {
    ...AWARENESS_STATE,
    monitoredSubsystems: [...AWARENESS_STATE.monitoredSubsystems],
    alertSignals: [...AWARENESS_STATE.alertSignals],
  }
}

export function setAwarenessLevel(level: AwarenessLevel): void {
  if (isRuntimePaused()) {
    logger.warn("setAwarenessLevel blocked: runtime paused", "operational-awareness")
    return
  }
  AWARENESS_STATE.level = level
}

export function addAlert(signal: string): void {
  if (!AWARENESS_STATE.alertSignals.includes(signal)) {
    AWARENESS_STATE.alertSignals.push(signal)
  }
}

export function clearAlert(signal: string): void {
  const idx = AWARENESS_STATE.alertSignals.indexOf(signal)
  if (idx !== -1) AWARENESS_STATE.alertSignals.splice(idx, 1)
}

export function focusOn(subsystem: string): void {
  AWARENESS_STATE.attentionFocus = subsystem
}

export function assessHealth(healthScore: number): void {
  AWARENESS_STATE.overallHealthEstimate = healthScore
  AWARENESS_STATE.lastAssessedAt = new Date().toISOString()
  if (healthScore >= 80) {
    AWARENESS_STATE.level = "monitoring"
  } else if (healthScore >= 60) {
    AWARENESS_STATE.level = "alert"
  } else if (healthScore >= 40) {
    AWARENESS_STATE.level = "focused"
  } else {
    AWARENESS_STATE.level = "crisis"
  }
}

export function incrementIncidents(): void {
  AWARENESS_STATE.activeIncidents += 1
}

export function decrementIncidents(): void {
  if (AWARENESS_STATE.activeIncidents > 0) AWARENESS_STATE.activeIncidents -= 1
}
