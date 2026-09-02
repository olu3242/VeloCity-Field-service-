// GET /api/admin/revenue — commission ledger + metered usage summary
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import {
  getCommissionSummary,
  getCommissionsByTier,
  getTenantCommissions,
} from "@/lib/revenue-infra/commission-engine";
import {
  getTenantBill,
  getTopSpendingTenants,
  getPlatformRevenue,
} from "@/lib/revenue-infra/metered-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const supabase = getAdminClient();

  // Pull persisted commission records from Supabase
  const { data: dbCommissions } = await supabase
    .from("commission_ledger")
    .select("id, provider_id, transaction_amount, commission_rate, commission_amount, tier, settled, recorded_at")
    .eq("tenant_id", tenantId)
    .order("recorded_at", { ascending: false })
    .limit(100);

  // Pull persisted usage records from Supabase
  const { data: dbUsage } = await supabase
    .from("metered_usage_events")
    .select("id, metric_type, quantity, unit_cost_usd, total_cost_usd, billing_period, recorded_at")
    .eq("tenant_id", tenantId)
    .eq("billing_period", period)
    .order("recorded_at", { ascending: false })
    .limit(500);

  // Pull from revenue_records (existing table)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: revenueRecords } = await supabase
    .from("revenue_records")
    .select("gross_amount_cents, platform_fee_cents, provider_payout_cents, franchise_royalty_cents, net_platform_cents, settled, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", thirtyDaysAgo)
    .limit(500);

  // Aggregate revenue_records
  const revSummary = (revenueRecords ?? []).reduce(
    (acc, r) => {
      acc.grossCents += r.gross_amount_cents ?? 0;
      acc.platformFeeCents += r.platform_fee_cents ?? 0;
      acc.providerPayoutCents += r.provider_payout_cents ?? 0;
      acc.netPlatformCents += r.net_platform_cents ?? 0;
      if (!r.settled) acc.unsettledCount++;
      return acc;
    },
    { grossCents: 0, platformFeeCents: 0, providerPayoutCents: 0, netPlatformCents: 0, unsettledCount: 0 }
  );

  // In-memory summaries as fallback / supplementary data
  const commissionSummary = getCommissionSummary(tenantId);
  const commissionsByTier = getCommissionsByTier();
  const currentBill = getTenantBill(tenantId, period);
  const platformRevenue = getPlatformRevenue(period);

  // Aggregate persisted usage by metric
  const usageByMetric: Record<string, { quantity: number; totalCostUsd: number }> = {};
  for (const row of dbUsage ?? []) {
    const key = row.metric_type as string;
    if (!usageByMetric[key]) usageByMetric[key] = { quantity: 0, totalCostUsd: 0 };
    usageByMetric[key].quantity += Number(row.quantity);
    usageByMetric[key].totalCostUsd += Number(row.total_cost_usd);
  }

  return NextResponse.json({
    period,
    tenantId,
    revenueRecords: {
      count: revenueRecords?.length ?? 0,
      ...revSummary,
    },
    commissions: {
      fromDatabase: dbCommissions ?? [],
      summary: commissionSummary,
      byTier: commissionsByTier,
    },
    meteredUsage: {
      fromDatabase: dbUsage ?? [],
      byMetric: usageByMetric,
      bill: currentBill,
      platformRevenue,
    },
    generatedAt: new Date().toISOString(),
  });
}
