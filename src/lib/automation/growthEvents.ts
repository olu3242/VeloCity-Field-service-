export const GROWTH_AUTOMATION_EVENTS = [
  "high_demand_area_detected",
  "provider_shortage_detected",
  "surge_pricing_recommended",
  "recurring_service_opportunity_detected",
  "provider_subscription_opportunity_detected",
  "customer_churn_risk_detected",
  "territory_ready_for_expansion",
  "franchise_candidate_area_detected",
] as const;

export type GrowthAutomationEventName = (typeof GROWTH_AUTOMATION_EVENTS)[number];

export interface GrowthAutomationEvent {
  type: GrowthAutomationEventName;
  tenantId: string;
  entityId?: string;
  severity: "low" | "medium" | "high" | "critical";
  payload: Record<string, unknown>;
  recommendations: string[];
}

export function routeGrowthAutomationEvent(event: GrowthAutomationEvent) {
  return {
    ...event,
    routedAt: new Date().toISOString(),
    auditAction: `growth.${event.type}`,
    queue: event.severity === "critical" || event.severity === "high" ? "ops_review" : "growth_insights",
  };
}
