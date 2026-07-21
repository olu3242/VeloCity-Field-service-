import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

export default async function FranchiseRevenuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "franchise_owner") redirect("/dashboard");

  // revenue_records RLS: franchise_owner_id = auth.uid() (migration 20260530000001)
  const { data: revenueRows } = await supabase
    .from("revenue_records")
    .select(
      "id, job_id, event_type, gross_amount_cents, platform_fee_cents, provider_payout_cents, franchise_royalty_cents, net_platform_cents, franchise_territory_id, settled, created_at"
    )
    .eq("franchise_owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Get territory names for display
  const { data: operatorRows } = await supabase
    .from("territory_operators")
    .select("territory_id")
    .eq("profile_id", user.id);

  const territoryIds = (operatorRows ?? []).map((r) => r.territory_id as string);
  const territoriesData = territoryIds.length > 0
    ? (await supabase.from("franchise_territories").select("id, name").in("id", territoryIds)).data
    : [];

  type RevenueRow = {
    id: string; job_id: string | null; event_type: string;
    gross_amount_cents: number; platform_fee_cents: number;
    provider_payout_cents: number; franchise_royalty_cents: number;
    net_platform_cents: number; franchise_territory_id: string | null;
    settled: boolean; created_at: string;
  };

  const rows = (revenueRows ?? []) as RevenueRow[];
  const territoryMap: Record<string, string> = {};
  for (const t of (territoriesData ?? []) as { id: string; name: string }[]) {
    territoryMap[t.id] = t.name;
  }

  // Aggregates
  const totalGross = rows.reduce((s, r) => s + r.gross_amount_cents, 0);
  const totalRoyalty = rows.reduce((s, r) => s + r.franchise_royalty_cents, 0);
  const totalPayout = rows.reduce((s, r) => s + r.provider_payout_cents, 0);
  const totalPlatformFee = rows.reduce((s, r) => s + r.platform_fee_cents, 0);
  const unsettledRoyalty = rows
    .filter((r) => !r.settled)
    .reduce((s, r) => s + r.franchise_royalty_cents, 0);

  // 30-day slice
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30 = rows.filter((r) => new Date(r.created_at).getTime() >= thirtyDaysAgo);
  const last30Royalty = last30.reduce((s, r) => s + r.franchise_royalty_cents, 0);

  // Revenue by territory
  const byTerritory: Record<string, { name: string; gross: number; royalty: number; count: number }> = {};
  for (const r of rows) {
    const tid = r.franchise_territory_id ?? "unassigned";
    if (!byTerritory[tid]) byTerritory[tid] = { name: territoryMap[tid] ?? "Unassigned", gross: 0, royalty: 0, count: 0 };
    byTerritory[tid].gross += r.gross_amount_cents;
    byTerritory[tid].royalty += r.franchise_royalty_cents;
    byTerritory[tid].count += 1;
  }

  function cents(v: number) {
    return "$" + (v / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function date(s: string) {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/franchise/dashboard" className="font-bold text-xl text-[#CCFF00]">
            ⚡ VeloCity Franchise
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/dashboard">Dashboard</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/territory">Territory</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/jobs">Jobs</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-[#CCFF00]">
            <Link href="/franchise/revenue">Revenue</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/providers">Providers</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Revenue Intelligence</h1>
        <p className="text-white/40 text-sm mb-8">
          Franchise royalties, gross volume, and settlement status — sourced from <code className="text-white/30">revenue_records</code>
        </p>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "All-Time Royalty", value: cents(totalRoyalty), color: "text-[#CCFF00]" },
            { label: "30-Day Royalty", value: cents(last30Royalty), color: "text-[#CCFF00]" },
            { label: "Unsettled Royalty", value: cents(unsettledRoyalty), color: unsettledRoyalty > 0 ? "text-yellow-400" : "text-white/40" },
            { label: "All-Time Gross Volume", value: cents(totalGross), color: "text-white" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        {/* Revenue split card */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader><CardTitle className="text-sm">All-Time Revenue Split</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Gross Volume", value: totalGross, color: "text-white" },
                { label: "Provider Payouts", value: totalPayout, color: "text-white/60" },
                { label: "Platform Fee (before royalty)", value: totalPlatformFee, color: "text-white/60" },
                { label: "Franchise Royalty (yours)", value: totalRoyalty, color: "text-[#CCFF00]" },
                { label: "Net Platform (after royalty)", value: totalGross - totalPayout - totalRoyalty, color: "text-white/40" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between">
                  <span className="text-white/60">{item.label}</span>
                  <span className={`font-semibold ${item.color}`}>{cents(item.value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader><CardTitle className="text-sm">Revenue by Territory</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {Object.entries(byTerritory).length === 0 ? (
                <div className="text-white/30 text-center py-4">No data yet.</div>
              ) : (
                Object.entries(byTerritory)
                  .sort((a, b) => b[1].royalty - a[1].royalty)
                  .map(([tid, data]) => (
                    <div key={tid} className="flex justify-between">
                      <span className="text-white/60">{data.name} <span className="text-white/30">({data.count})</span></span>
                      <span className="font-semibold text-[#CCFF00]">{cents(data.royalty)}</span>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Transaction ledger */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-4">
            Transaction Ledger ({rows.length} records)
          </h2>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-gray-900 py-12 text-center text-white/30 text-sm">
              No revenue records yet. Revenue records are created when payments are captured via Stripe.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Date</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Event</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Territory</th>
                    <th className="px-4 py-3 text-right text-white/60 font-medium">Gross</th>
                    <th className="px-4 py-3 text-right text-white/60 font-medium">Royalty</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Settled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {rows.map((r) => (
                    <tr key={r.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-white/60">{date(r.created_at)}</td>
                      <td className="px-4 py-3 text-white/70">{r.event_type}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        {r.franchise_territory_id ? (territoryMap[r.franchise_territory_id] ?? "—") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{cents(r.gross_amount_cents)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#CCFF00]">
                        {cents(r.franchise_royalty_cents)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            r.settled
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                          }
                        >
                          {r.settled ? "settled" : "pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
