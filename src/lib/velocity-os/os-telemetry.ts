export interface OSTelemetryRecord {
  id: string
  subsystem: string
  eventType: "startup" | "shutdown" | "error" | "warning" | "metric" | "audit"
  message: string
  payload: Record<string, unknown>
  timestamp: string
}

const TELEMETRY: OSTelemetryRecord[] = []
const MAX_TELEMETRY = 2000

export function emitOSTelemetry(
  subsystem: string,
  eventType: OSTelemetryRecord["eventType"],
  message: string,
  payload: Record<string, unknown> = {}
): OSTelemetryRecord {
  if (TELEMETRY.length >= MAX_TELEMETRY) TELEMETRY.shift()
  const record: OSTelemetryRecord = {
    id: crypto.randomUUID(),
    subsystem,
    eventType,
    message,
    payload,
    timestamp: new Date().toISOString(),
  }
  TELEMETRY.push(record)
  return record
}

export function getSubsystemTelemetry(subsystem: string, limit = 50): OSTelemetryRecord[] {
  return TELEMETRY.filter((r) => r.subsystem === subsystem).slice(-limit)
}

export function getRecentTelemetry(limit = 50): OSTelemetryRecord[] {
  return TELEMETRY.slice(-limit)
}

export function getTelemetrySummary(): {
  total: number
  bySubsystem: Record<string, number>
  byEventType: Record<string, number>
} {
  const bySubsystem: Record<string, number> = {}
  const byEventType: Record<string, number> = {}
  for (const r of TELEMETRY) {
    bySubsystem[r.subsystem] = (bySubsystem[r.subsystem] ?? 0) + 1
    byEventType[r.eventType] = (byEventType[r.eventType] ?? 0) + 1
  }
  return { total: TELEMETRY.length, bySubsystem, byEventType }
}
