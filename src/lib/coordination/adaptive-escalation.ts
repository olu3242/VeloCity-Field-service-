/**
 * VeloCity Adaptive Escalation
 *
 * Maintains a registry of escalation routes keyed by
 * `${eventType}:${urgency}`. Provides resolution with sensible defaults.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export type EscalationTarget =
  | "ai_agent"
  | "human_review"
  | "automated_resolution"
  | "emergency_escalation";

export interface EscalationRoute {
  eventType: string;
  urgency: "low" | "medium" | "high" | "critical";
  target: EscalationTarget;
  agentHint?: string;
  maxWaitMs: number;
  reason: string;
}

// ── Module state ──────────────────────────────────────────────────────────

export const ESCALATION_ROUTES: Map<string, EscalationRoute> = new Map();

// ── Default routes ────────────────────────────────────────────────────────

function register(route: EscalationRoute): void {
  ESCALATION_ROUTES.set(`${route.eventType}:${route.urgency}`, route);
}

register({
  eventType: "dispute_opened",
  urgency: "critical",
  target: "emergency_escalation",
  maxWaitMs: 10_000,
  reason: "Critical dispute requires immediate escalation",
});

register({
  eventType: "dispute_opened",
  urgency: "high",
  target: "ai_agent",
  agentHint: "IVY",
  maxWaitMs: 60_000,
  reason: "Dispute assigned to IVY for resolution",
});

register({
  eventType: "sla_breach",
  urgency: "critical",
  target: "human_review",
  maxWaitMs: 30_000,
  reason: "SLA breach requires human intervention",
});

register({
  eventType: "payment_failed",
  urgency: "high",
  target: "ai_agent",
  agentHint: "FINN",
  maxWaitMs: 120_000,
  reason: "Payment failure assigned to FINN",
});

// ── Public API ────────────────────────────────────────────────────────────

export function registerEscalationRoute(route: EscalationRoute): void {
  ESCALATION_ROUTES.set(`${route.eventType}:${route.urgency}`, route);
}

export function resolveEscalation(
  eventType: string,
  urgency: EscalationRoute["urgency"],
): EscalationRoute {
  const key = `${eventType}:${urgency}`;
  return (
    ESCALATION_ROUTES.get(key) ?? {
      eventType,
      urgency,
      target: "human_review",
      maxWaitMs: 300_000,
      reason: "Default escalation — no specific route registered",
    }
  );
}

export function updateEscalationRoute(
  eventType: string,
  urgency: EscalationRoute["urgency"],
  updates: Partial<EscalationRoute>,
): void {
  const key = `${eventType}:${urgency}`;
  const existing = ESCALATION_ROUTES.get(key);
  if (!existing) return;
  ESCALATION_ROUTES.set(key, { ...existing, ...updates });
}

export function getAllEscalationRoutes(): EscalationRoute[] {
  return Array.from(ESCALATION_ROUTES.values());
}
