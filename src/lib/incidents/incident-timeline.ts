import type { Incident } from "./incident-manager";

export interface TimelineEntry {
  id: string;
  incidentId: string;
  timestamp: string;
  actor: string;
  action: string;
  detail?: string;
}

const TIMELINES: Map<string, TimelineEntry[]> = new Map();

export function addTimelineEntry(
  incidentId: string,
  actor: string,
  action: string,
  detail?: string
): TimelineEntry {
  const entry: TimelineEntry = {
    id: crypto.randomUUID(),
    incidentId,
    timestamp: new Date().toISOString(),
    actor,
    action,
    detail,
  };

  const existing = TIMELINES.get(incidentId);
  if (existing !== undefined) {
    existing.push(entry);
  } else {
    TIMELINES.set(incidentId, [entry]);
  }

  return entry;
}

export function getTimeline(incidentId: string): TimelineEntry[] {
  return TIMELINES.get(incidentId) ?? [];
}

export function getRecentActivity(limit = 20): TimelineEntry[] {
  const all: TimelineEntry[] = [];
  for (const entries of Array.from(TIMELINES.values())) {
    for (const entry of entries) {
      all.push(entry);
    }
  }
  all.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return all.slice(0, limit);
}

export async function exportIncidentSummary(incidentId: string): Promise<{
  incident: Incident | undefined;
  timeline: TimelineEntry[];
  duration?: string;
}> {
  const { getIncident } = await import("./incident-manager");
  const incident = getIncident(incidentId);
  const timeline = getTimeline(incidentId);

  let duration: string | undefined;
  if (incident !== undefined) {
    if (incident.resolvedAt !== undefined) {
      const ms =
        new Date(incident.resolvedAt).getTime() -
        new Date(incident.createdAt).getTime();
      duration = `${ms}ms`;
    } else {
      duration = "ongoing";
    }
  }

  return { incident, timeline, duration };
}
