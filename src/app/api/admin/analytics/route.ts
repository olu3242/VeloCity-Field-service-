// GET /api/admin/analytics — operational analytics aggregate
// Exposes throughput snapshots, provider performance, workflow stats,
// payout/dispute analytics, and effectiveness scores.
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getRecentSnapshots,
  getThroughputTrend,
  getEffectivenessReport,
} from "@/lib/analytics/throughput-dashboard";
import {
  getTopProviders,
  getAtRiskProviders,
} from "@/lib/analytics/provider-analytics";
import {
  getTopWorkflows,
  getEffectivenessScore,
} from "@/lib/analytics/workflow-analytics";
import {
  getPayoutAnalytics,
  getDisputeAnalytics,
  getPlatformDisputeRate,
} from "@/lib/analytics/payout-dispute-analytics";

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
  const url = new URL(request.url);
  const snapshotLimit = Math.min(
    parseInt(url.searchParams.get("snapshots") ?? "20", 10),
    100
  );
  const providerLimit = Math.min(
    parseInt(url.searchParams.get("providers") ?? "10", 10),
    50
  );
  const workflowLimit = Math.min(
    parseInt(url.searchParams.get("workflows") ?? "10", 10),
    50
  );

  const throughput = {
    snapshots: getRecentSnapshots(snapshotLimit),
    trend: getThroughputTrend(),
    effectiveness: getEffectivenessReport(),
    effectivenessScore: getEffectivenessScore(),
  };

  const providers = {
    top: getTopProviders(tenantId, providerLimit),
    atRisk: getAtRiskProviders(),
  };

  const workflows = {
    top: getTopWorkflows(workflowLimit),
  };

  const financial = {
    payouts: getPayoutAnalytics(tenantId),
    disputes: getDisputeAnalytics(tenantId),
    platformDisputeRate: getPlatformDisputeRate(),
  };

  return NextResponse.json({
    tenantId,
    throughput,
    providers,
    workflows,
    financial,
    generatedAt: new Date().toISOString(),
  });
}
