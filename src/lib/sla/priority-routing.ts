export interface SLAPriorityRoute {
  eventType: string;
  tenantId?: string;
  urgency: "low" | "medium" | "high" | "emergency";
  priorityBoost: number;
  maxQueueWaitMs: number;
  dedicatedWorker: boolean;
}

const PRIORITY_ROUTES: Map<string, SLAPriorityRoute> = new Map();

function routeKey(eventType: string, tenantId?: string): string {
  return `${eventType}:${tenantId ?? "global"}`;
}

// Pre-register defaults
PRIORITY_ROUTES.set(routeKey("sla_breach"), {
  eventType: "sla_breach",
  urgency: "emergency",
  priorityBoost: 30,
  maxQueueWaitMs: 1_000,
  dedicatedWorker: true,
});

PRIORITY_ROUTES.set(routeKey("dispute_opened"), {
  eventType: "dispute_opened",
  urgency: "high",
  priorityBoost: 20,
  maxQueueWaitMs: 5_000,
  dedicatedWorker: false,
});

PRIORITY_ROUTES.set(routeKey("payment_failed"), {
  eventType: "payment_failed",
  urgency: "high",
  priorityBoost: 15,
  maxQueueWaitMs: 10_000,
  dedicatedWorker: false,
});

export function registerPriorityRoute(route: SLAPriorityRoute): void {
  PRIORITY_ROUTES.set(routeKey(route.eventType, route.tenantId), route);
}

export function resolvePriorityRoute(
  eventType: string,
  tenantId?: string
): SLAPriorityRoute {
  if (tenantId !== undefined) {
    const tenantRoute = PRIORITY_ROUTES.get(routeKey(eventType, tenantId));
    if (tenantRoute) return tenantRoute;
  }
  const globalRoute = PRIORITY_ROUTES.get(routeKey(eventType));
  if (globalRoute) return globalRoute;
  return {
    eventType,
    urgency: "low",
    priorityBoost: 0,
    maxQueueWaitMs: 30_000,
    dedicatedWorker: false,
  };
}

export function computeEffectivePriority(
  basePriority: number,
  eventType: string,
  tenantId?: string
): number {
  const route = resolvePriorityRoute(eventType, tenantId);
  return Math.min(100, basePriority + route.priorityBoost);
}

export function getAllRoutes(): SLAPriorityRoute[] {
  return Array.from(PRIORITY_ROUTES.values());
}
