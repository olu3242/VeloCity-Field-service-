// /admin/revenue — Revenue Analytics Dashboard
// Server-rendered; reads from revenue_records, commission_ledger,
// metered_usage_events, and revenue-analytics lib.
// Admin-only.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { formatCents, formatDateTime } from "@/lib/utils";
import { getRevenueTrend, getRevenueHistory, getLatestRevenue } from "@/lib/revenue-infra/revenue-analytics";
import { getCommissionSummary, getCommissionsByTier } from "@/lib/revenue-infra/commission-engine";
import { getPlatformRevenue, getTopSpendingTenants } from "@/lib/revenue-infra/metered-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  return profile;
}

function trendBadge(trend: string) {
  if (trend === "growing") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
  if (trend === "declining") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

function statusBadge(settled: boolean) {
  return settled
    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
}

export default async function RevenueAnalyticsPage() {
  const profile = await getAdminProfile();
  const tenantId = getTenantId(profile);

  const period = new Date().toISOString().slice(0, 7);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getAdminClient();

  const [revenueResult, commissionResult, usageResult] = await Promise.all([
    supabase
      .from("revenue_records")
      .select("id, gross_amount_cents, platform_fee_cents, provider_payout_cents, net_platform_cents, franchise_royalty_cents, settled, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("commission_ledger")
      .select("id, provider_id, transaction_amount, commission_amount, tier, settled, recorded_at")
      .eq("tenant_id", tenantId)
      .order("recorded_at", { ascending: false })
      .limit(100),

    supabase
      .from("metered_usage_events")
      .select("metric_type, quantity, total_cost_usd, billing_period, recorded_at")
      .eq("tenant_id", tenantId)
      .eq("billing_period", period)
      .limit(500),
  ]);

  type RevenueRow = {
    id: string;
    gross_amount_cents: number;
    platform_fee_cents: number;
    provider_payout_cents: number;
    net_platform_cents: number;
    franchise_royalty_cents: number;
    settled: boolean;
    created_at: string;
  };

  type CommissionRow = {
    id: string;
    provider_id: string;
    transaction_amount: number;
    commission_amount: number;
    tier: string;
    settled: boolean;
    recorded_at: string;
  };

  type UsageRow = {
    metric_type: string;
    quantity: number;
    total_cost_usd: number;
    billing_period: string;
    recorded_at: string;
  };

  const records = (revenueResult.data ?? []) as RevenueRow[];
  const commissions = (commissionResult.data ?? []) as CommissionRow[];
  const usage = (usageResult.data ?? []) as UsageRow[];

  // Aggregate revenue
  const revTotals = records.reduce(
    (acc, r) => {
      acc.gross += r.gross_amount_cents;
      acc.fee += r.platform_fee_cents;
      acc.payout += r.provider_payout_cents;
      acc.net += r.net_platform_cents;
      acc.royalty += r.franchise_royalty_cents;
      if (!r.settled) acc.unsettled++;
      return acc;
    },
    { gross: 0, fee: 0, payout: 0, net: 0, royalty: 0, unsettled: 0 }
  );

  // Aggregate commissions
  const commTotals = commissions.reduce(
    (acc, c) => {
      acc.totalTransactions += c.transaction_amount;
      acc.totalCommissions += c.commission_amount;
      if (!c.settled) acc.unsettled++;
      return acc;
    },
    { totalTransactions: 0, totalCommissions: 0, unsettled: 0 }
  );

  // Aggregate usage by metric
  const usageByMetric: Record<string, { quantity: number; costUsd: number }> = {};
  let totalUsageCostUsd = 0;
  for (const u of usage) {
    if (!usageByMetric[u.metric_type]) usageByMetric[u.metric_type] = { quantity: 0, costUsd: 0 };
    usageByMetric[u.metric_type].quantity += Number(u.quantity);
    usageByMetric[u.metric_type].costUsd += Number(u.total_cost_usd);
    totalUsageCostUsd += Number(u.total_cost_usd);
  }

  // In-memory revenue analytics
  const trend = getRevenueTrend();
  const revenueHistory = getRevenueHistory(12);
  const latestRevenue = getLatestRevenue();
  const commissionSummary = getCommissionSummary(tenantId);
  const commissionsByTier = getCommissionsByTier();
  const platformRevenue = getPlatformRevenue(period);
  const topSpenders = getTopSpendingTenants(5);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Revenue Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              30-day window · {period}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${trendBadge(trend)}`}>
              {trend === "growing" ? "↑ Growing" : trend === "declining" ? "↓ Declining" : "→ Stable"}
            </span>
            <Link
              href="/admin/dashboard"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Admin
            </Link>
          </div>
        </div>

        {/* Revenue KPIs */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Gross Revenue (30d)", value: formatCents(revTotals.gross) },
            { label: "Platform Fees", value: formatCents(revTotals.fee) },
            { label: "Provider Payouts", value: formatCents(revTotals.payout) },
            { label: "Net Platform Revenue", value: formatCents(revTotals.net) },
            { label: "Unsettled Records", value: revTotals.unsettled, warn: revTotals.unsettled > 0 },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
              <div className={`text-xl font-semibold mt-1 ${s.warn ? "text-yellow-600 dark:text-yellow-400" : "text-gray-900 dark:text-white"}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Revenue Records */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recent Revenue Records</h2>
            {records.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No revenue records in the last 30 days.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Gross</th>
                      <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Fee</th>
                      <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Net</th>
                      <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {records.slice(0, 15).map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 tabular-nums text-gray-900 dark:text-white">{formatCents(r.gross_amount_cents)}</td>
                        <td className="py-1.5 tabular-nums text-gray-600 dark:text-gray-400">{formatCents(r.platform_fee_cents)}</td>
                        <td className="py-1.5 tabular-nums text-gray-900 dark:text-white">{formatCents(r.net_platform_cents)}</td>
                        <td className="py-1.5">
                          <span className={`rounded px-1.5 py-0.5 ${statusBadge(r.settled)}`}>
                            {r.settled ? "settled" : "pending"}
                          </span>
                        </td>
                        <td className="py-1.5 text-gray-400">{r.created_at.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Commission Ledger */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Commission Ledger</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Total: {formatCents(commTotals.totalCommissions)}
              </span>
            </div>

            {/* Tier breakdown */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {Object.entries(commissionsByTier).map(([tier, data]) => (
                <div key={tier} className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{tier}</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{formatCents(data.totalAmount)}</div>
                  <div className="text-xs text-gray-400">{data.count} records</div>
                </div>
              ))}
              {Object.keys(commissionsByTier).length === 0 && (
                <div className="col-span-3 text-xs text-gray-400 dark:text-gray-500">No commission data yet.</div>
              )}
            </div>

            {/* Recent commissions */}
            <div className="space-y-1.5">
              {commissions.slice(0, 8).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400 font-mono">{c.provider_id.slice(0, 8)}</span>
                  <span className="text-gray-500 dark:text-gray-400 capitalize">{c.tier}</span>
                  <span className="tabular-nums text-gray-900 dark:text-white">{formatCents(c.commission_amount)}</span>
                  <span className={`rounded px-1 py-0.5 ${statusBadge(c.settled)}`}>
                    {c.settled ? "✓" : "pending"}
                  </span>
                </div>
              ))}
              {commissions.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No commission records.</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Metered Usage */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Metered Usage — {period}</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Total: ${totalUsageCostUsd.toFixed(2)}
              </span>
            </div>
            {Object.keys(usageByMetric).length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No usage events recorded this period.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(usageByMetric).map(([metric, data]) => (
                  <div key={metric} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">{metric}</span>
                    <span className="text-gray-900 dark:text-white tabular-nums">{data.quantity.toLocaleString()}</span>
                    <span className="text-gray-500 dark:text-gray-400">${data.costUsd.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* In-memory Revenue Trend */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Revenue Trend (In-Memory)</h2>
            {revenueHistory.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No in-memory revenue periods yet. Call <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">recordRevenuePeriod()</code> to populate.
              </p>
            ) : (
              <div className="space-y-1.5">
                {revenueHistory.map((m) => (
                  <div key={m.period} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400 font-mono">{m.period}</span>
                    <span className="text-gray-900 dark:text-white tabular-nums">{formatCents(m.mrr)}</span>
                    <span className="text-gray-400">{m.tenantCount} tenants</span>
                    <span className="text-gray-500 dark:text-gray-400">{formatCents(Math.round(m.arpu))}/tenant</span>
                  </div>
                ))}
              </div>
            )}

            {latestRevenue && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                Latest: {formatCents(latestRevenue.totalRevenue)} total · ARPU {formatCents(Math.round(latestRevenue.arpu))}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-600 text-right">
          Revenue Analytics · {new Date().toISOString()}
        </div>
      </div>
    </div>
  );
}
