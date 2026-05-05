import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { emitEvent } from "@/lib/automation/emitEvent";
import { processAutomationQueue } from "@/lib/automation/worker";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  return runDailyIntelligence(request);
}

export async function POST(request: NextRequest) {
  return runDailyIntelligence(request);
}

async function runDailyIntelligence(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const supabase = await createAdminClient();
  const day = new Date().toISOString().slice(0, 10);
  const emitted: string[] = [];

  const [{ data: jobs }, { data: providers }, { data: serviceAreas }] = await Promise.all([
    supabase.from("jobs").select("id,customer_id,category,city,state,status,created_at").limit(500),
    supabase.from("providers").select("id,user_id,status,is_online,trust_score,categories").limit(500),
    supabase.from("service_areas").select("id,name,city,state").limit(100),
  ]);

  const activeJobs = (jobs ?? []).filter((job) => !["completed", "closed", "cancelled"].includes(job.status));
  const onlineProviders = (providers ?? []).filter((provider) => provider.status === "approved" && provider.is_online);

  await emitEvent(supabase, {
    type: "daily_territory_analysis",
    source: "cron.daily_intelligence",
    entityType: "service_area",
    dedupKey: `daily_territory_analysis:${day}`,
    payload: {
      day,
      active_jobs: activeJobs.length,
      online_providers: onlineProviders.length,
      service_area_count: serviceAreas?.length ?? 0,
      city: serviceAreas?.[0]?.city ?? activeJobs[0]?.city ?? "Unknown",
      state: serviceAreas?.[0]?.state ?? activeJobs[0]?.state ?? "NA",
    },
  });
  emitted.push("daily_territory_analysis");

  for (const provider of (providers ?? []).slice(0, 50)) {
    await emitEvent(supabase, {
      type: "provider_scoring_due",
      source: "cron.daily_intelligence",
      entityType: "provider",
      entityId: provider.id,
      dedupKey: `provider_scoring_due:${provider.id}:${day}`,
      payload: {
        provider_id: provider.id,
        provider_user_id: provider.user_id,
        status: provider.status,
        is_online: provider.is_online,
        trust_score: provider.trust_score,
        categories: provider.categories,
      },
    });
    emitted.push("provider_scoring_due");
  }

  const customers = Array.from(new Set((jobs ?? []).map((job) => job.customer_id).filter(Boolean))).slice(0, 50);
  for (const customerId of customers) {
    await emitEvent(supabase, {
      type: "retention_campaign_due",
      source: "cron.daily_intelligence",
      entityType: "profile",
      entityId: customerId,
      dedupKey: `retention_campaign_due:${customerId}:${day}`,
      payload: { customer_id: customerId, day },
    });
    emitted.push("retention_campaign_due");
  }

  if (activeJobs.length >= Math.max(5, onlineProviders.length * 2)) {
    await emitEvent(supabase, {
      type: "franchise_candidate_area_detected",
      source: "cron.daily_intelligence",
      entityType: "service_area",
      dedupKey: `franchise_candidate_area_detected:${day}`,
      payload: {
        day,
        active_jobs: activeJobs.length,
        online_providers: onlineProviders.length,
        severity: "high",
        recommendations: ["Review provider recruiting and franchise territory readiness."],
      },
    });
    emitted.push("franchise_candidate_area_detected");
  }

  const processed = await processAutomationQueue(supabase, 50);

  return NextResponse.json({
    emitted,
    emitted_count: emitted.length,
    processed,
  });
}
