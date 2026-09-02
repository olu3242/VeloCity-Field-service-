import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

export default async function FranchiseJobsPage() {
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

  // Get territories and zip codes for this franchise owner
  const { data: operatorRows } = await supabase
    .from("territory_operators")
    .select("territory_id")
    .eq("profile_id", user.id);

  const territoryIds = (operatorRows ?? []).map((r) => r.territory_id as string);

  const territoriesData = territoryIds.length > 0
    ? (await supabase.from("franchise_territories").select("id, name, zip_codes").in("id", territoryIds)).data ?? []
    : [];

  type Territory = { id: string; name: string; zip_codes: string[] };
  const territories = territoriesData as Territory[];
  const allZipsSet = new Set(territories.flatMap((t) => t.zip_codes ?? []));
  const allZips = Array.from(allZipsSet);

  type Job = {
    id: string; title: string; category: string; status: string;
    zip: string | null; city: string | null; state: string | null;
    urgency: string; created_at: string; customer_id: string;
    provider_id: string | null;
  };

  let jobs: Job[] = [];
  if (allZips.length > 0) {
    // Jobs table has no franchise_owner RLS policy — use admin client for the
    // zip-based cross-table lookup, scoped to the franchise territory zip codes.
    const adminClient = await createAdminClient();
    const { data: jobData } = await adminClient
      .from("jobs")
      .select("id, title, category, status, zip, city, state, urgency, created_at, customer_id, provider_id")
      .in("zip", allZips)
      .order("created_at", { ascending: false })
      .limit(100);
    jobs = (jobData ?? []) as Job[];
  }

  // Aggregate stats
  const completed = jobs.filter((j) => j.status === "completed");
  const inProgress = jobs.filter((j) => ["in_progress", "accepted", "en_route", "arrived", "scheduled"].includes(j.status));
  const pending = jobs.filter((j) => ["draft", "submitted", "awaiting_match"].includes(j.status));

  function statusColor(s: string) {
    if (s === "completed") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (["in_progress", "en_route", "arrived"].includes(s)) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (["accepted", "scheduled"].includes(s)) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    if (["cancelled", "failed"].includes(s)) return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-white/10 text-white/50 border-white/10";
  }
  function urgencyColor(u: string) {
    if (u === "emergency") return "text-red-400";
    if (u === "urgent") return "text-orange-400";
    return "text-white/50";
  }

  // Map territory zip codes back to territory names
  const zipToTerritory: Record<string, string> = {};
  for (const t of territories) {
    for (const z of t.zip_codes ?? []) {
      zipToTerritory[z] = t.name;
    }
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
          <Button variant="ghost" size="sm" asChild className="text-[#CCFF00]">
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
        <h1 className="text-2xl font-bold mb-2">Jobs in Your Territories</h1>
        <p className="text-white/40 text-sm mb-8">
          All jobs where the service zip code falls within your assigned franchise territories
          {allZips.length > 0 && ` (${allZips.length} zip codes)`}
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
                { label: "Total Jobs", value: jobs.length.toString(), color: "text-white" },
                { label: "Completed", value: completed.length.toString(), color: "text-green-400" },
                { label: "In Progress", value: inProgress.length.toString(), color: "text-blue-400" },
                { label: "Pending", value: pending.length.toString(), color: "text-white/60" },
              ].map((kpi) => (
                <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
              ))}
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-gray-900 py-12 text-center text-white/30 text-sm">
                No jobs found in zip codes: {allZips.slice(0, 6).join(", ")}{allZips.length > 6 ? "..." : ""}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Job</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Category</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Status</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Urgency</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Location</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Territory</th>
                      <th className="px-4 py-3 text-left text-white/60 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {jobs.map((j) => (
                      <tr key={j.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium max-w-[200px] truncate">{j.title}</td>
                        <td className="px-4 py-3 text-white/60 capitalize">{(j.category ?? "—").replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">
                          <Badge className={statusColor(j.status)}>{j.status.replace(/_/g, " ")}</Badge>
                        </td>
                        <td className={`px-4 py-3 capitalize ${urgencyColor(j.urgency)}`}>{j.urgency}</td>
                        <td className="px-4 py-3 text-white/50 text-xs">
                          {[j.city, j.state, j.zip].filter(Boolean).join(", ")}
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs">
                          {j.zip ? (zipToTerritory[j.zip] ?? "—") : "—"}
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs">
                          {new Date(j.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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
