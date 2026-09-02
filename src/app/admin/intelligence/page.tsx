import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDateTime } from "@/lib/utils";
import { getTenantId } from "@/lib/tenancy";
import { computeMembershipRetentionIntelligence } from "@/lib/membership/membershipRetentionIntelligence";
import { computeRecurringRevenueIntelligence } from "@/lib/membership/membershipRevenueIntelligence";

function riskBadge(level: string) {
  if (level === "high") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (level === "medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-white/10 text-white/40 border-white/10";
}

function renewalUrgency(days: number) {
  if (days <= 7) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (days <= 14) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

export default async function AdminIntelligencePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const adminClient = await createAdminClient();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    retentionIntelligence,
    recurringRevenue,
    highRiskCustomers,
    atRiskProviders,
    missedRenewalOpportunities,
  ] = await Promise.all([
    computeMembershipRetentionIntelligence(tenantId),
    computeRecurringRevenueIntelligence(tenantId),

    // High churn-risk customers: no job in 90 days
    adminClient
      .from("profiles")
      .select("id, full_name, email, created_at")
      .eq("tenant_id", tenantId)
      .eq("role", "customer")
      .limit(200),

    // Providers at risk: high cancellation rate or low trust score
    adminClient
      .from("providers")
      .select("id, business_name, trust_score, cancellation_rate, status, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .or("cancellation_rate.gte.0.15,trust_score.lt.50")
      .order("cancellation_rate", { ascending: false })
      .limit(20),

    // Commercial contracts expiring in 30 days
    adminClient
      .from("commercial_contracts")
      .select("id, account_id, status, contract_value_cents, end_date, commercial_accounts(name)")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "at_risk"])
      .not("end_date", "is", null)
      .lte("end_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("end_date", { ascending: true })
      .limit(20),
  ]);

  // For churn risk, we need job recency per customer — do a secondary query
  const { data: recentJobCustomers } = await adminClient
    .from("jobs")
    .select("customer_id, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", ninetyDaysAgo);

  const recentCustomerIds = new Set((recentJobCustomers ?? []).map((j) => j.customer_id));
  const allCustomers = highRiskCustomers.data ?? [];
  const churnRiskCustomers = allCustomers
    .filter((c) => !recentCustomerIds.has(c.id))
    .slice(0, 20);

  const atRiskProviderList = (atRiskProviders.data ?? []) as Array<{
    id: string; business_name: string; trust_score: number | null; cancellation_rate: number | null; status: string;
  }>;

  type ContractRow = { id: string; account_id: string; status: string; contract_value_cents: number; end_date: string; commercial_accounts: { name: string } | null };
  const renewalContracts = (missedRenewalOpportunities.data ?? []) as unknown as ContractRow[];

  const totalChurnRisk = churnRiskCustomers.length;
  const totalAtRiskProviders = atRiskProviderList.length;
  const totalRenewals = retentionIntelligence.upcomingRenewals.length;
  const atRiskMembers = retentionIntelligence.atRiskMembers.length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Predictive Intelligence</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/executive" className="text-white/40 hover:text-white">Executive OS</Link>
          <Link href="/admin/mission-control" className="text-white/40 hover:text-white">Mission Control</Link>
          <Link href="/admin/command-center" className="text-white/40 hover:text-white">Command Center</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Predictive Intelligence</h1>
        <p className="text-white/40 text-sm mb-8">
          AI-driven risk signals and renewal forecasts across customers, providers, and contracts
        </p>

        {/* Risk summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Churn-Risk Customers", value: totalChurnRisk.toString(), color: totalChurnRisk > 0 ? "text-red-400" : "text-white/40" },
            { label: "At-Risk Members", value: atRiskMembers.toString(), color: atRiskMembers > 0 ? "text-yellow-400" : "text-white/40" },
            { label: "Renewals (30d)", value: totalRenewals.toString(), color: totalRenewals > 0 ? "text-blue-400" : "text-white/40" },
            { label: "At-Risk Providers", value: totalAtRiskProviders.toString(), color: totalAtRiskProviders > 0 ? "text-orange-400" : "text-white/40" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Revenue Forecast */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Revenue Forecast</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Current MRR</div>
                  <div className="font-bold text-lg text-[#CCFF00]">{formatCents(recurringRevenue.mrrCents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Next Period Forecast</div>
                  <div className="font-bold text-lg text-green-400">{formatCents(recurringRevenue.forecastedNextPeriodRevenueCents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Expansion Revenue</div>
                  <div className="font-semibold">{formatCents(recurringRevenue.expansionRevenueCents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Churn Rate</div>
                  <div className={`font-semibold ${recurringRevenue.churnRate > 0.1 ? "text-red-400" : recurringRevenue.churnRate > 0.05 ? "text-yellow-400" : "text-green-400"}`}>
                    {Math.round(recurringRevenue.churnRate * 100)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming membership renewals */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Membership Renewals (Next 30d)</CardTitle>
            </CardHeader>
            <CardContent>
              {retentionIntelligence.upcomingRenewals.length === 0 ? (
                <div className="text-white/30 text-sm py-4 text-center">No renewals due in the next 30 days.</div>
              ) : (
                <div className="space-y-2">
                  {retentionIntelligence.upcomingRenewals.slice(0, 8).map((r) => (
                    <div key={r.subscriptionId} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-white/70">{r.planName}</span>
                        <span className="text-white/30 ml-2">{new Date(r.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                      <Badge className={renewalUrgency(r.daysUntilRenewal)}>
                        {r.daysUntilRenewal}d
                      </Badge>
                    </div>
                  ))}
                  {retentionIntelligence.upcomingRenewals.length > 8 && (
                    <div className="text-white/30 text-xs text-center pt-1">
                      +{retentionIntelligence.upcomingRenewals.length - 8} more
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* At-risk membership members */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">At-Risk Members</CardTitle>
            </CardHeader>
            <CardContent>
              {retentionIntelligence.atRiskMembers.length === 0 ? (
                <div className="text-white/30 text-sm py-4 text-center">No at-risk members detected.</div>
              ) : (
                <div className="space-y-2">
                  {retentionIntelligence.atRiskMembers.slice(0, 8).map((m) => (
                    <div key={m.subscriptionId} className="flex items-center justify-between text-xs">
                      <div className="text-white/60 truncate max-w-[220px]">{m.reason}</div>
                      <Badge className={riskBadge(m.churnRiskLevel)}>{m.churnRiskLevel}</Badge>
                    </div>
                  ))}
                  {retentionIntelligence.atRiskMembers.length > 8 && (
                    <div className="text-white/30 text-xs text-center pt-1">
                      +{retentionIntelligence.atRiskMembers.length - 8} more
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Missed services */}
          {retentionIntelligence.missedServices.length > 0 && (
            <Card className="bg-gray-900 border-white/10 text-white">
              <CardHeader>
                <CardTitle className="text-sm">Missed Service Entitlements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {retentionIntelligence.missedServices.slice(0, 8).map((ms, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-white/60">{ms.serviceTypeName}</span>
                      <span className="text-white/40">
                        {ms.usedThisPeriod}/{ms.includedUsesPerPeriod} used · ends {new Date(ms.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Customers not active in 90 days */}
          {churnRiskCustomers.length > 0 && (
            <Card className="bg-gray-900 border-white/10 text-white">
              <CardHeader>
                <CardTitle className="text-sm">Customer Churn Risk (No job in 90d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {churnRiskCustomers.slice(0, 10).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <Link href={`/admin/customers/${c.id}`} className="text-white/70 hover:text-[#CCFF00] truncate max-w-[200px]">
                        {c.full_name ?? c.email ?? c.id}
                      </Link>
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">dormant</Badge>
                    </div>
                  ))}
                  {churnRiskCustomers.length > 10 && (
                    <div className="text-white/30 text-xs text-center pt-1">
                      +{churnRiskCustomers.length - 10} more
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* At-risk providers */}
          {atRiskProviderList.length > 0 && (
            <Card className="bg-gray-900 border-white/10 text-white">
              <CardHeader>
                <CardTitle className="text-sm">Provider Risk Signals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {atRiskProviderList.slice(0, 10).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <Link href={`/admin/providers/${p.id}`} className="text-white/70 hover:text-[#CCFF00] truncate max-w-[180px]">
                        {p.business_name}
                      </Link>
                      <div className="flex items-center gap-2">
                        {p.trust_score !== null && p.trust_score < 50 && (
                          <span className="text-red-400">trust {p.trust_score}</span>
                        )}
                        {p.cancellation_rate !== null && p.cancellation_rate >= 0.15 && (
                          <span className="text-orange-400">cancel {Math.round(p.cancellation_rate * 100)}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Commercial contract renewals */}
        {renewalContracts.length > 0 && (
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Commercial Contracts Expiring (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/40 text-xs border-b border-white/10">
                      <th className="text-left py-2 pr-4">Account</th>
                      <th className="text-left py-2 pr-4">Status</th>
                      <th className="text-left py-2 pr-4">Value</th>
                      <th className="text-left py-2">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {renewalContracts.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 pr-4 text-white/70">{c.commercial_accounts?.name ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <Badge className={c.status === "at_risk" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-green-500/20 text-green-400 border-green-500/30"}>
                            {c.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-[#CCFF00]">{formatCents(c.contract_value_cents)}</td>
                        <td className="py-2 text-white/40">{formatDateTime(c.end_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
