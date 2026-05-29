import { IncidentRecord } from "./operations-types";

export function createIncident(
  jobId: string,
  type: IncidentRecord["type"],
  severity: IncidentRecord["severity"]
): IncidentRecord {
  return {
    id: `incident-${jobId}-${Date.now()}`,
    jobId,
    type,
    severity,
    status: "open",
    createdAt: new Date().toISOString(),
  };
}

export function resolveIncident(incident: IncidentRecord, resolvedAt?: string): IncidentRecord {
  return {
    ...incident,
    status: "resolved",
    resolvedAt: resolvedAt ?? new Date().toISOString(),
  };
}

export function getOpenIncidents(incidents: IncidentRecord[]): IncidentRecord[] {
  return incidents.filter((i) => i.status === "open" || i.status === "investigating");
}
