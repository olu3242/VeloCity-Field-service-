import { logger } from "@/runtime-core/observability"

export type AlertSeverity = "info" | "warning" | "critical" | "emergency"

export interface TelemetryAlert {
  alertId: string
  subsystem: string
  tenantId?: string
  alertType:
    | "cognition_degradation"
    | "orchestration_instability"
    | "drift_detected"
    | "throughput_drop"
    | "latency_spike"
    | "error_surge"
  severity: AlertSeverity
  message: string
  threshold: number
  observedValue: number
  acknowledged: boolean
  resolvedAt?: string
  triggeredAt: string
}

const ALERTS: TelemetryAlert[] = []
const MAX_ALERTS = 1000

function pruneAlerts(): void {
  while (ALERTS.length >= MAX_ALERTS) {
    ALERTS.shift()
  }
}

export function triggerAlert(
  subsystem: string,
  type: TelemetryAlert["alertType"],
  severity: AlertSeverity,
  message: string,
  threshold: number,
  observedValue: number,
  tenantId?: string
): TelemetryAlert {
  pruneAlerts()

  const alert: TelemetryAlert = {
    alertId: crypto.randomUUID(),
    subsystem,
    tenantId,
    alertType: type,
    severity,
    message,
    threshold,
    observedValue,
    acknowledged: false,
    triggeredAt: new Date().toISOString(),
  }

  ALERTS.push(alert)
  logger.warn("Alert triggered", { subsystem, type, severity })
  return alert
}

export function acknowledgeAlert(alertId: string): void {
  const alert = ALERTS.find((a) => a.alertId === alertId)
  if (!alert) return
  alert.acknowledged = true
}

export function resolveAlert(alertId: string): void {
  const alert = ALERTS.find((a) => a.alertId === alertId)
  if (!alert) return
  alert.resolvedAt = new Date().toISOString()
}

export function getActiveAlerts(tenantId?: string): TelemetryAlert[] {
  return ALERTS.filter(
    (a) =>
      !a.acknowledged &&
      !a.resolvedAt &&
      (tenantId === undefined || a.tenantId === tenantId)
  )
}

export function getAlertSummary(): {
  total: number
  active: number
  acknowledged: number
  resolved: number
  bySeverity: Record<string, number>
  byType: Record<string, number>
} {
  const bySeverity: Record<string, number> = {}
  const byType: Record<string, number> = {}
  for (const a of ALERTS) {
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1
    byType[a.alertType] = (byType[a.alertType] ?? 0) + 1
  }
  return {
    total: ALERTS.length,
    active: ALERTS.filter((a) => !a.acknowledged && !a.resolvedAt).length,
    acknowledged: ALERTS.filter((a) => a.acknowledged).length,
    resolved: ALERTS.filter((a) => !!a.resolvedAt).length,
    bySeverity,
    byType,
  }
}
