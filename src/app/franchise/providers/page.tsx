import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

export default async function FranchiseProvidersPage() {
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

  // Get territories for this franchise owner
  const { data: operatorRows } = await supabase
    .from("territory_operators")
    .select("territory_id")
    .eq("profile_id", user.id);

  const territoryIds = (operatorRows ?? []).map((r) => r.territory_id as string);

  const territoriesData = territoryIds.length > 0
    ? (await supabase.from("franchise_territories").select("id, name, zip_codes").in("id", territoryIds)).data
    : [];

  type Territory = { id: string; name: string; zip_codes: string[] };
  const territories = (territoriesData ?? []) as Territory[];
  const allZipsSet = new Set(territories.flatMap((t) => t.zip_codes ?? []));
  const allZips = Array.from(allZipsSet);

  // Find service areas whose zip_codes overlap the franchise territory zip codes.
  // service_areas has no RLS, so the auth client can read it freely.
  let providers: Array<{
    id: string; business_name: string; categories: string[]; status: string;
    trust_score: number; completed_jobs: number; cancellation_rate: number;
    is_online: boolean; service_area_ids: string[]; years_experience: number;
    response_time_minutes: number | null;
  }> = [];

  if (allZips.length > 0) {
    // Fetch service areas and filter to those with zip overlap
    const { data: serviceAreas } = await supabase
      .from("service_areas")
      .select("id, zip_codes")
      .eq("is_active", true);

    const matchingServiceAreaIds = (serviceAreas ?? [])
      .filter((sa) => (sa.zip_codes as string[]).some((z) => allZips.includes(z)))
      .map((sa) => sa.id as string);

    if (matchingServiceAreaIds.length > 0) {
      // Find providers whose service_area_ids overlaps the matching set
      const { data: providerData } = await supabase
        .from("providers")
        .select(
          "id, business_name, categories, status, trust_score, completed_jobs, cancellation_rate, is_online, service_area_ids, years_experience, response_time_minutes"
        )
        .overlaps("service_area_ids", matchingServiceAreaIds)
        .order("trust_score", { ascending: false })
        .limit(100);

      providers = (providerData ?? []) as typeof providers;
    }
  }

  // Aggregate stats
  const approved = providers.filter((p) => p.status === "approved");
  const online = providers.filter((p) => p.is_online);
  const avgTrust = approved.length
    ? approved.reduce((s, p) => s + (p.trust_score ?? 0), 0) / approved.length
    : 0;
  const totalCompletedJobs = providers.reduce((s, p) => s + (p.completed_jobs ?? 0), 0);

  function statusColor(s: string) {
    if (s === "approved") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (s === "pending") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-white/10 text-white/50 border-white/10";
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
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/franchise/revenue">Revenue</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-[#CCFF00]">
            <Link href="/franchise/providers">Providers</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Provider Management</h1>
        <p className="text-white/40 text-sm mb-8">
          Providers whose service areas overlap your franchise territories
          {allZips.length > 0 && ` (${allZips.length} zip codes across ${territories.length} territory${territories.length !== 1 ? "ies" : "y"})`}
        </p>

        {territories.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-gray-900 py-16 text-center text-white/40">
            No territories assigned — contact your franchise administrator.
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total Providers", value: providers.length.toString(), color: "text-white" },
                { label: "Approved", value: approved.length.toString(), color: "text-green-400" },
                { label: "Online Now", value: online.length.toString(), color: online.length > 0 ? "text-[#CCFF00]" : "text-white/40" },
                { label: "Avg Trust Score", value: avgTrust > 0 ? avgTrust.toFixed(2) : "—", color: avgTrust >= 0.75 ? "text-green-400" : "text-yellow-400" },
              ].map((kpi) => (
                <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
              ))}
            </div>

            {/* Territory coverage note */}
            <div className="mb-6 rounded-lg border border-white/10 bg-gray-900/50 px-4 py-3 text-xs text-white/40">
              <span className="text-white/60 font-medium">Territories covered:</span>{" "}
              {territories.map((t) => `${t.name} (${(t.zip_codes ?? []).join(", ")})`).join(" · ")}
              {` · ${totalCompletedJobs.toLocaleString()} total completed jobs across all providers`}
            </div>

            {providers.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-gray-900 py-12 text-center text-white/30 text-sm">
                No providers found for these territory zip codes. Providers are matched by their service area zip code overlap.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Business</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Categories</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Status</th>
                      <th className="px-4 py-3 text-right text-white/60 font-medium">Trust</th>
                      <th className="px-4 py-3 text-right text-white/60 font-medium">Jobs</th>
                      <th className="px-4 py-3 text-right text-white/60 font-medium">Cancel %</th>
                      <th className="px-4 py-3 text-right text-white/60 font-medium">Yrs Exp</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Online</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {providers.map((p) => (
                      <tr key={p.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium">{p.business_name}</td>
                        <td className="px-4 py-3 text-white/50 text-xs">
                          {(p.categories ?? []).slice(0, 2).join(", ")}
                          {(p.categories ?? []).length > 2 ? ` +${(p.categories ?? []).length - 2}` : ""}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={statusColor(p.status)}>{p.status}</Badge>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${p.trust_score >= 0.75 ? "text-green-400" : p.trust_score >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                          {(p.trust_score ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-white/70">{p.completed_jobs ?? 0}</td>
                        <td className="px-4 py-3 text-right text-white/70">
                          {((p.cancellation_rate ?? 0) * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right text-white/70">{p.years_experience ?? 0}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${p.is_online ? "text-green-400" : "text-white/30"}`}>
                            {p.is_online ? "Online" : "Offline"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
