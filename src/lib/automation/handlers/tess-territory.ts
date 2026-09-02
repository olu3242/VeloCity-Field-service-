// Handler: daily_territory_analysis → TESS market + serviceability analysis

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import { nova } from "@/lib/agents/nova";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
} from "@/types/automation";

export async function handleTessTerritory(
  rawPayload: AutomationPayload,
  _item: AutomationQueueItem
): Promise<HandlerResult> {
  const db = getAdminClient();

  // ── Gather territory data ────────────────────────────────
  const [{ data: recentJobs }, { data: providers }] = await Promise.all([
    db
      .from("jobs")
      .select("category, urgency, zip, city, state, status, created_at")
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
      .limit(200),
    db
      .from("providers")
      .select("categories, is_online, trust_score, service_radius_miles")
      .eq("status", "approved"),
  ]);

  const jobsByZip: Record<string, number> = {};
  const unfilledByCategory: Record<string, number> = {};

  for (const job of recentJobs ?? []) {
    jobsByZip[job.zip] = (jobsByZip[job.zip] ?? 0) + 1;
    if (job.status === "cancelled" || job.status === "expired") {
      unfilledByCategory[job.category] = (unfilledByCategory[job.category] ?? 0) + 1;
    }
  }

  const tessResult = await runAgent("TESS", {
    jobsByZip,
    unfilledByCategory,
    providerCount: providers?.length ?? 0,
    onlineProviders: providers?.filter((p) => p.is_online).length ?? 0,
    date: new Date().toISOString(),
  });

  // ── NOVA: per-territory market demand/supply/expansion intelligence ──
  // Same cron trigger as TESS's territory analysis — extends the existing
  // daily_territory_analysis handler rather than adding a new schedule.
  // Each compute* call persists its own market_demand/market_supply/
  // market_metrics/market_opportunities snapshot as a side effect.
  const { data: activeTerritories } = await db
    .from("franchise_territories")
    .select("id, name")
    .eq("status", "active");

  const novaSummaries: Array<{ territoryId: string; name: string; opportunityCount: number }> = [];
  for (const territory of activeTerritories ?? []) {
    await nova.assessMarketDemand(territory.id);
    await nova.assessMarketSupply(territory.id);
    const opportunities = await nova.recommendExpansionOpportunities(territory.id);
    novaSummaries.push({
      territoryId: territory.id,
      name: territory.name,
      opportunityCount: opportunities.opportunities?.length ?? 0,
    });
  }

  // Log to agent_logs (already done inside runAgent)
  // Store summary in audit_logs
  await db.from("audit_logs").insert({
    actor_type: "agent",
    actor_id: "TESS",
    action: "daily_territory_analysis",
    resource: "system",
    payload: {
      jobs_analyzed: recentJobs?.length ?? 0,
      providers_analyzed: providers?.length ?? 0,
      tess_output: tessResult.data,
      nova_territories_analyzed: novaSummaries,
    },
  });

  return {
    success: true,
    output: {
      event: "daily_territory_analysis",
      jobs_analyzed: recentJobs?.length ?? 0,
      unfilled_by_category: unfilledByCategory,
      tess_summary: tessResult.data,
      nova_territories_analyzed: novaSummaries,
    },
  };
}
