import { IncidentRecord } from "./operations-types";

export function shouldEscalate(incident: IncidentRecord): boolean {
  if (incident.status === "resolved") return false;
  if (incident.severity === "critical" || incident.severity === "high") return true;
  if (incident.status === "open") {
    const ageMinutes = (Date.now() - new Date(incident.createdAt).getTime()) / (1000 * 60);
    return ageMinutes > 60;
  }
  return false;
}

export function getEscalationLevel(incident: IncidentRecord): "ops" | "manager" | "exec" {
  if (incident.severity === "critical") return "exec";
  if (incident.severity === "high") return "manager";
  return "ops";
}

export function buildEscalationPayload(incident: IncidentRecord): Record<string, unknown> {
  return {
    incidentId: incident.id,
    jobId: incident.jobId,
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    createdAt: incident.createdAt,
    escalationLevel: getEscalationLevel(incident),
    escalatedAt: new Date().toISOString(),
  };
}
