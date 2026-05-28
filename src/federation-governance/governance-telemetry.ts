import { logger } from "@/runtime-core/observability"

export interface FederationGovernanceEvent {
  eventId: string
  participantId?: string
  tenantId?: string
  eventType:
    | "trust_scored"
    | "participant_verified"
    | "permission_granted"
    | "permission_denied"
    | "abuse_detected"
    | "rollback_issued"
    | "isolation_enforced"
  severity: "info" | "warn" | "error" | "critical"
  metadata: Record<string, unknown>
  occurredAt: string
}

const EVENTS: FederationGovernanceEvent[] = []
const MAX_EVENTS = 2000

function pruneEvents(): void {
  while (EVENTS.length >= MAX_EVENTS) {
    EVENTS.shift()
  }
}

export function recordGovernanceEvent(
  type: FederationGovernanceEvent["eventType"],
  severity: FederationGovernanceEvent["severity"],
  metadata: Record<string, unknown>,
  participantId?: string,
  tenantId?: string
): FederationGovernanceEvent {
  pruneEvents()

  const event: FederationGovernanceEvent = {
    eventId: crypto.randomUUID(),
    participantId,
    tenantId,
    eventType: type,
    severity,
    metadata,
    occurredAt: new Date().toISOString(),
  }

  EVENTS.push(event)
  logger.info("Governance event recorded", { type, severity, participantId })
  return event
}

export function getEventsByType(type: FederationGovernanceEvent["eventType"]): FederationGovernanceEvent[] {
  return EVENTS.filter((e) => e.eventType === type)
}

export function getCriticalEvents(tenantId?: string): FederationGovernanceEvent[] {
  return EVENTS.filter(
    (e) => e.severity === "critical" && (tenantId === undefined || e.tenantId === tenantId)
  )
}

export function getGovernanceTelemetrySummary(): {
  total: number
  byType: Record<string, number>
  bySeverity: Record<string, number>
  criticalCount: number
} {
  const byType: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  for (const e of EVENTS) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1
  }
  return {
    total: EVENTS.length,
    byType,
    bySeverity,
    criticalCount: EVENTS.filter((e) => e.severity === "critical").length,
  }
}
