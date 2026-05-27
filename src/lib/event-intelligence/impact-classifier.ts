/**
 * Impact Classifier — maps event types to known operational impact levels.
 */

export interface EventImpact {
  eventType: string;
  impactLevel: "low" | "medium" | "high" | "critical";
  affectedSystems: string[];
  estimatedUsersAffected: number;
  requiresImmedateAction: boolean;
}

const IMPACT_REGISTRY: Map<string, EventImpact> = new Map([
  [
    "payment_failed",
    {
      eventType: "payment_failed",
      impactLevel: "critical",
      affectedSystems: ["payment-processor", "automation-queue"],
      estimatedUsersAffected: 50,
      requiresImmedateAction: true,
    },
  ],
  [
    "dispute_opened",
    {
      eventType: "dispute_opened",
      impactLevel: "high",
      affectedSystems: ["dispute-engine", "provider-portal"],
      estimatedUsersAffected: 2,
      requiresImmedateAction: false,
    },
  ],
  [
    "sla_breach",
    {
      eventType: "sla_breach",
      impactLevel: "high",
      affectedSystems: ["sla-monitor", "escalation-chain"],
      estimatedUsersAffected: 10,
      requiresImmedateAction: true,
    },
  ],
  [
    "job_assigned",
    {
      eventType: "job_assigned",
      impactLevel: "low",
      affectedSystems: ["dispatch-engine"],
      estimatedUsersAffected: 1,
      requiresImmedateAction: false,
    },
  ],
]);

const DEFAULT_IMPACT: Omit<EventImpact, "eventType"> = {
  impactLevel: "low",
  affectedSystems: [],
  estimatedUsersAffected: 0,
  requiresImmedateAction: false,
};

export function classifyImpact(eventType: string): EventImpact {
  return (
    IMPACT_REGISTRY.get(eventType) ?? { ...DEFAULT_IMPACT, eventType }
  );
}

export function getHighImpactEvents(): EventImpact[] {
  return Array.from(IMPACT_REGISTRY.values()).filter(
    (e) => e.impactLevel === "high" || e.impactLevel === "critical"
  );
}

export function registerImpact(impact: EventImpact): void {
  IMPACT_REGISTRY.set(impact.eventType, impact);
}
