import { getAllCircuits } from "@/lib/governance/circuit-breaker"
import { AGENT_REGISTRY } from "@/lib/agents/registry"

export interface DetectedIncident {
  id: string
  incidentType:
    | "circuit_cascade"
    | "queue_overflow"
    | "agent_failure"
    | "latency_spike"
    | "payment_degradation"
    | "tenant_isolation_breach"
  tenantId?: string
  severity: "low" | "medium" | "high" | "critical"
  signals: string[]
  autoRemediable: boolean
  detectedAt: string
  status: "open" | "remediating" | "resolved"
}

const INCIDENTS: DetectedIncident[] = []
const CAP = 200

export function detectIncidents(): DetectedIncident[] {
  const newIncidents: DetectedIncident[] = []
  const circuits = getAllCircuits()
  const openCount = circuits.filter(c => c.state === "open").length

  if (openCount > 3) {
    const incident = recordIncident(
      "circuit_cascade",
      "critical",
      [`${openCount} circuits open`, "cascade risk detected"],
      false
    )
    newIncidents.push(incident)
  }

  const agentKeys = Object.keys(AGENT_REGISTRY)
  const missingAgents = agentKeys.filter(k => !(k in AGENT_REGISTRY))
  if (missingAgents.length > 0) {
    const incident = recordIncident(
      "agent_failure",
      "high",
      [`Missing agents: ${missingAgents.join(", ")}`],
      true
    )
    newIncidents.push(incident)
  }

  if (newIncidents.length === 0) {
    const incident = recordIncident(
      "latency_spike",
      "low",
      ["routine health check — no critical signals"],
      true
    )
    newIncidents.push(incident)
  }

  return newIncidents
}

export function recordIncident(
  incidentType: DetectedIncident["incidentType"],
  severity: DetectedIncident["severity"],
  signals: string[],
  autoRemediable: boolean,
  tenantId?: string
): DetectedIncident {
  const incident: DetectedIncident = {
    id: crypto.randomUUID(),
    incidentType,
    tenantId,
    severity,
    signals,
    autoRemediable,
    detectedAt: new Date().toISOString(),
    status: "open",
  }
  if (INCIDENTS.length >= CAP) INCIDENTS.shift()
  INCIDENTS.push(incident)
  return incident
}

export function updateIncidentStatus(id: string, status: DetectedIncident["status"]): void {
  const incident = INCIDENTS.find(i => i.id === id)
  if (incident) incident.status = status
}

export function getOpenIncidents(): DetectedIncident[] {
  return INCIDENTS.filter(i => i.status === "open")
}

export function getIncidentStats(): {
  total: number
  open: number
  bySeverity: Record<string, number>
  autoRemediableRate: number
} {
  const bySeverity: Record<string, number> = {}
  let autoRemediable = 0
  for (const i of INCIDENTS) {
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1
    if (i.autoRemediable) autoRemediable++
  }
  return {
    total: INCIDENTS.length,
    open: INCIDENTS.filter(i => i.status === "open").length,
    bySeverity,
    autoRemediableRate: INCIDENTS.length > 0 ? autoRemediable / INCIDENTS.length : 0,
  }
}
