// GET /api/admin/command-center — ops, revenue, automation, marketplace health scores;
//     executive summary; recommended actions — all computed from live Supabase metrics.
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import {
  calculateOpsHealthScore,
  calculateRevenueHealthScore,
  calculateAutomationHealthScore,
  calculateMarketplaceHealthScore,
  buildExecutiveSummary,
  buildRecommendedActions,
  type CommandCenterMetrics,
} from "@/lib/command-center";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  void request;
  const db = getAdminClient();

  const [
    activeJobsResult,
    unassignedJobsResult,
    slaBreachResult,
    disputesResult,
    paymentFailuresResult,
    payoutQueueResult,
    activeProvidersResult,
    totalProvidersResult,
    completedJobsResult,
    failedAutoResult,
    revenueResult,
    pricingFlagsResult,
  ] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["dispatched", "in_progress", "awaiting_match"]),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "awaiting_match"),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("sla_breached", true),
    db.from("disputes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "open"),
    db.from("payments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "failed"),
    db.from("payouts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "pending"),
    db.from("providers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "approved"),
    db.from("providers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "completed"),
    db.from("automation_queue").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "failed"),
    db.from("payments").select("amount_cents").eq("tenant_id", tenantId).eq("status", "paid").limit(500),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("pricing_flagged", true),
  ]);

  const totalRevenueCents = (revenueResult.data ?? []).reduce(
    (s: number, p: { amount_cents: number }) => s + (p.amount_cents ?? 0), 0
  );

  const metrics: CommandCenterMetrics = {
    gmvCents: totalRevenueCents,
    netRevenueCents: Math.round(totalRevenueCents * 0.12),
    commissionRevenueCents: Math.round(totalRevenueCents * 0.10),
    averageJobValueCents: (completedJobsResult.count ?? 0) > 0
      ? Math.round(totalRevenueCents / (completedJobsResult.count ?? 1)) : 0,
    activeJobs: activeJobsResult.count ?? 0,
    unassignedJobs: unassignedJobsResult.count ?? 0,
    slaBreaches: slaBreachResult.count ?? 0,
    paymentFailures: paymentFailuresResult.count ?? 0,
    payoutQueue: payoutQueueResult.count ?? 0,
    disputes: disputesResult.count ?? 0,
    providerSupplyGaps: Math.max(0, (unassignedJobsResult.count ?? 0) - (activeProvidersResult.count ?? 0)),
    churnRisk: 0,
    territoryReadiness: activeProvidersResult.count ?? 0,
    aiAgentActivity: 0,
    failedAutomations: failedAutoResult.count ?? 0,
    pricingFlags: pricingFlagsResult.count ?? 0,
    payoutHolds: payoutQueueResult.count ?? 0,
    refundRisk: 0,
    revenueLeakageAlerts: 0,
    activeProviders: activeProvidersResult.count ?? 0,
    totalProviders: totalProvidersResult.count ?? 0,
    completedJobs: completedJobsResult.count ?? 0,
  };

  const ops = calculateOpsHealthScore(metrics);
  const revenue = calculateRevenueHealthScore(metrics);
  const automation = calculateAutomationHealthScore(metrics);
  const marketplace = calculateMarketplaceHealthScore(metrics);
  const executive = buildExecutiveSummary({ metrics, ops, revenue, automation, marketplace });
  const actions = buildRecommendedActions(metrics);

  return NextResponse.json({
    tenantId,
    metrics,
    scores: { ops, revenue, automation, marketplace },
    executive,
    actions,
    generatedAt: new Date().toISOString(),
  });
}
