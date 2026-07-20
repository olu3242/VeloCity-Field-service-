import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FranchiseTerritoryPage() {
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

  // Get territory IDs for this franchise owner
  const { data: operatorRows } = await supabase
    .from("territory_operators")
    .select("territory_id")
    .eq("profile_id", user.id);

  const territoryIds = (operatorRows ?? []).map((r) => r.territory_id as string);

  const [territoriesData, scorecardsData, recommendationsData, snapshotsData] =
    territoryIds.length > 0
      ? await Promise.all([
          supabase.from("franchise_territories").select("*").in("id", territoryIds).then((r) => r.data ?? []),
          supabase.from("territory_scorecards").select("*").in("territory_id", territoryIds).order("created_at", { ascending: false }).limit(50).then((r) => r.data ?? []),
          supabase.from("expansion_recommendations").select("*").in("territory_id", territoryIds).eq("status", "open").order("score", { ascending: false }).limit(10).then((r) => r.data ?? []),
          supabase.from("local_market_snapshots").select("*").in("territory_id", territoryIds).order("captured_at", { ascending: false }).limit(30).then((r) => r.data ?? []),
        ])
      : [[], [], [], []];

  type Territory = {
    id: string; name: string; city: string; state: string;
    zip_codes: string[]; status: string;
  };
  type Scorecard = {
    id: string; territory_id: string; demand_index: number; supply_index: number;
    provider_count: number; active_customers: number; jobs_completed: number;
    revenue_cents: number; dispute_rate: number; sla_hit_rate: number;
    readiness_score: number; period_start: string | null; period_end: string | null;
  };
  type Recommendation = {
    id: string; territory_id: string; recommendation_type: string;
    score: number; title: string; body: string; status: string;
  };
  type Snapshot = {
    id: string; territory_id: string; city: string; state: string; zip: string | null;
    category: string | null; demand_level: string; provider_supply_level: string;
    median_ticket_cents: number | null; captured_at: string;
  };

  const territories = territoriesData as Territory[];
  const scorecards = scorecardsData as Scorecard[];
  const recommendations = recommendationsData as Recommendation[];
  const snapshots = snapshotsData as Snapshot[];

  // Latest scorecard per territory
  const latestScorecard: Record<string, Scorecard> = {};
  for (const sc of scorecards) {
    if (!latestScorecard[sc.territory_id]) latestScorecard[sc.territory_id] = sc;
  }

  function cents(v: number) {
    return "$" + (v / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function pct(v: number) {
    return (v * 100).toFixed(1) + "%";
  }
  function scoreColor(s: number) {
    if (s >= 80) return "text-green-400";
    if (s >= 60) return "text-yellow-400";
    return "text-red-400";
  }
  function demandColor(d: string) {
    if (d === "high") return "text-green-400";
    if (d === "medium") return "text-yellow-400";
    return "text-white/40";
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
          <Button variant="ghost" size="sm" asChild className="text-[#CCFF00]">
            <Link href="/franchise/territory">Territory</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/revenue">Revenue</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/providers">Providers</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Territory Intelligence</h1>
        <p className="text-white/40 text-sm mb-8">
          {territories.length} territory{territories.length !== 1 ? "ies" : "y"} · scorecards, market snapshots, and expansion signals
        </p>

        {territories.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-gray-900 py-16 text-center text-white/40">
            No territories assigned — contact your franchise administrator.
          </div>
        ) : (
          <>
            {/* Territory scorecards */}
            <section className="mb-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-4">Territory Scorecards</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {territories.map((t) => {
                  const sc = latestScorecard[t.id];
                  return (
                    <Card key={t.id} className="bg-gray-900 border-white/10 text-white">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{t.name}</CardTitle>
                          <Badge
                            className={
                              t.status === "active"
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : "bg-white/10 text-white/50 border-white/10"
                            }
                          >
                            {t.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-white/40">{t.city}, {t.state}</div>
                      </CardHeader>
                      <CardContent>
                        {sc ? (
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="text-white/40 text-xs mb-1">Readiness</div>
                              <div className={`font-bold text-lg ${scoreColor(sc.readiness_score)}`}>{sc.readiness_score}</div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">Demand</div>
                              <div className="font-semibold">{sc.demand_index}</div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">Supply</div>
                              <div className="font-semibold">{sc.supply_index}</div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">Providers</div>
                              <div className="font-semibold">{sc.provider_count}</div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">Jobs Done</div>
                              <div className="font-semibold">{sc.jobs_completed}</div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">Revenue</div>
                              <div className="font-semibold text-[#CCFF00]">{cents(sc.revenue_cents)}</div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">SLA Hit</div>
                              <div className="font-semibold">{pct(sc.sla_hit_rate)}</div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">Dispute Rate</div>
                              <div className={`font-semibold ${sc.dispute_rate > 0.05 ? "text-red-400" : "text-white"}`}>
                                {pct(sc.dispute_rate)}
                              </div>
                            </div>
                            <div>
                              <div className="text-white/40 text-xs mb-1">Customers</div>
                              <div className="font-semibold">{sc.active_customers}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-white/30 text-sm py-4 text-center">
                            No scorecard yet — runs after first automation cycle.
                          </div>
                        )}
                        <div className="mt-3 text-xs text-white/30">
                          Zip codes: {(t.zip_codes ?? []).join(", ") || "—"}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            {/* Expansion recommendations */}
            {recommendations.length > 0 && (
              <section className="mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-4">
                  Expansion Recommendations ({recommendations.length} open)
                </h2>
                <div className="space-y-3">
                  {recommendations.map((rec) => {
                    const territory = territories.find((t) => t.id === rec.territory_id);
                    return (
                      <div key={rec.id} className="rounded-lg border border-white/10 bg-gray-900 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{rec.title}</span>
                              <Badge className="bg-white/10 text-white/50 border-white/10 text-xs">
                                {rec.recommendation_type}
                              </Badge>
                            </div>
                            <p className="text-sm text-white/50">{rec.body}</p>
                            {territory && (
                              <div className="text-xs text-white/30 mt-1">Territory: {territory.name}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-lg font-bold ${scoreColor(rec.score)}`}>{rec.score}</div>
                            <div className="text-xs text-white/30">score</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Market snapshots */}
            {snapshots.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-4">
                  Local Market Snapshots
                </h2>
                <div className="overflow-hidden rounded-lg border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-900 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-white/60 font-medium">Location</th>
                        <th className="px-4 py-3 text-left text-white/60 font-medium">Category</th>
                        <th className="px-4 py-3 text-left text-white/60 font-medium">Demand</th>
                        <th className="px-4 py-3 text-left text-white/60 font-medium">Supply</th>
                        <th className="px-4 py-3 text-left text-white/60 font-medium">Median Ticket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {snapshots.map((s) => (
                        <tr key={s.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-medium">
                            {s.city}, {s.state}{s.zip ? ` ${s.zip}` : ""}
                          </td>
                          <td className="px-4 py-3 text-white/60">{s.category ?? "—"}</td>
                          <td className={`px-4 py-3 font-medium ${demandColor(s.demand_level)}`}>
                            {s.demand_level}
                          </td>
                          <td className={`px-4 py-3 font-medium ${demandColor(s.provider_supply_level)}`}>
                            {s.provider_supply_level}
                          </td>
                          <td className="px-4 py-3 text-white/60">
                            {s.median_ticket_cents != null ? cents(s.median_ticket_cents) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {recommendations.length === 0 && snapshots.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-gray-900 py-10 text-center text-white/30 text-sm">
                Market intelligence will populate after the first daily intelligence cron run.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
