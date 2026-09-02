import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

export default async function AdminFranchisePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");

  const adminClient = await createAdminClient();

  // Fetch all franchise data for this admin's tenant
  const [territoriesResult, operatorsResult, scorecardsResult] = await Promise.all([
    adminClient
      .from("franchise_territories")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    adminClient
      .from("territory_operators")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    adminClient
      .from("territory_scorecards")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  type Territory = {
    id: string; name: string; city: string; state: string;
    zip_codes: string[]; status: string; created_at: string;
  };
  type Operator = {
    id: string; territory_id: string; profile_id: string | null;
    name: string; email: string | null; status: string; created_at: string;
  };
  type Scorecard = {
    id: string; territory_id: string; readiness_score: number;
    demand_index: number; supply_index: number; provider_count: number;
    jobs_completed: number; revenue_cents: number; dispute_rate: number;
    sla_hit_rate: number; active_customers: number; created_at: string;
  };

  const territories = (territoriesResult.data ?? []) as Territory[];
  const operators = (operatorsResult.data ?? []) as Operator[];
  const scorecards = (scorecardsResult.data ?? []) as Scorecard[];

  // Latest scorecard per territory
  const latestScorecard: Record<string, Scorecard> = {};
  for (const sc of scorecards) {
    if (!latestScorecard[sc.territory_id]) latestScorecard[sc.territory_id] = sc;
  }

  // Operators per territory
  const operatorsByTerritory: Record<string, Operator[]> = {};
  for (const op of operators) {
    if (!operatorsByTerritory[op.territory_id]) operatorsByTerritory[op.territory_id] = [];
    operatorsByTerritory[op.territory_id].push(op);
  }

  const active = territories.filter((t) => t.status === "active");
  const evaluating = territories.filter((t) => t.status === "evaluating");
  const totalRevenue = scorecards.reduce((s, sc) => s + (sc.revenue_cents ?? 0), 0);
  const avgReadiness = territories.length
    ? Math.round(
        territories.reduce((s, t) => s + (latestScorecard[t.id]?.readiness_score ?? 0), 0) / territories.length
      )
    : 0;

  function cents(v: number) {
    return "$" + (v / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function scoreColor(s: number) {
    if (s >= 80) return "text-green-400";
    if (s >= 60) return "text-yellow-400";
    return "text-red-400";
  }
  function statusBadge(s: string) {
    if (s === "active") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (s === "evaluating") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-white/10 text-white/50 border-white/10";
  }
  function opStatusBadge(s: string) {
    if (s === "approved") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (s === "candidate") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    return "bg-white/10 text-white/50 border-white/10";
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">
            ⚡ Admin
          </Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Franchise Management</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/dashboard" className="text-white/40 hover:text-white">Dashboard</Link>
          <Link href="/admin/growth" className="text-white/40 hover:text-white">Growth</Link>
          <Link href="/admin/command-center" className="text-white/40 hover:text-white">Command Center</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Franchise Management</h1>
        <p className="text-white/40 text-sm mb-8">
          All franchise territories, operators, and performance — admin view
        </p>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Territories", value: territories.length.toString(), color: "text-[#CCFF00]" },
            { label: "Active", value: active.length.toString(), color: "text-green-400" },
            { label: "Evaluating", value: evaluating.length.toString(), color: "text-yellow-400" },
            { label: "Avg Readiness", value: avgReadiness.toString(), color: avgReadiness >= 70 ? "text-green-400" : "text-yellow-400" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        {territories.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-gray-900 py-16 text-center text-white/40">
            No franchise territories yet. Territories are created via the expansion intelligence pipeline.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {territories.map((t) => {
              const sc = latestScorecard[t.id];
              const ops = operatorsByTerritory[t.id] ?? [];
              const approvedOps = ops.filter((o) => o.status === "approved");
              return (
                <Card key={t.id} className="bg-gray-900 border-white/10 text-white">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                        <div className="text-xs text-white/40 mt-0.5">{t.city}, {t.state}</div>
                      </div>
                      <Badge className={statusBadge(t.status)}>{t.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sc ? (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-white/40 mb-0.5">Readiness</div>
                          <div className={`font-bold text-base ${scoreColor(sc.readiness_score)}`}>{sc.readiness_score}</div>
                        </div>
                        <div>
                          <div className="text-white/40 mb-0.5">Revenue</div>
                          <div className="font-semibold text-[#CCFF00]">{cents(sc.revenue_cents)}</div>
                        </div>
                        <div>
                          <div className="text-white/40 mb-0.5">Jobs</div>
                          <div className="font-semibold">{sc.jobs_completed}</div>
                        </div>
                        <div>
                          <div className="text-white/40 mb-0.5">Providers</div>
                          <div className="font-semibold">{sc.provider_count}</div>
                        </div>
                        <div>
                          <div className="text-white/40 mb-0.5">SLA Hit</div>
                          <div className="font-semibold">{(sc.sla_hit_rate * 100).toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-white/40 mb-0.5">Disputes</div>
                          <div className={`font-semibold ${sc.dispute_rate > 0.05 ? "text-red-400" : ""}`}>
                            {(sc.dispute_rate * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-white/30 py-2 text-center">No scorecard data yet</div>
                    )}

                    {/* Operators */}
                    <div className="border-t border-white/10 pt-2">
                      <div className="text-xs text-white/40 mb-1.5">
                        Operators ({ops.length}) · {approvedOps.length} approved
                      </div>
                      {ops.length === 0 ? (
                        <div className="text-xs text-white/20">No operators assigned</div>
                      ) : (
                        <div className="space-y-1">
                          {ops.map((op) => (
                            <div key={op.id} className="flex items-center justify-between text-xs">
                              <span className="text-white/70">{op.name}</span>
                              <Badge className={`text-[10px] py-0 px-1.5 ${opStatusBadge(op.status)}`}>
                                {op.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-white/20">
                      Zips: {(t.zip_codes ?? []).slice(0, 4).join(", ")}
                      {(t.zip_codes ?? []).length > 4 ? ` +${(t.zip_codes ?? []).length - 4}` : ""}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Operator pipeline */}
        {operators.filter((o) => o.status === "candidate").length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-4">
              Operator Candidates ({operators.filter((o) => o.status === "candidate").length} pending review)
            </h2>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Email</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Territory</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {operators.filter((o) => o.status === "candidate").map((op) => {
                    const territory = territories.find((t) => t.id === op.territory_id);
                    return (
                      <tr key={op.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium">{op.name}</td>
                        <td className="px-4 py-3 text-white/60">{op.email ?? "—"}</td>
                        <td className="px-4 py-3 text-white/60">{territory?.name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Badge className={opStatusBadge(op.status)}>{op.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-white/30">
              Approve candidates via POST /api/admin/runtime with operator_approved event, or use the automation queue.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
