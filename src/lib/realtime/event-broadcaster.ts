export type RuntimeEventCategory =
  | "queue"
  | "ai_call"
  | "worker"
  | "governance"
  | "anomaly"
  | "escalation";

export interface RuntimeBroadcastEvent {
  id: string;
  category: RuntimeEventCategory;
  eventType: string;
  tenantId?: string;
  payload: Record<string, unknown>;
  severity: "info" | "warning" | "critical";
  timestamp: string;
}

const EVENT_LOG_CAP = 500;

const EVENT_LOG: RuntimeBroadcastEvent[] = [];
const ADMIN_SUBSCRIBERS = new Map<
  string,
  (evt: RuntimeBroadcastEvent) => void
>();

export function broadcastEvent(
  category: RuntimeEventCategory,
  eventType: string,
  payload: Record<string, unknown>,
  severity: "info" | "warning" | "critical" = "info",
  tenantId?: string
): RuntimeBroadcastEvent {
  const event: RuntimeBroadcastEvent = {
    id: crypto.randomUUID(),
    category,
    eventType,
    tenantId,
    payload,
    severity,
    timestamp: new Date().toISOString(),
  };

  EVENT_LOG.push(event);
  if (EVENT_LOG.length > EVENT_LOG_CAP) {
    EVENT_LOG.shift();
  }

  for (const cb of Array.from(ADMIN_SUBSCRIBERS.values())) {
    try {
      cb(event);
    } catch {
      // Swallow subscriber errors
    }
  }

  return event;
}

export function subscribeAdmin(
  callback: (evt: RuntimeBroadcastEvent) => void
): string {
  const id = crypto.randomUUID();
  ADMIN_SUBSCRIBERS.set(id, callback);
  return id;
}

export function unsubscribeAdmin(id: string): void {
  ADMIN_SUBSCRIBERS.delete(id);
}

export function getRecentEvents(limit = 50): RuntimeBroadcastEvent[] {
  return EVENT_LOG.slice(-Math.min(limit, EVENT_LOG.length));
}

export function getEventsByCategory(
  category: RuntimeEventCategory,
  limit = 50
): RuntimeBroadcastEvent[] {
  const filtered = EVENT_LOG.filter((e) => e.category === category);
  return filtered.slice(-Math.min(limit, filtered.length));
}
