export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";
export type IncidentStatus =
  | "open"
  | "investigating"
  | "mitigating"
  | "resolved"
  | "closed";

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  tenantId?: string;
  triggeredBy: string; // eventType or "manual"
  affectedSystems: string[];
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

const INCIDENTS: Map<string, Incident> = new Map();
const INCIDENTS_CAP = 200;

export async function createIncident(
  params: Omit<Incident, "id" | "status" | "createdAt" | "updatedAt">
): Promise<Incident> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (INCIDENTS.size >= INCIDENTS_CAP) {
    const oldest = Array.from(INCIDENTS.keys())[0];
    if (oldest !== undefined) {
      INCIDENTS.delete(oldest);
    }
  }

  const incident: Incident = {
    ...params,
    id,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  INCIDENTS.set(id, incident);

  const { emitEvent } = await import("@/lib/automation/emitEvent");
  await emitEvent("agent_run", {
    agentHint: "GABRIEL",
    reason: "incident_created",
    incidentId: id,
    severity: params.severity,
    tenantId: params.tenantId,
  });

  return incident;
}

export function updateIncident(
  id: string,
  updates: Partial<Pick<Incident, "status" | "assignedTo" | "description">>
): Incident {
  const incident = INCIDENTS.get(id);
  if (!incident) {
    throw new Error(`Incident ${id} not found`);
  }

  const now = new Date().toISOString();
  const updated: Incident = { ...incident, ...updates, updatedAt: now };

  if (updates.status === "resolved" && !updated.resolvedAt) {
    updated.resolvedAt = now;
  }

  INCIDENTS.set(id, updated);
  return updated;
}

export function getIncident(id: string): Incident | undefined {
  return INCIDENTS.get(id);
}

export function getOpenIncidents(tenantId?: string): Incident[] {
  return Array.from(INCIDENTS.values()).filter(
    (inc) =>
      inc.status !== "resolved" &&
      inc.status !== "closed" &&
      (tenantId === undefined || inc.tenantId === tenantId)
  );
}

export function getIncidentsBySeverity(
  severity: IncidentSeverity
): Incident[] {
  return Array.from(INCIDENTS.values()).filter(
    (inc) => inc.severity === severity
  );
}
