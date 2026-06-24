// Market Demand Intelligence (Batch X+3, Phase 3) — NOVA Demand Intelligence.
// Single write path for market_demand: computes per-category job demand for
// a franchise_territories row from real `jobs` rows (matched by zip) and
// persists a snapshot. Read-time computation, no parallel demand model.

import { getAdminClient } from "@/lib/supabase/admin";
import { SERVICE_CATEGORY_ICONS } from "@/lib/utils";
import type { ServiceCategory } from "@/types";

const ALL_CATEGORIES = Object.keys(SERVICE_CATEGORY_ICONS) as ServiceCategory[];
const WINDOW_DAYS = 30;

export interface MarketDemandCategoryReport {
  category: ServiceCategory;
  expectedJobs: number;
  actualJobs: number;
  demandGrowthRate: number;
}

export async function computeMarketDemand(territoryId: string): Promise<MarketDemandCategoryReport[]> {
  const db = getAdminClient();

  const { data: territory } = await db
    .from("franchise_territories")
    .select("id, tenant_id, zip_codes")
    .eq("id", territoryId)
    .maybeSingle();

  if (!territory) return [];

  const zipCodes: string[] = territory.zip_codes ?? [];
  if (!zipCodes.length) return [];

  const now = new Date();
  const recentStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const priorStart = new Date(now.getTime() - 2 * WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [{ data: recentJobs }, { data: priorJobs }] = await Promise.all([
    db.from("jobs").select("category").eq("tenant_id", territory.tenant_id).in("zip", zipCodes).gte("created_at", recentStart.toISOString()),
    db.from("jobs").select("category").eq("tenant_id", territory.tenant_id).in("zip", zipCodes).gte("created_at", priorStart.toISOString()).lt("created_at", recentStart.toISOString()),
  ]);

  const reports: MarketDemandCategoryReport[] = ALL_CATEGORIES.map((category) => {
    const actualJobs = (recentJobs ?? []).filter((j) => j.category === category).length;
    const expectedJobs = (priorJobs ?? []).filter((j) => j.category === category).length;
    const demandGrowthRate = expectedJobs > 0 ? (actualJobs - expectedJobs) / expectedJobs : actualJobs > 0 ? 1 : 0;
    return { category, expectedJobs, actualJobs, demandGrowthRate };
  }).filter((r) => r.expectedJobs > 0 || r.actualJobs > 0);

  if (reports.length) {
    await db.from("market_demand").upsert(
      reports.map((r) => ({
        tenant_id: territory.tenant_id,
        territory_id: territoryId,
        category: r.category,
        expected_jobs: r.expectedJobs,
        actual_jobs: r.actualJobs,
        demand_growth_rate: r.demandGrowthRate,
        computed_at: now.toISOString(),
      })),
      { onConflict: "territory_id,category,computed_at" }
    );
  }

  return reports;
}
