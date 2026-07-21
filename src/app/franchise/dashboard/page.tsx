import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

export default async function FranchiseDashboard() {
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

  // franchise_territories has no owner_user_id column; the owner-to-territory
  // link is through territory_operators.profile_id (migration 004).
  const { data: operatorRows } = await supabase
    .from("territory_operators")
    .select("territory_id")
    .eq("profile_id", user.id);

  const territoryIds = (operatorRows ?? []).map((r) => r.territory_id as string);

  const [territoriesData, revenueResult, jobCountResult, providerCountResult] =
    await Promise.all([
      territoryIds.length > 0
        ? supabase.from("franchise_territories").select("*").in("id", territoryIds).limit(20).then((r) => r.data ?? [])
        : Promise.resolve([]),
      // revenue_records has RLS policy: franchise_owner_id = auth.uid()
      supabase
        .from("revenue_records")
        .select("gross_amount_cents, franchise_royalty_cents")
        .eq("franchise_owner_id", user.id)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("providers").select("*", { count: "exact", head: true }).eq("status", "approved"),
    ]);

  const territories = (territoriesData ?? []) as Array<{
    id: string;
    name: string;
    city: string;
    state: string;
    zip_codes: string[];
    status: string;
  }>;

  const revenueRows = revenueResult.data ?? [];
  const monthlyGross = revenueRows.reduce((s, r) => s + (r.gross_amount_cents ?? 0), 0);
  const monthlyRoyalty = revenueRows.reduce((s, r) => s + (r.franchise_royalty_cents ?? 0), 0);
  const totalJobs = jobCountResult.count ?? 0;
  const activeProviders = providerCountResult.count ?? 0;

  function cents(v: number) {
    return "$" + (v / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Franchise Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-xl text-[#CCFF00]">
            ⚡ VeloCity Franchise
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/territory">Territory</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/jobs">Jobs</Link>
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
        <h1 className="text-2xl font-bold mb-8">Franchise Dashboard</h1>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            {
              label: "Territories",
              value: territories.length.toLocaleString(),
              color: "text-[#CCFF00]",
            },
            {
              label: "Completed Jobs",
              value: totalJobs.toLocaleString(),
              color: "text-white",
            },
            {
              label: "Active Providers",
              value: activeProviders.toLocaleString(),
              color: activeProviders > 0 ? "text-green-400" : "text-white",
            },
            {
              label: "30-Day Royalty",
              value: monthlyGross > 0 ? cents(monthlyRoyalty) : "$—",
              color: monthlyRoyalty > 0 ? "text-[#CCFF00]" : "text-white/40",
            },
          ].map((kpi) => (
            <StatCard
              key={kpi.label}
              variant="dark"
              label={kpi.label}
              value={kpi.value}
              valueClassName={kpi.color}
            />
          ))}
        </div>

        {/* Territory List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Territories</h2>
            <Button variant="outline" size="sm" asChild className="border-white/20 text-white/60 hover:text-white">
              <Link href="/franchise/territory">View Intelligence →</Link>
            </Button>
          </div>

          {territories.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-gray-900 py-12 text-center text-white/40">
              No territories assigned — contact your franchise administrator.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Territory</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Location</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Zip Codes</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {territories.map((t) => (
                    <tr key={t.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3 text-white/60">{t.city}, {t.state}</td>
                      <td className="px-4 py-3 text-white/40 text-xs">
                        {(t.zip_codes ?? []).slice(0, 4).join(", ")}
                        {(t.zip_codes ?? []).length > 4 ? ` +${(t.zip_codes ?? []).length - 4}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            t.status === "active"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-white/10 text-white/50 border-white/10"
                          }
                        >
                          {t.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 30-day revenue summary */}
        {monthlyGross > 0 && (
          <div className="mt-6 rounded-lg border border-white/10 bg-gray-900 p-4">
            <div className="flex justify-between text-sm text-white/60 mb-2">
              <span>30-Day Revenue Summary</span>
              <Link href="/franchise/revenue" className="text-[#CCFF00] hover:underline text-xs">
                Full report →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-white/40 text-xs mb-1">Gross Volume</div>
                <div className="font-semibold">{cents(monthlyGross)}</div>
              </div>
              <div>
                <div className="text-white/40 text-xs mb-1">Franchise Royalty</div>
                <div className="font-semibold text-[#CCFF00]">{cents(monthlyRoyalty)}</div>
              </div>
              <div>
                <div className="text-white/40 text-xs mb-1">Transactions</div>
                <div className="font-semibold">{revenueRows.length}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
