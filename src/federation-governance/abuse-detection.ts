import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type AbusePattern =
  | "rate_limit_exceeded"
  | "payload_tampering"
  | "unauthorized_operation"
  | "replay_attack"
  | "data_exfiltration"

export interface AbuseIncident {
  incidentId: string
  participantId: string
  tenantId?: string
  pattern: AbusePattern
  confidence: number
  evidence: string[]
  severity: "low" | "medium" | "high" | "critical"
  actionTaken: "logged" | "throttled" | "blocked" | "escalated"
  detectedAt: string
}

const INCIDENTS: AbuseIncident[] = []
const MAX_INCIDENTS = 500

function pruneIncidents(): void {
  while (INCIDENTS.length >= MAX_INCIDENTS) {
    INCIDENTS.shift()
  }
}

export function detectAbuse(
  participantId: string,
  pattern: AbusePattern,
  evidence: string[],
  tenantId?: string
): AbuseIncident {
  if (isRuntimePaused()) {
    logger.warn("detectAbuse blocked: runtime paused", { participantId })
    throw new Error("Runtime is paused")
  }

  pruneIncidents()

  const confidence = Math.min(evidence.length * 0.2, 0.95)

  const severity: AbuseIncident["severity"] =
    confidence >= 0.8 ? "critical" : confidence >= 0.6 ? "high" : confidence >= 0.4 ? "medium" : "low"

  const actionTaken: AbuseIncident["actionTaken"] =
    severity === "critical"
      ? "blocked"
      : severity === "high"
      ? "escalated"
      : severity === "medium"
      ? "throttled"
      : "logged"

  const incident: AbuseIncident = {
    incidentId: crypto.randomUUID(),
    participantId,
    tenantId,
    pattern,
    confidence,
    evidence,
    severity,
    actionTaken,
    detectedAt: new Date().toISOString(),
  }

  INCIDENTS.push(incident)
  logger.warn("Abuse detected", { participantId, pattern, severity, actionTaken })
  return incident
}

export function getIncidentsForParticipant(participantId: string): AbuseIncident[] {
  return INCIDENTS.filter((i) => i.participantId === participantId)
}

export function getCriticalIncidents(): AbuseIncident[] {
  return INCIDENTS.filter((i) => i.severity === "critical")
}

export function getAbuseDetectionSummary(): {
  total: number
  byPattern: Record<string, number>
  bySeverity: Record<string, number>
  blockedCount: number
} {
  const byPattern: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  for (const i of INCIDENTS) {
    byPattern[i.pattern] = (byPattern[i.pattern] ?? 0) + 1
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1
  }
  return {
    total: INCIDENTS.length,
    byPattern,
    bySeverity,
    blockedCount: INCIDENTS.filter((i) => i.actionTaken === "blocked").length,
  }
}
