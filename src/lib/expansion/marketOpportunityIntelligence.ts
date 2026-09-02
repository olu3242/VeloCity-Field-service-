// Market Opportunity Intelligence (Batch X+3, Phase 3+4) — NOVA's expansion
// opportunity surfacing. Combines real demand/supply snapshots with the
// existing pure scoring functions (calculateTerritoryOpportunityScore,
// analyzeSupplyGap) rather than introducing a new scoring model, and
// persists market_metrics/market_opportunities (the existing
// franchise_territories.demand_index/supply_index columns, activated).

import { getAdminClient } from "@/lib/supabase/admin";
import { computeMarketDemand } from "./marketDemandIntelligence";
import { computeMarketSupply } from "./marketSupplyIntelligence";
import { calculateTerritoryOpportunityScore } from "./territoryOpportunityScore";
import { analyzeSupplyGap } from "./supplyGapAnalysis";
import type { ServiceCategory } from "@/types";

export interface MarketOpportunityItem {
  category: ServiceCategory | null;
  opportunityType: "new_territory" | "category_expansion" | "provider_recruitment" | "commercial_account";
  expectedRevenueImpactCents: number;
  detail: Record<string, unknown>;
}

export interface MarketOpportunityReport {
  territoryId: string;
  demandIndex: number;
  supplyIndex: number;
  opportunityScore: number;
  opportunities: MarketOpportunityItem[];
}

const AVG_JOB_VALUE_CENTS = 25000;

export async function computeMarketOpportunities(territoryId: string): Promise<MarketOpportunityReport> {
  const db = getAdminClient();

  const { data: territory } = await db
    .from("franchise_territories")
    .select("id, tenant_id, status")
    .eq("id", territoryId)
    .maybeSingle();

  if (!territory) {
    return { territoryId, demandIndex: 0, supplyIndex: 0, opportunityScore: 0, opportunities: [] };
  }

  const [demand, supply] = await Promise.all([computeMarketDemand(territoryId), computeMarketSupply(territoryId)]);

  const totalActualJobs = demand.reduce((sum, d) => sum + d.actualJobs, 0);
  const totalProviders = supply.reduce((sum, s) => sum + s.activeProviders, 0);
  const demandIndex = totalActualJobs;
  const supplyIndex = totalProviders;
  const providerGap = Math.max(0, demand.length ? totalActualJobs / 8 - totalProviders : 0);

  const { score: opportunityScore } = calculateTerritoryOpportunityScore({
    demandIndex,
    providerGap,
  });

  const opportunities: MarketOpportunityItem[] = [];

  for (const d of demand) {
    const matchingSupply = supply.find((s) => s.category === d.category);
    const gap = analyzeSupplyGap({
      category: d.category,
      expectedJobs: d.actualJobs,
      activeProviders: matchingSupply?.activeProviders ?? 0,
    });
    if (gap.severity === "high" || gap.severity === "medium") {
      opportunities.push({
        category: d.category,
        opportunityType: "provider_recruitment",
        expectedRevenueImpactCents: gap.providersNeeded * 8 * AVG_JOB_VALUE_CENTS,
        detail: { ...gap },
      });
    }
  }

  if (territory.status === "evaluating" && opportunityScore > 50) {
    opportunities.push({
      category: null,
      opportunityType: "new_territory",
      expectedRevenueImpactCents: Math.round(demandIndex * AVG_JOB_VALUE_CENTS * 0.3),
      detail: { opportunityScore, demandIndex, supplyIndex },
    });
  }

  if (opportunities.length) {
    await db.from("market_opportunities").insert(
      opportunities.map((o) => ({
        tenant_id: territory.tenant_id,
        territory_id: territoryId,
        category: o.category,
        opportunity_type: o.opportunityType,
        expected_revenue_impact_cents: o.expectedRevenueImpactCents,
        detail: o.detail,
      }))
    );
  }

  await db.from("market_metrics").upsert(
    {
      tenant_id: territory.tenant_id,
      territory_id: territoryId,
      metric_date: new Date().toISOString().split("T")[0],
      demand_index: demandIndex,
      supply_index: supplyIndex,
      opportunity_score: opportunityScore,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "territory_id,metric_date" }
  );

  return { territoryId, demandIndex, supplyIndex, opportunityScore, opportunities };
}
