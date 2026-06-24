// Market Supply Intelligence (Batch X+3, Phase 4) — NOVA Supply Intelligence.
// Single write path for market_supply: computes per-category active provider
// supply for a franchise_territories row from real `providers`/`service_areas`
// rows (matched by zip overlap) and persists a snapshot.

import { getAdminClient } from "@/lib/supabase/admin";
import { SERVICE_CATEGORY_ICONS } from "@/lib/utils";
import type { ServiceCategory } from "@/types";
import { computeMarketDemand } from "./marketDemandIntelligence";

const ALL_CATEGORIES = Object.keys(SERVICE_CATEGORY_ICONS) as ServiceCategory[];
const JOBS_PER_PROVIDER_CAPACITY = 8;

export interface MarketSupplyCategoryReport {
  category: ServiceCategory;
  activeProviders: number;
  avgResponseMinutes: number | null;
  capacityUtilization: number | null;
}

export async function computeMarketSupply(territoryId: string): Promise<MarketSupplyCategoryReport[]> {
  const db = getAdminClient();

  const { data: territory } = await db
    .from("franchise_territories")
    .select("id, tenant_id, zip_codes")
    .eq("id", territoryId)
    .maybeSingle();

  if (!territory) return [];

  const zipCodes: string[] = territory.zip_codes ?? [];
  if (!zipCodes.length) return [];

  const { data: areas } = await db.from("service_areas").select("id, zip_codes").eq("tenant_id", territory.tenant_id);
  const areaIds = (areas ?? [])
    .filter((a) => (a.zip_codes ?? []).some((z: string) => zipCodes.includes(z)))
    .map((a) => a.id);

  if (!areaIds.length) return [];

  const { data: providers } = await db
    .from("providers")
    .select("categories, response_time_minutes, status")
    .eq("tenant_id", territory.tenant_id)
    .overlaps("service_area_ids", areaIds)
    .eq("status", "active");

  const demand = await computeMarketDemand(territoryId);
  const demandByCategory = new Map(demand.map((d) => [d.category, d.actualJobs]));

  const reports: MarketSupplyCategoryReport[] = ALL_CATEGORIES.map((category) => {
    const matching = (providers ?? []).filter((p) => (p.categories ?? []).includes(category));
    const activeProviders = matching.length;
    const responseTimes = matching.map((p) => p.response_time_minutes).filter((v): v is number => typeof v === "number");
    const avgResponseMinutes = responseTimes.length ? responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length : null;
    const actualJobs = demandByCategory.get(category) ?? 0;
    const capacityUtilization = activeProviders > 0 ? Math.min(1, actualJobs / (activeProviders * JOBS_PER_PROVIDER_CAPACITY)) : null;
    return { category, activeProviders, avgResponseMinutes, capacityUtilization };
  }).filter((r) => r.activeProviders > 0);

  if (reports.length) {
    const now = new Date().toISOString();
    await db.from("market_supply").upsert(
      reports.map((r) => ({
        tenant_id: territory.tenant_id,
        territory_id: territoryId,
        category: r.category,
        active_providers: r.activeProviders,
        avg_response_minutes: r.avgResponseMinutes,
        capacity_utilization: r.capacityUtilization,
        computed_at: now,
      })),
      { onConflict: "territory_id,category,computed_at" }
    );
  }

  return reports;
}
