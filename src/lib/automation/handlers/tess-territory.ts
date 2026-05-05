// Handler: daily_territory_analysis → TESS market + serviceability analysis

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
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

  const tessData = tessResult.data as Record<string, unknown> | null;

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
    },
  });

  return {
    success: true,
    output: {
      event: "daily_territory_analysis",
      jobs_analyzed: recentJobs?.length ?? 0,
      unfilled_by_category: unfilledByCategory,
      tess_summary: tessResult.data,
    },
  };
}
