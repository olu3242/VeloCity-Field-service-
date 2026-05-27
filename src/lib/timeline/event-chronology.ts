import { randomUUID } from "crypto";
import { assertTenantIsolation } from "@/lib/governance/tenant";

export type TimelineEntityType =
  | "dispute"
  | "job"
  | "payout"
  | "provider"
  | "customer"
  | "workflow";

export interface TimelineEvent {
  id: string;
  entityType: TimelineEntityType;
  entityId: string;
  tenantId: string;
  eventType: string;
  description: string;
  actor?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

const TIMELINE_STORE: Map<string, TimelineEvent[]> = new Map<
  string,
  TimelineEvent[]
>();

const MAX_EVENTS_PER_ENTITY = 100;

export function recordEvent(
  event: Omit<TimelineEvent, "id">
): TimelineEvent {
  const id = randomUUID();
  const full: TimelineEvent = { id, ...event };
  const key = `${event.entityType}:${event.entityId}`;
  const existing = TIMELINE_STORE.get(key) ?? [];
  existing.push(full);
  if (existing.length > MAX_EVENTS_PER_ENTITY) {
    existing.splice(0, existing.length - MAX_EVENTS_PER_ENTITY);
  }
  TIMELINE_STORE.set(key, existing);
  return full;
}

export function getTimeline(
  entityType: TimelineEntityType,
  entityId: string,
  tenantId: string
): TimelineEvent[] {
  const key = `${entityType}:${entityId}`;
  const events = TIMELINE_STORE.get(key) ?? [];
  return events
    .filter((e) => {
      const result = assertTenantIsolation(e.tenantId, tenantId);
      return result.allowed;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function getRecentEvents(
  tenantId: string,
  limit = 20
): TimelineEvent[] {
  const all: TimelineEvent[] = [];
  for (const events of Array.from(TIMELINE_STORE.values())) {
    for (const e of events) {
      if (e.tenantId === tenantId) {
        all.push(e);
      }
    }
  }
  return all
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export function getTimelineStats(): {
  totalEntities: number;
  totalEvents: number;
  byEntityType: Record<string, number>;
} {
  let totalEvents = 0;
  const byEntityType: Record<string, number> = {};

  for (const [key, events] of Array.from(TIMELINE_STORE.entries())) {
    totalEvents += events.length;
    const entityType = key.split(":")[0] ?? "unknown";
    byEntityType[entityType] = (byEntityType[entityType] ?? 0) + events.length;
  }

  return {
    totalEntities: TIMELINE_STORE.size,
    totalEvents,
    byEntityType,
  };
}
