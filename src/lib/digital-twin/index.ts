// Enterprise Digital Twin — fetches live platform state from Supabase
// and feeds it into the existing captureState() simulation engine.
// Provides scenario simulation for business what-if analysis.

import { getAdminClient } from "@/lib/supabase/admin";
import { captureState, getLatestState, getStateHistory, type TwinState } from "@/lib/simulation/digital-twin";

export type { TwinState };

export type ScenarioType =
  | "territory_expansion"
  | "pricing_increase"
  | "provider_surge"
  | "customer_churn"
  | "seasonal_spike"
  | "contract_loss";

export interface ScenarioParams {
  type: ScenarioType;
  magnitude: number; // 0.0–1.0 scale
  description: string;
}

export interface SimulationResult {
  baseline: TwinState;
  projected: TwinState;
  scenario: ScenarioParams;
  impact: {
    queueDepthChange: number;
    slaRiskChange: string;
    revenueImpactCents: number;
    confidence: number;
  };
  recommendation: string;
}

export async function syncDigitalTwin(tenantId: string): Promise<TwinState> {
  const db = getAdminClient();

  const [queueResult, workersResult, activeProvidersResult, disputesResult, payoutsResult] = await Promise.all([
    db.from("automation_queue").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "pending"),
    db.from("automation_queue").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "processing"),
    db.from("providers").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "approved"),
    db.from("disputes").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "open"),
    db.from("payouts").select("amount_cents").eq("tenant_id", tenantId).eq("status", "pending").limit(200),
  ]);

  const payoutPendingCents = (payoutsResult.data ?? []).reduce(
    (s, p) => s + ((p.amount_cents as number) ?? 0), 0
  );

  return captureState({
    queueDepth: queueResult.count ?? 0,
    processingWorkers: workersResult.count ?? 1,
    aiCallsPerMinute: 0, // estimated from automation_runs if available
    disputeOpenCount: disputesResult.count ?? 0,
    payoutPendingCents,
    activeProviders: activeProvidersResult.count ?? 0,
  });
}

export async function getLatestTwinState(): Promise<TwinState | null> {
  return getLatestState();
}

export async function getTwinHistory(limit = 24): Promise<TwinState[]> {
  return getStateHistory(limit);
}

function projectScenario(baseline: TwinState, params: ScenarioParams): TwinState {
  const m = params.magnitude;
  switch (params.type) {
    case "territory_expansion":
      return { ...baseline, queueDepth: Math.round(baseline.queueDepth * (1 + m * 0.5)), activeProviders: Math.round(baseline.activeProviders * (1 + m * 0.3)), timestamp: new Date().toISOString() };
    case "pricing_increase":
      return { ...baseline, disputeOpenCount: Math.round(baseline.disputeOpenCount * (1 + m * 0.4)), timestamp: new Date().toISOString() };
    case "provider_surge":
      return { ...baseline, activeProviders: Math.round(baseline.activeProviders * (1 + m)), queueDepth: Math.round(baseline.queueDepth * (1 - m * 0.3)), timestamp: new Date().toISOString() };
    case "customer_churn":
      return { ...baseline, queueDepth: Math.round(baseline.queueDepth * (1 - m * 0.4)), payoutPendingCents: Math.round(baseline.payoutPendingCents * (1 - m * 0.3)), timestamp: new Date().toISOString() };
    case "seasonal_spike":
      return { ...baseline, queueDepth: Math.round(baseline.queueDepth * (1 + m * 2)), aiCallsPerMinute: Math.round(baseline.aiCallsPerMinute * (1 + m)), timestamp: new Date().toISOString() };
    case "contract_loss":
      return { ...baseline, payoutPendingCents: Math.round(baseline.payoutPendingCents * (1 - m * 0.5)), timestamp: new Date().toISOString() };
    default:
      return { ...baseline, timestamp: new Date().toISOString() };
  }
}

const SCENARIO_RECOMMENDATIONS: Record<ScenarioType, string> = {
  territory_expansion: "Ensure provider recruitment begins 60 days before launch; queue depth will rise ~50% at full magnitude",
  pricing_increase: "Gradual increases over 2 quarters reduce churn impact; communicate value first",
  provider_surge: "Provider oversupply reduces SLA risk but compresses per-provider earnings",
  customer_churn: "Revenue decline modeled; activate retention campaigns before churn exceeds 20%",
  seasonal_spike: "Pre-scale queue workers and AI call capacity 2 weeks ahead of peak demand",
  contract_loss: "Payout obligations decrease but GMV drops — identify replacement accounts in pipeline",
};

export function runSimulation(baseline: TwinState, params: ScenarioParams): SimulationResult {
  const projected = projectScenario(baseline, params);
  const queueDepthChange = projected.queueDepth - baseline.queueDepth;
  const revenueImpactCents = params.type === "customer_churn" || params.type === "contract_loss"
    ? -Math.round(baseline.payoutPendingCents * params.magnitude * 0.6)
    : Math.round(baseline.payoutPendingCents * params.magnitude * 0.2);

  return {
    baseline,
    projected,
    scenario: params,
    impact: {
      queueDepthChange,
      slaRiskChange: projected.slaBreachRisk !== baseline.slaBreachRisk ? `${baseline.slaBreachRisk} → ${projected.slaBreachRisk}` : "unchanged",
      revenueImpactCents,
      confidence: Math.round(70 + (1 - params.magnitude) * 20),
    },
    recommendation: SCENARIO_RECOMMENDATIONS[params.type] ?? "Review scenario parameters and re-run simulation",
  };
}
