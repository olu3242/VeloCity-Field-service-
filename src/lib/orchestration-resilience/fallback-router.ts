/**
 * Runtime fallback routing — maps failure triggers to handler queues.
 */

export interface FallbackRoute {
  trigger: string;
  targetHandler: string;
  priority: number;
  active: boolean;
}

const FALLBACK_ROUTES: FallbackRoute[] = [
  { trigger: "circuit_open", targetHandler: "dead_letter_queue", priority: 10, active: true },
  { trigger: "timeout", targetHandler: "retry_queue", priority: 20, active: true },
  { trigger: "rate_limit", targetHandler: "throttle_queue", priority: 15, active: true },
];

export function registerFallbackRoute(route: FallbackRoute): void {
  FALLBACK_ROUTES.push(route);
}

export function resolveFallback(trigger: string): FallbackRoute | undefined {
  const candidates = FALLBACK_ROUTES.filter(
    (r) => r.active && r.trigger === trigger,
  );
  if (candidates.length === 0) return undefined;
  // Highest priority value wins
  return candidates.reduce((best, r) => (r.priority > best.priority ? r : best));
}

export function activateRoute(trigger: string): void {
  for (const route of FALLBACK_ROUTES) {
    if (route.trigger === trigger) {
      route.active = true;
    }
  }
}

export function deactivateRoute(trigger: string): void {
  for (const route of FALLBACK_ROUTES) {
    if (route.trigger === trigger) {
      route.active = false;
    }
  }
}

export function getAllRoutes(): FallbackRoute[] {
  return [...FALLBACK_ROUTES];
}
